import type { ConnectionStatus } from "@shared/app/app.types"
import { atom } from "nanostores"

export const discordStatusStore = atom<ConnectionStatus>("disconnected")
export const discordErrorStore = atom<string | null>(null)
export const discordUpdateLoopStore = atom<boolean>(false)
export const lastReconnectAttemptStore = atom<number>(0)
