import type { ElectronAPI } from "@electron-toolkit/preload"
import type { AppConfig, VlcConfig } from "@shared/types"
import type { EnhancedMediaInfo } from "@shared/types/media"
import type { VlcConnectionStatus, VlcStatus } from "@shared/types/vlc"

declare global {
	interface Window {
		electron: ElectronAPI
		api: {
			config: {
				get: <T = AppConfig>(key?: string) => Promise<T>
				set: (key: string, value: unknown) => Promise<boolean>
			}
			metadata: {
				clearCache: () => Promise<boolean>
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
			}
			media: {
				getEnhancedInfo: () => Promise<(VlcStatus & EnhancedMediaInfo) | null>
			}
			image: {
				getAsDataUrl: (url: string) => Promise<string | null>
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
				openCacheFolder: () => Promise<void>
				onUpdateStatus: (callback: (event: string, data: any) => void) => () => void
			}
		}
	}
}
