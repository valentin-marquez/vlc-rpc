import { electronAPI } from "@electron-toolkit/preload"
import { IpcChannels, IpcEvents } from "@shared/types"
import { contextBridge, ipcRenderer } from "electron"
import { exposeConf } from "electron-conf/preload"
import { exposeLogger } from "electron-winston/preload"

// Expose electron-conf to renderer
exposeConf()

// Expose electron-winston to renderer
exposeLogger()

// Custom APIs for renderer
const api = {
	config: {
		get: (key?: string) => ipcRenderer.invoke(`${IpcChannels.CONFIG}:${IpcEvents.CONFIG_GET}`, key),
		set: (key: string, value: unknown) =>
			ipcRenderer.invoke(`${IpcChannels.CONFIG}:${IpcEvents.CONFIG_SET}`, key, value),
	},
	metadata: {
		clearCache: () =>
			ipcRenderer.invoke(`${IpcChannels.METADATA}:${IpcEvents.METADATA_CLEAR_CACHE}`),
	},
	vlc: {
		getConfig: () => ipcRenderer.invoke(`${IpcChannels.VLC}:${IpcEvents.VLC_CONFIG_GET}`),
		setupConfig: (config: unknown) =>
			ipcRenderer.invoke(`${IpcChannels.VLC}:${IpcEvents.VLC_CONFIG_SET}`, config),
		getStatus: (forceUpdate = false) =>
			ipcRenderer.invoke(`${IpcChannels.VLC}:${IpcEvents.VLC_STATUS_GET}`, forceUpdate),
		checkStatus: () => ipcRenderer.invoke(`${IpcChannels.VLC}:${IpcEvents.VLC_STATUS_CHECK}`),
	},
	discord: {
		connect: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:connect`),
		disconnect: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:disconnect`),
		getStatus: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:status`),
		updatePresence: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:update`),
		startUpdateLoop: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:start-loop`),
		stopUpdateLoop: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:stop-loop`),
		reconnect: () => ipcRenderer.invoke(`${IpcChannels.DISCORD}:reconnect`),
	},
	media: {
		getEnhancedInfo: () => ipcRenderer.invoke(`${IpcChannels.MEDIA}:get-enhanced-info`),
	},
	image: {
		getAsDataUrl: (url: string) =>
			ipcRenderer.invoke(`${IpcChannels.IMAGE}:${IpcEvents.IMAGE_PROXY}`, url),
	},
	app: {
		minimize: () => ipcRenderer.invoke("window:minimize"),
		maximize: () => ipcRenderer.invoke("window:maximize"),
		close: () => ipcRenderer.invoke("window:close"),
		isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
		getPlatform: () => ipcRenderer.invoke("system:platform"),
		isPortable: () => ipcRenderer.invoke("app:isPortable"),
		onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
			const handler = (_: unknown, isMaximized: boolean) => callback(isMaximized)
			ipcRenderer.on("window:maximized-change", handler)

			// Return a cleanup function
			return () => {
				ipcRenderer.removeListener("window:maximized-change", handler)
			}
		},
	},
	update: {
		check: (silent = true) => ipcRenderer.invoke(`${IpcChannels.UPDATE}:check`, silent),
		download: () => ipcRenderer.invoke(`${IpcChannels.UPDATE}:download`),
		forceCheck: () => ipcRenderer.invoke(`${IpcChannels.UPDATE}:force-check`),
		getStatus: () => ipcRenderer.invoke(`${IpcChannels.UPDATE}:status`),
		getInstallationType: () => ipcRenderer.invoke(`${IpcChannels.UPDATE}:installation-type`),
		openCacheFolder: () => ipcRenderer.invoke(`${IpcChannels.UPDATE}:open-cache-folder`),
		onUpdateStatus: (callback: (event: string, data: unknown) => void) => {
			const handler = (_, status: string, data: unknown) => callback(status, data)

			// Listen for all update events
			ipcRenderer.on(`${IpcChannels.UPDATE}:checking-for-update`, (_, data) =>
				handler(_, "checking-for-update", data),
			)
			ipcRenderer.on(`${IpcChannels.UPDATE}:update-available`, (_, data) =>
				handler(_, "update-available", data),
			)
			ipcRenderer.on(`${IpcChannels.UPDATE}:update-not-available`, (_, data) =>
				handler(_, "update-not-available", data),
			)
			ipcRenderer.on(`${IpcChannels.UPDATE}:download-progress`, (_, data) =>
				handler(_, "download-progress", data),
			)
			ipcRenderer.on(`${IpcChannels.UPDATE}:update-downloaded`, (_, data) =>
				handler(_, "update-downloaded", data),
			)
			ipcRenderer.on(`${IpcChannels.UPDATE}:error`, (_, data) => handler(_, "error", data))

			// Return cleanup function
			return () => {
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:checking-for-update`)
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:update-available`)
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:update-not-available`)
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:download-progress`)
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:update-downloaded`)
				ipcRenderer.removeAllListeners(`${IpcChannels.UPDATE}:error`)
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
