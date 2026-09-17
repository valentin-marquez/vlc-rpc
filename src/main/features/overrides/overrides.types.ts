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
 * required, an audio override with no cover corrects nothing. That holds only
 * while the tags exist; when they do not, the branch below applies.
 */
export interface AudioOverride extends OverrideBase {
	kind: "audio"
	cover: string
}

/**
 * Audio whose tags name nothing, where the correction supplies what the file is
 * rather than only what it looks like.
 *
 * A separate branch and not three optional fields on `AudioOverride`, because
 * the asymmetry above is still right for a file that carries tags: a title typed
 * there would be written and never read, while here the typed values are the
 * only thing the presence text and a catalog search have to work from.
 *
 * The cover stays optional: given the words, the ordinary lookup finds the
 * artwork itself, and it is there for the file no catalog knows at all.
 */
export interface UntaggedAudioOverride extends OverrideBase {
	kind: "untagged-audio"
	title?: string | undefined
	artist?: string | undefined
	cover?: string | undefined
}

/**
 * The user refusing what the app matched this file to, filed, listed and removed
 * like any other correction. It carries no fields because the whole of what it
 * says is that the file speaks for itself, and it turns off the acoustic cover
 * as well as the name: the two come from one recording, so a match whose name
 * the user rejects is a match whose cover is another record's.
 */
export interface AsIsOverride extends OverrideBase {
	kind: "as-is"
}

export type Override = VideoOverride | AudioOverride | UntaggedAudioOverride | AsIsOverride

/**
 * What a file should read as when its own tags name nothing, and who says so.
 * The presence text is built from tags, so these are the tags it reads instead.
 *
 * The source travels with the words because a user who never typed anything is
 * owed the difference between what the file says and what the app worked out
 * from the sound of it, otherwise there is nothing on screen to disagree with.
 * `as-is` carries no words: the user refused a match, so the file names itself.
 */
export interface CorrectedTags {
	title?: string | undefined
	artist?: string | undefined
	source: "correction" | "identification" | "as-is"
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
 * `kind` is what the key is bound to, and the screen has to be able to say
 * which: a `metadata` key covers every file that claims the same thing and moves
 * when a release is named differently, while a `file` key names one file on disk
 * and stops the day it is moved or renamed. That is what a person needs to
 * understand why a correction stopped applying.
 */
export interface OverrideTarget {
	kind: "metadata" | "file"
	key: string
	active: boolean
}
