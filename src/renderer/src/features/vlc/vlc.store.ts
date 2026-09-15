import type { ConnectionStatus } from "@shared/app/app.types"
import type { VlcConfig } from "@shared/config/app-config"
import type { VlcConnectionReason } from "@shared/vlc/vlc.types"
import { atom } from "nanostores"

export const vlcConfigStore = atom<VlcConfig | null>(null)
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")
export const vlcErrorStore = atom<string | null>(null)

/**
 * Why the last connection check failed, distinct from vlcStatusStore's coarse
 * connected/disconnected/error. "not-configured" is the one reason the app
 * can fix on its own: VLC's HTTP interface is off in vlcrc.
 */
export const vlcConnectionReasonStore = atom<VlcConnectionReason | null>(null)
