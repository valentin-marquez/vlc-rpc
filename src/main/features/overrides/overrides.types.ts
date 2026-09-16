/**
 * A correction the user typed by hand: what this file really is, against what
 * the app deduced. It always wins over a resolver result, it is never scored.
 */
interface OverrideBase {
	// Kept so a later change to the parser, which moves every key, can migrate
	// the overrides it orphaned. Never read to look one up.
	sourceFilename: string
	savedAt: number
}

/**
 * `presence.state.ts` pivots on `mediaKind` to decide whether to format as a
 * series or a film, so all three fields reach the presence.
 */
export interface VideoOverride extends OverrideBase {
	kind: "video"
	title?: string | undefined
	cover?: string | undefined
	mediaKind?: "movie" | "tv" | undefined
}

/**
 * No title: audio presence text is built from the file's own tags through
 * `applyTemplate`, never from a resolver title, so a title override here
 * would have no consumer. Cover is required, an audio override with no
 * cover corrects nothing.
 */
export interface AudioOverride extends OverrideBase {
	kind: "audio"
	cover: string
}

export type Override = VideoOverride | AudioOverride

// A plain Omit collapses to the fields shared by every branch, which would
// erase the union. This applies Omit to each branch and rejoins them.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export type OverrideInput = DistributiveOmit<Override, "savedAt">

/** An override together with the key it is bound to, which Settings shows. */
export interface OverrideEntry {
	key: string
	override: Override
}
