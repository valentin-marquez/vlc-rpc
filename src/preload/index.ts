import { electronAPI } from "@electron-toolkit/preload"
import { contextBridge } from "electron"
import { exposeConf } from "electron-conf/preload"
import { exposeLogger } from "electron-winston/preload"
import { onEvent, typedInvoke } from "./typed-bridge"

// Expose electron-conf to renderer
exposeConf()

// Expose electron-winston to renderer
exposeLogger()

// Custom APIs for renderer
const api = {
	config: {
		get: typedInvoke("config:get"),
		set: typedInvoke("config:set"),
	},
	metadata: {
		clearCache: typedInvoke("metadata:clear-cache"),
	},
	vlc: {
		getConfig: typedInvoke("vlc:config:get"),
		setupConfig: typedInvoke("vlc:config:set"),
		getStatus: typedInvoke("vlc:status:get"),
		checkStatus: typedInvoke("vlc:status:check"),
	},
	discord: {
		connect: typedInvoke("discord:connect"),
		disconnect: typedInvoke("discord:disconnect"),
		getStatus: typedInvoke("discord:status"),
		updatePresence: typedInvoke("discord:update"),
		startUpdateLoop: typedInvoke("discord:start-loop"),
		stopUpdateLoop: typedInvoke("discord:stop-loop"),
		reconnect: typedInvoke("discord:reconnect"),
	},
	media: {
		getMediaInfo: typedInvoke("media:get-info"),
	},
	image: {
		getAsDataUrl: typedInvoke("image:proxy"),
	},
	app: {
		minimize: typedInvoke("window:minimize"),
		maximize: typedInvoke("window:maximize"),
		close: typedInvoke("window:close"),
		isMaximized: typedInvoke("window:is-maximized"),
		getPlatform: typedInvoke("system:platform"),
		isPortable: typedInvoke("app:is-portable"),
		onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
			return onEvent("window:maximized-change", callback)
		},
	},
	update: {
		check: typedInvoke("update:check"),
		download: typedInvoke("update:download"),
		forceCheck: typedInvoke("update:force-check"),
		getStatus: typedInvoke("update:status"),
		getInstallationType: typedInvoke("update:installation-type"),
		openCacheFolder: typedInvoke("update:open-cache-folder"),
		onUpdateStatus: (callback: (event: string, data: unknown) => void) => {
			const unsubs = [
				onEvent("update:checking-for-update", (data) => callback("checking-for-update", data)),
				onEvent("update:update-available", (data) => callback("update-available", data)),
				onEvent("update:update-not-available", (data) => callback("update-not-available", data)),
				onEvent("update:download-progress", (data) => callback("download-progress", data)),
				onEvent("update:update-downloaded", (data) => callback("update-downloaded", data)),
				onEvent("update:error", (data) => callback("error", data)),
			]

			return () => {
				for (const unsub of unsubs) unsub()
			}
		},
	},
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI)
		contextBridge.exposeInMainWorld("api", api)
	} catch (error) {
		console.error(error)
	}
} else {
	// @ts-ignore (define in dts)
	window.electron = electronAPI
	// @ts-ignore (define in dts)
	window.api = api
}
