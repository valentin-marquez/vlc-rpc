import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin, splitVendorChunkPlugin } from "electron-vite"

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "out/main",
			rollupOptions: {
				output: {
					// Improve chunking strategy for main process
					manualChunks(id) {
						if (id.includes("node_modules")) {
							return "vendor"
						}
						return undefined
					},
				},
			},
			// Source code protection - minify for production
			minify: process.env.NODE_ENV === "production",
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
			// Source code protection - minify for production
			minify: process.env.NODE_ENV === "production",
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
		// For renderer process, add splitVendorChunkPlugin for better performance
		plugins: [react(), tailwindcss(), splitVendorChunkPlugin()],
		build: {
			outDir: "out/renderer",
			rollupOptions: {
				output: {
					// Split chunks for renderer (React & UI libraries)
					manualChunks: {
						react: ["react", "react-dom"],
						radix: ["@radix-ui/react-icons"],
						ui: ["tailwindcss", "clsx", "tailwind-merge"],
					},
				},
			},
			// Source code protection - minify for production
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
