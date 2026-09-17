import { electronAPI } from "@electron-toolkit/preload"
import type { UpdateAvailability } from "@shared/updates/update.types"
import { contextBridge } from "electron"
import { exposeLogger } from "electron-winston/preload"
import { onEvent, typedInvoke } from "./typed-bridge"

// The renderer logs through electron-winston, and reads config through the
// typed bridge below rather than through electron-conf's own renderer client.
exposeLogger()

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
		getLastPresence: typedInvoke("discord:presence:last"),
	},
	media: {
		getMediaInfo: typedInvoke("media:get-info"),
	},
	image: {
		getAsDataUrl: typedInvoke("image:proxy"),
	},
	overrides: {
		list: typedInvoke("overrides:list"),
		save: typedInvoke("overrides:save"),
		remove: typedInvoke("overrides:delete"),
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
		getStatus: typedInvoke("update:status"),
		getCurrent: typedInvoke("update:current"),
		getInstallationType: typedInvoke("update:installation-type"),
		openReleasePage: typedInvoke("update:open-release-page"),
		onAvailability: (callback: (availability: UpdateAvailability) => void) => {
			return onEvent("update:availability", callback)
		},
	},
}

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
