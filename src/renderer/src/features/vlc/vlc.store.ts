import type { ConnectionStatus } from "@shared/app/app.types"
import type { VlcConfig } from "@shared/config/app-config"
import { atom } from "nanostores"

export const vlcConfigStore = atom<VlcConfig | null>(null)
export const vlcStatusStore = atom<ConnectionStatus>("disconnected")
export const vlcErrorStore = atom<string | null>(null)
