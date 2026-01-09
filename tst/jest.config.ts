import { Config } from "@rbxts/jest";
import setupTestsModule from "./jest.setup";

export = {
	clearMocks: true,
	testMatch: ["**/*.test"],
	setupFiles: [setupTestsModule],
} satisfies Config;
