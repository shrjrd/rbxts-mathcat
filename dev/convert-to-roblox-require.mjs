import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Rewrites roblox-ts' runtime `TS.import(...)` / `TS.getModule(...)` calls in
// the compiled output into plain, RELATIVE `require(script...)` calls.
//
//   -- in out/init.luau:
//   TS.import(script, game:GetService("ReplicatedStorage"), "mathcat", "types")
//     -> require(script.types)
//
//   -- in out/vec3.luau (a sibling of Number):
//   TS.import(script, game:GetService("ReplicatedStorage"), "mathcat", "Number")
//     -> require(script.Parent.Number)
//
//   -- in out/tst/box3.test.luau (a node_modules dependency):
//   TS.import(script, TS.getModule(script, "@rbxts", "jest-globals").src)
//     -> require(script.Parent.Parent.rbxts_include.node_modules["@rbxts"]["jest-globals"].src)
//
// roblox-ts resolves imports through its runtime (`TS.import` / `TS.getModule`),
// and the exact base it emits depends on the compile: `--type game` (the dev
// build) uses an absolute `game:GetService("ReplicatedStorage")` base and spells
// node_modules out as keys; plain rbxtsc (the publish build) emits a relative
// `script.Parent...` base and a `TS.getModule(...)` runtime lookup. None of
// these are a clean relative require, so we rewrite them after the fact — every
// form is normalised to the same `require(script...)` output.
//
// How it works: from default.project.json we learn where each output folder is
// mounted in the DataModel (out -> the mathcat ModuleScript, and the
// node_modules folder that `TS.getModule` resolves against). That gives every
// .luau file and every import target a full DataModel instance path (relative
// `script.Parent` bases are resolved back to one too). The relative reference is
// then `script` + one `.Parent` per level up to the nearest common ancestor,
// plus the remaining keys back down.
//
// How far a relative path may climb depends on whether the file lives in a
// PUBLISHED tree (per package.json "files"). Published output (out) is a
// package that gets relocated when consumed, so its relative requires must stay
// within their own mount root (the mathcat ModuleScript); anything pointing
// outside falls back to a plain absolute `require(base["k1"]["k2"])` chain. For
// the same reason a published file's `TS.getModule` is LEFT runtime-resolved —
// the consumer controls where node_modules live. Unpublished output (out/tst)
// never moves, so its requires may climb to the shared service — making
// cross-tree imports relative too, e.g.
// `..., "mathcat", "Number"` -> require(script.Parent.Parent.mathcat.Number).
// Imports that don't even share a service stay absolute.
//
// Once every `TS.import` is a plain require, the runtime import line
// (`local TS = require(...RuntimeLib...)`, or `local TS = _G[script]` in package
// mode) is dead and removed — but ONLY when nothing else in the file still
// references `TS` (e.g. `TS.try`).
//
// Two spread-re-export (`export * from`) cleanups go along with this: the
// `or {}` nil-guard in `for _k, _v in require(...) or {} do` is dropped, and a
// types-only module whose body is `return nil` is changed to `return {}` so the
// now-unguarded loops can iterate it safely.
//
// Usage:
//   node dev/convert-to-roblox-require.mjs [--dry] [dir]
// Defaults to the `out` directory. Pass --dry (or
// --check) to preview without writing; exits non-zero in --dry mode if any file
// would change.
// ---------------------------------------------------------------------------

const PROJECT_FILE = resolve("default.project.json");
const PACKAGE_FILE = resolve("package.json");

