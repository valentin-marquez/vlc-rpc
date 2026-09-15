import type { VlcConfig } from "@shared/config/app-config"

/**
 * Result of reading vlcrc, distinct from falling back to the app's own
 * stored config. Whoever calls this needs to tell "vlcrc says X" apart from
 * "could not read vlcrc, assuming X", or a missing file reads as agreement.
 */
export type VlcConfigRead =
	| { found: true; config: VlcConfig }
	| { found: false; reason: "not-found" | "unresolved-path" | "read-error" }
