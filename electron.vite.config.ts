import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/main",
			minify: false,
			assetsInlineLimit: 0,
			rollupOptions: {
				output: {
					assetFileNames: "chunks/[name]-[hash][extname]",
				},
			},
		},
		resolve: {
			alias: {
				"@main": resolve("src/main"),
				"@shared": resolve("src/shared"),
				"@resources": resolve("resources"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/preload",
			minify: false,
		},
		resolve: {
			alias: {
				"@preload": resolve("src/preload"),
				"@shared": resolve("src/shared"),
				"@resources": resolve("resources"),
			},
		},
	},
	renderer: {
		plugins: [react(), tailwindcss()],
		build: {
			outDir: "out/renderer",
			minify: true,
		},
		resolve: {
			alias: {
				"@renderer": resolve("src/renderer/src"),
				"@shared": resolve("src/shared"),
				"@resources": resolve("resources"),
			},
		},
	},
})
