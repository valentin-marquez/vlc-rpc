import type { ElectronAPI } from "@electron-toolkit/preload"
import type { AppConfig, VlcConfig } from "@shared/config/app-config"
import type { OverrideDraft, OverrideListEntry, OverrideSaveResult } from "@shared/ipc/channels"
import type { DetectedMediaInfo } from "@shared/media/media.types"
import type { LastSentPresence } from "@shared/presence/presence.types"
import type { VlcConnectionStatus, VlcStatus } from "@shared/vlc/vlc.types"

declare global {
	interface Window {
		electron: ElectronAPI
		api: {
			config: {
				get: <T = AppConfig>(key?: string) => Promise<T>
				set: (key: string, value: unknown) => Promise<boolean>
			}
			metadata: {
				clearCache: () => Promise<{
					success: boolean
					message: string
					filesRemoved: number
				}>
			}
			vlc: {
				getConfig: () => Promise<VlcConfig>
				setupConfig: (config: VlcConfig) => Promise<boolean>
				getStatus: (forceUpdate?: boolean) => Promise<VlcStatus | null>
				checkStatus: () => Promise<VlcConnectionStatus>
			}
			discord: {
				connect: () => Promise<boolean>
				disconnect: () => Promise<boolean>
				getStatus: () => Promise<boolean>
				updatePresence: () => Promise<boolean>
				startUpdateLoop: () => Promise<boolean>
				stopUpdateLoop: () => Promise<boolean>
				reconnect: () => Promise<boolean>
				getLastPresence: () => Promise<LastSentPresence>
			}
			media: {
				getMediaInfo: () => Promise<(VlcStatus & DetectedMediaInfo) | null>
			}
			image: {
				getAsDataUrl: (url: string) => Promise<string | null>
			}
			overrides: {
				list: () => Promise<OverrideListEntry[]>
				save: (key: string, override: OverrideDraft) => Promise<OverrideSaveResult>
				remove: (key: string) => Promise<boolean>
			}
			app: {
				minimize: () => Promise<void>
				maximize: () => Promise<void>
				close: () => Promise<void>
				isMaximized: () => Promise<boolean>
				getPlatform: () => Promise<string>
				isPortable: () => Promise<boolean>
				onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
			}
			update: {
				check: (silent?: boolean) => Promise<boolean>
				download: () => Promise<boolean>
				forceCheck: () => Promise<boolean>
				getStatus: () => Promise<{
					isPortable: boolean
					updateCheckInProgress: boolean
					retryCount: number
					currentVersion: string
				}>
				getInstallationType: () => Promise<"portable" | "setup">
				install: () => Promise<boolean>
				openReleasePage: () => Promise<void>
				onUpdateStatus: (callback: (event: string, data: unknown) => void) => () => void
			}
		}
	}
}