// A `TS.import(script, <base>, "k1", "k2", ...)` call. The base (2nd arg) may
// contain parens, e.g. `game:GetService("ReplicatedStorage")`, so it is
// captured lazily and the trailing run of `, "string"` args is matched
// explicitly — a plain `[^)]*` would stop at the first inner `)`.
const TS_IMPORT_RE = /TS\.import\(\s*[^,()]+,\s*(.+?)((?:\s*,\s*"[^"]*")+)\s*\)/g;

// A node_modules import: `TS.getModule(script, "scope", "name", ...)` (which
// resolves to ReplicatedStorage.rbxts_include.node_modules[...]) wrapped in a
// `TS.import(script, ...)`, with optional trailing member accesses, e.g.
//   TS.import(script, TS.getModule(script, "@rbxts", "jest-globals").src)
// Group 1 captures the getModule string args; group 2 the trailing
// `.member` / `["member"]` accesses applied to the resolved package.
const TS_GETMODULE_IMPORT_RE =
	/TS\.import\(\s*[^,()]+,\s*TS\.getModule\(\s*[^,()]+((?:\s*,\s*"[^"]*")+)\s*\)((?:\.[A-Za-z_]\w*|\["[^"]*"\])*)\s*\)/g;

// A whole runtime-import line, including its newline. roblox-ts writes it as
// `local TS = require(...RuntimeLib...)` (--type game) or `local TS = _G[script]`
// (package mode).
const RUNTIME_IMPORT_RE =
	/^[ \t]*local TS = (?:require\([^\n]*RuntimeLib[^\n]*|_G\[script\][^\n]*)\r?\n/m;

// Any remaining use of the runtime namespace, e.g. `TS.try` (the import line
// itself is `TS = ...`, no dot, so it doesn't count as a use).
const TS_USE_RE = /\bTS\.\w/;

// roblox-ts guards spread re-exports (`export * from`) against a nil module with
// an `or {}` fallback: `for _k, _v in require(...) or {} do`. Once the import is
// a plain require the guard is just noise, so drop it. Anchored on `require` so
// other `or {}` defaults — and non-require iterators — are left alone.
const ITER_GUARD_RE = /(in require\([^\n]*\)) or \{\} do\b/g;

// A types-only / empty module compiles to a top-level `return nil`. Without the
// `or {}` guard above, a spread re-export over such a module would error on the
// nil, so return an empty table instead. Anchored at column 0 (`m` flag) so the
// module return is hit but indented `return nil` inside functions is not.
const MODULE_RETURN_NIL_RE = /^return nil$/gm;

// A `game:GetService("Service")` base expression.
const SERVICE_BASE_RE = /^game:GetService\("([^"]+)"\)$/;

// A relative `script` / `script.Parent` / `script.Parent.Parent` ... base, which
// roblox-ts emits when compiled as a package (plain rbxtsc).
const SCRIPT_BASE_RE = /^script((?:\s*\.\s*Parent)*)$/;

const IDENT_RE = /^[A-Za-z_]\w*$/;

// True when `file` is inside `dir` (or is `dir` itself).
const isInside = (file, dir) => {
	const rel = relative(dir, file);
	return rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
};

// Absolute output dirs that get published to npm (package.json "files", minus
// the "!" exclusions). Used to decide how far a file may relativize.
const readPublishedDirs = () => {
	const pkg = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
	return (pkg.files ?? [])
		.filter((f) => !f.startsWith("!"))
		.map((f) => resolve(f));
};

// Build the rojo mounts as [{ dir, instance, published }], where `dir` is an
// absolute output path ($path) and `instance` is its DataModel key path, e.g.
// ["ReplicatedStorage", "mathcat"]. Sorted longest-dir-first so the deepest
// mount wins for any file.
const readMounts = (publishedDirs) => {
	const project = JSON.parse(readFileSync(PROJECT_FILE, "utf8"));
	const mounts = [];
	const walk = (node, instance) => {
		if (typeof node !== "object" || node === null) return;
		if (typeof node.$path === "string") {
			const dir = resolve(node.$path);
			const published = publishedDirs.some((p) => isInside(dir, p));
			mounts.push({ dir, instance, published });
		}
		for (const [key, child] of Object.entries(node)) {
			if (key.startsWith("$")) continue;
			walk(child, [...instance, key]);
		}
	};
	// Rojo names the root instance after the project `name`, and a published
	// package is consumed as that single relocatable instance — so seed the walk
	// with it: `out` mounts at ["mathcat"], making out/box3.luau -> mathcat.box3
	// (a sibling of mathcat.common, hence `require(script.Parent.common)`). A
	// DataModel root is the exception: its children are top-level services.
	const root = project.tree ?? {};
	walk(root, root.$className === "DataModel" ? [] : [project.name]);
	return mounts.sort((a, b) => b.dir.length - a.dir.length);
};

// Locate a .luau file in the DataModel: its full instance path plus the mount
// it belongs to, or null when outside every mount. An `init.luau` IS its
// folder, so the file name is dropped.
const locate = (file, mounts) => {
	for (const mount of mounts) {
		const rel = relative(mount.dir, file);
		if (rel === "" || rel.startsWith("..") || rel.includes(":")) continue;
		const segments = rel.split(sep);
		const name = segments.pop().replace(/\.luau$/, "");
		if (name !== "init") segments.push(name);
		return { instance: [...mount.instance, ...segments], mount };
	}
	return null;
};

// Resolve a TS.import base expression to a DataModel instance path, or null when
// it's a shape we don't model. Handles `game:GetService("Service")` (absolute)
// and `script` / `script.Parent...` (relative, resolved against the file).
const resolveBase = (base, located) => {
	const service = base.match(SERVICE_BASE_RE)?.[1];
	if (service) return [service];
	const script = base.match(SCRIPT_BASE_RE);
	if (script && located) {
		const ups = (script[1].match(/Parent/g) ?? []).length;
		return located.instance.slice(0, located.instance.length - ups);
	}
	return null;
};

const access = (key) => (IDENT_RE.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

// Relative `script...` reference from `from` to `to`, or null when their nearest
// common ancestor is shallower than `minCommon` — i.e. the path would have to
// climb past the boundary we're willing to cross (see header).
const relativeRef = (from, to, minCommon) => {
	let common = 0;
	while (common < from.length && common < to.length && from[common] === to[common])
		common += 1;
	if (common < Math.max(minCommon, 1)) return null;
	const up = from.length - common;
	return `script${".Parent".repeat(up)}${to.slice(common).map(access).join("")}`;
};

// Absolute `game:GetService("Service")["k1"]["k2"]...` reference for an instance
// path [service, ...keys] — the fallback when a relative path isn't allowed.
const absoluteRef = ([service, ...keys]) =>
	`game:GetService(${JSON.stringify(service)})${keys.map((k) => `[${JSON.stringify(k)}]`).join("")}`;

// Reference to an instance: relative when within the climb boundary, else absolute.
const refTo = (instance, from, minCommon) =>
	(from && relativeRef(from, instance, minCommon)) || absoluteRef(instance);

// The node_modules folder's instance path, derived from any package mount under
// it (e.g. .../node_modules/@rbxts). `TS.getModule` lookups resolve against it.
const nodeModulesInstance = (mounts) => {
	for (const { instance } of mounts) {
		const i = instance.indexOf("node_modules");
		if (i >= 0) return instance.slice(0, i + 1);
	}
	return null;
};

const rewrite = (file, mounts, nodeModules) => {
	const located = locate(file, mounts);
	const from = located?.instance ?? null;
	const before = readFileSync(file, "utf8");
	let count = 0;

	// Published packages may only relativize within their own mount root; test
	// (unpublished) trees may climb to the shared service.
	const minCommon = located
		? located.mount.published
			? located.mount.instance.length
			: 1
		: Infinity;

	// 1) node_modules imports — TS.import(script, TS.getModule(...).member...).
	// Run first: the getModule's string args would otherwise be mis-parsed as
	// trailing keys by TS_IMPORT_RE below. In a PUBLISHED package the consumer
	// controls where node_modules live, so getModule must stay runtime-resolved;
	// only rewrite it for unpublished (test) trees, whose layout is fixed.
	let body = before.replace(TS_GETMODULE_IMPORT_RE, (match, args, members) => {
		if (!nodeModules || !located || located.mount.published) return match;
		const keys = [...args.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
		const accessed = [...members.matchAll(/\.([A-Za-z_]\w*)|\["([^"]*)"\]/g)].map(
			(m) => m[1] ?? m[2],
		);
		count += 1;
		return `require(${refTo([...nodeModules, ...keys, ...accessed], from, minCommon)})`;
	});

	// 2) in-tree imports — TS.import(script, <base>, "k1", "k2", ...) where base
	// is a service (`game:GetService(...)`, --type game) or already relative
	// (`script.Parent...`, package mode). Both are normalised to a clean require.
	body = body.replace(TS_IMPORT_RE, (match, base, rest) => {
		const baseInstance = resolveBase(base.trim(), located);
		if (!baseInstance) return match; // unmodelled base (e.g. leftover getModule)
		const keys = [...rest.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
		count += 1;
		return `require(${refTo([...baseInstance, ...keys], from, minCommon)})`;
	});

	// Strip the `or {}` nil-guard from spread re-exports over a require, and make
	// a `return nil` module return `{}` so those guard-free loops can iterate it.
	body = body.replace(ITER_GUARD_RE, "$1 do").replace(MODULE_RETURN_NIL_RE, "return {}");

	// Drop the now-unused runtime import unless something still needs `TS`.
	const after = TS_USE_RE.test(body) ? body : body.replace(RUNTIME_IMPORT_RE, "");

	return after === before ? null : { after, count };
};

const args = process.argv.slice(2);
const dryRun = args.some((a) => a === "--dry" || a === "--check");
const targetDir = resolve(args.find((a) => !a.startsWith("--")) ?? "out");

// Collect every .luau file under the target directory.
const luauFiles = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return luauFiles(full);
		return entry.isFile() && entry.name.endsWith(".luau") ? [full] : [];
	});

const mounts = readMounts(readPublishedDirs());
const nodeModules = nodeModulesInstance(mounts);
let changedFiles = 0;
let rewrittenCalls = 0;

for (const file of luauFiles(targetDir)) {
	const result = rewrite(file, mounts, nodeModules);
	if (!result) continue;

	changedFiles += 1;
	rewrittenCalls += result.count;
	if (!dryRun) writeFileSync(file, result.after);

	const action = result.count
		? `${dryRun ? "would rewrite" : "rewrote"} ${result.count}`
		: `${dryRun ? "would clean" : "cleaned"}`;
	console.log(`${action}\t${relative(process.cwd(), file)}`);
}

console.log(
	`\n${dryRun ? "Would rewrite" : "Rewrote"} ${rewrittenCalls} import(s) across ${changedFiles} file(s) in ${relative(process.cwd(), targetDir) || "."}`,
);

if (dryRun && changedFiles > 0) process.exitCode = 1;
