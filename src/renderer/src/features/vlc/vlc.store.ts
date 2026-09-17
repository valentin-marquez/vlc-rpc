import type { ConnectionStatus } from "@shared/app/app.types"
import type { VlcConfig } from "@shared/config/app-config"
import type { VlcConnectionReason } from "@shared/vlc/vlc.types"
import { atom } from "nanostores"

export const vlcConfigStore = atom<VlcConfig | null>(null)
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")

/**
 * Why the last connection check failed, distinct from vlcStatusStore's coarse
 * connected/disconnected/error. It is what decides how loudly the app reports
 * itself: see describeVlcConnection. Null until the first check comes back.
 */
export const vlcConnectionReasonStore = atom<VlcConnectionReason | null>(null)
