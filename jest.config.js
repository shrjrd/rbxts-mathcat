import { defineConfig } from "@isentinel/jest-roblox";

export default defineConfig({
	backend: "studio",
	jestPath: "ReplicatedStorage/rbxts_include/node_modules/@rbxts/jest/src",
	luauRoots: ["out"],
	timeout: 60000,
	rojoProject: "dev.project.json",
	test: {
		collectCoverageFrom: [
			"src/**/*.ts",
		],
		projects: [
			{
				test: {
					displayName: { name: "mathcat", color: "magenta" },
					include: ["src/tst/**/*.test.ts"],
					outDir: "out/tst",
					setupFiles: ["./out/tst/jest.setup"],
					testTimeout: 5000,
				},
			},
		],
	},
});
