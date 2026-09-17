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
 * No title: audio presence text is built from the file's own tags, never from a
 * resolver title, so a title override here would have no consumer. Cover is
 * required, an audio override with no cover corrects nothing.
 *
 * That reasoning holds only while the tags exist. When they do not, the branch
 * below applies instead.
 */
export interface AudioOverride extends OverrideBase {
	kind: "audio"
	cover: string
}

/**
 * Audio whose tags name nothing, where the correction supplies what the file
 * is rather than only what it looks like.
 *
 * A separate branch and not three optional fields on `AudioOverride`, because
 * the asymmetry above is still right for a file that does carry tags: a title
 * typed there would be written and never read. Here the typed values are the
 * only thing the presence text has to read, and the only thing a catalog can
 * be searched with, so the compiler is the thing that keeps each shape where
 * it belongs.
 *
 * The cover stays optional and last. The point of taking the tags is that the
 * ordinary lookup then runs and finds the artwork itself, which beats sending
 * the user off to find an image that iTunes would have handed over for free.
 * It is there for the file no catalog knows at all.
 */
export interface UntaggedAudioOverride extends OverrideBase {
	kind: "untagged-audio"
	title?: string | undefined
	artist?: string | undefined
	cover?: string | undefined
}

export type Override = VideoOverride | AudioOverride | UntaggedAudioOverride

/**
 * What a correction says a file is, for audio that says nothing itself. The
 * presence text is built from tags, so these are the tags it reads instead.
 */
export interface CorrectedTags {
	title?: string | undefined
	artist?: string | undefined
}

// A plain Omit collapses to the fields shared by every branch, which would
// erase the union. This applies Omit to each branch and rejoins them.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export type OverrideInput = DistributiveOmit<Override, "savedAt">

/** An override together with the key it is bound to, which Settings shows. */
export interface OverrideEntry {
	key: string
	override: Override
}

/**
 * Where a correction for what is playing would be filed, and whether one is
 * there already. A resolver answers this without resolving, because the media
 * that most needs correcting is exactly the media that resolves to nothing.
 *
 * `kind` is what the key is bound to, and the two behave differently enough
 * that the screen has to be able to say which: a `metadata` key is derived from
 * what the file claims to be, so it covers every file that claims the same and
 * moves when a release is named differently, while a `file` key names one file
 * on disk and stops the day it is moved or renamed. That is what a person needs
 * to know to understand why a correction stopped applying.
 */
export interface OverrideTarget {
	kind: "metadata" | "file"
	key: string
	active: boolean
}
