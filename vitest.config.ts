import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
	resolve: {
		alias: {
			"@main": resolve("src/main"),
			"@renderer": resolve("src/renderer/src"),
			"@shared": resolve("src/shared"),
			"@resources": resolve("resources"),
		},
	},
})
