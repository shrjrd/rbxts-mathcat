import Jest from "@rbxts/jest";

const settings = {
	verbose: false,
	ci: false,
};

const projects = [script.Parent!];

const [status, result] = Jest.runCLI(script, settings, projects).awaitStatus();

if (status === "Rejected") error(result);

export = undefined;
