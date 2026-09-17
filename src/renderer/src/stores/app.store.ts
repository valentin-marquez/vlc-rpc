import type { AppStatus } from "@shared/app/app.types"
import { atom } from "nanostores"

export const appStatusStore = atom<AppStatus>("idle")
