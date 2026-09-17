/**
 * How a media file is laid out on a Discord profile. The presence loop renders these
 * lines and the Layout screen arranges them, so both read the pieces from here and a
 * preview cannot promise something the profile will not show.
 */

export type TemplateVariables = Record<string, string | number | undefined>

/**
 * A piece of a line. A value piece draws what the file reports, a text piece draws the
 * words the user typed. Both are placed by dragging, so a line can never name a value
 * that does not exist.
 */
export type LayoutPiece = { kind: "value"; name: string } | { kind: "text"; text: string }

/** The pieces of one line, in the order Discord draws them. */
export type LayoutLine = readonly LayoutPiece[]

/**
 * The four pieces of text Discord draws for a Listening activity, in the order it draws
 * them, measured on a real profile. Each one is arranged here, so nothing reaches a profile
 * that this screen did not put there.
 */
export interface MusicLayout {
	/**
	 * What Discord writes after the verb, on the header line: "Listening to <this>". Left
	 * empty, Discord names the activity after the application itself.
	 */
	activityName: LayoutLine
	/** The first body line, the one Discord draws in bold. */
	details: LayoutLine
	/** The second body line. */
	state: LayoutLine
	/** The third body line. It crosses to Discord as the artwork's text. */
	largeText: LayoutLine
}

/**
 * A Watching activity has two lines and no header of its own: the app names none, so the
 * header reads as whatever Discord calls this application.
 *
 * There is no third line here. The one Listening draws is the artwork text, seen drawn on a
 * real profile, and nothing measured says Watching does the same. The app sends none rather
 * than promise a line that may never appear.
 */
export interface VideoLayout {
	/** The first body line, the one Discord draws in bold. */
	details: LayoutLine
	/** The second body line. */
	state: LayoutLine
}

export interface ResolvedLayout {
	music: MusicLayout
	video: VideoLayout
}

export const valuePiece = (name: string): LayoutPiece => ({ kind: "value", name })
export const textPiece = (words: string): LayoutPiece => ({ kind: "text", text: words })

/**
 * The shape of a Spotify card: the song in bold, who plays it under that, the album last.
 * The header is left to Discord, which writes the application's name there.
 *
 * The arrangement it replaces put the song in the header, so a profile read "Listening to
 * Probablemente" with "by Christian Nodal" in bold under it, the song and the artist the
 * wrong way round. It was picked against a preview that drew the header as the verb alone.
 */
export const DEFAULT_MUSIC_LAYOUT: MusicLayout = {
	activityName: [],
	details: [valuePiece("title")],
	state: [textPiece("by"), valuePiece("artist")],
	largeText: [valuePiece("album")],
}

/**
 * The title, then whichever of the episode and the year the file turns out to carry. One
 * arrangement that reads for a series and for a film, which is the whole point of a piece
 * that takes itself off the line when it has nothing to draw.
 */
export const DEFAULT_VIDEO_LAYOUT: VideoLayout = {
	details: [valuePiece("title")],
	state: [valuePiece("episodeInfo"), valuePiece("year")],
}

export type MusicLayoutChoice = { kind: "default" } | { kind: "custom"; layout: MusicLayout }

export type VideoLayoutChoice = { kind: "default" } | { kind: "custom"; layout: VideoLayout }

/** What the config key holds. */
export type StoredMusicLayout = MusicLayoutChoice
export type StoredVideoLayout = VideoLayoutChoice

export interface LayoutChoice {
	music?: StoredMusicLayout | undefined
	video?: StoredVideoLayout | undefined
}

/**
 * A name rather than a copy of the default pieces, so a release that improves the
 * arrangement everyone starts on reaches everyone who never rearranged it.
 */
export const DEFAULT_MUSIC_CHOICE: MusicLayoutChoice = { kind: "default" }
export const DEFAULT_VIDEO_CHOICE: VideoLayoutChoice = { kind: "default" }

export function resolveLayout(choice: LayoutChoice): ResolvedLayout {
	return {
		music: resolveMusicLayout(choice.music),
		video: resolveVideoLayout(choice.video),
	}
}

/**
 * Anything that is not a shape this release writes resolves to the default arrangement.
 * A config is a file on disk that a person can open and mistype, and a layout it cannot
 * read is not a reason to start the app without a presence.
 */
export function resolveMusicLayout(stored: StoredMusicLayout | undefined): MusicLayout {
	const held = asRecord(stored)
	return held.kind === "custom" ? musicLayoutFrom(held.layout) : DEFAULT_MUSIC_LAYOUT
}

export function resolveVideoLayout(stored: StoredVideoLayout | undefined): VideoLayout {
	const held = asRecord(stored)
	return held.kind === "custom" ? videoLayoutFrom(held.layout) : DEFAULT_VIDEO_LAYOUT
}

/**
 * Pieces the user arranged are the whole of what is stored, so they are what a hand edit
 * can fill with anything.
 */
function musicLayoutFrom(candidate: unknown): MusicLayout {
	const record = asRecord(candidate)
	return {
		activityName: cleanLine(record.activityName),
		details: cleanLine(record.details),
		state: cleanLine(record.state),
		largeText: cleanLine(record.largeText),
	}
}

function videoLayoutFrom(candidate: unknown): VideoLayout {
	const record = asRecord(candidate)
	return { details: cleanLine(record.details), state: cleanLine(record.state) }
}

function asRecord(candidate: unknown): Record<string, unknown> {
	return typeof candidate === "object" && candidate !== null
		? (candidate as Record<string, unknown>)
		: {}
}

function cleanLine(candidate: unknown): LayoutLine {
	if (!Array.isArray(candidate)) return []
	return candidate.filter(isPiece)
}

function isPiece(candidate: unknown): candidate is LayoutPiece {
	const record = asRecord(candidate)
	if (record.kind === "value") return typeof record.name === "string" && record.name.trim() !== ""
	if (record.kind === "text") return typeof record.text === "string" && record.text.trim() !== ""
	return false
}

/**
 * The lines of a layout in the order Discord draws them, which is the order the builder
 * arranges them in. Going through a plain list is what lets one canvas serve both kinds.
 */
export function toMusicLines(layout: MusicLayout): readonly LayoutLine[] {
	return [layout.activityName, layout.details, layout.state, layout.largeText]
}

export function fromMusicLines(lines: readonly LayoutLine[]): MusicLayout {
	return {
		activityName: lines[0] ?? [],
		details: lines[1] ?? [],
		state: lines[2] ?? [],
		largeText: lines[3] ?? [],
	}
}

export function toVideoLines(layout: VideoLayout): readonly LayoutLine[] {
	return [layout.details, layout.state]
}

export function fromVideoLines(lines: readonly LayoutLine[]): VideoLayout {
	return { details: lines[0] ?? [], state: lines[1] ?? [] }
}

function samePiece(a: LayoutPiece, b: LayoutPiece): boolean {
	if (a.kind === "value") return b.kind === "value" && a.name === b.name
	return b.kind === "text" && a.text === b.text
}

export function sameLines(a: readonly LayoutLine[], b: readonly LayoutLine[]): boolean {
	if (a.length !== b.length) return false
	return a.every((line, index) => {
		const other = b[index]
		if (other === undefined || other.length !== line.length) return false
		return line.every((piece, position) => {
			const counterpart = other[position]
			return counterpart !== undefined && samePiece(piece, counterpart)
		})
	})
}

/**
 * Storing a name rather than a copy of the default pieces is what lets a later release
 * improve them. The moment a piece is moved the copy is the truth.
 */
export function musicChoiceFor(layout: MusicLayout): MusicLayoutChoice {
	if (sameLines(toMusicLines(DEFAULT_MUSIC_LAYOUT), toMusicLines(layout)))
		return { kind: "default" }
	return { kind: "custom", layout }
}

export function videoChoiceFor(layout: VideoLayout): VideoLayoutChoice {
	if (sameLines(toVideoLines(DEFAULT_VIDEO_LAYOUT), toVideoLines(layout)))
		return { kind: "default" }
	return { kind: "custom", layout }
}

export interface VideoFacts {
	title: string
	season?: number | undefined
	episode?: number | undefined
	year?: string | number | undefined
}

/**
 * The year of a file the app worked out to be an episode is the show's year or the
 * season's, never this episode's, and beside "S1E11" it is noise either way. Western
 * releases carry it in the name routinely, so the piece has to take itself off the line
 * the same way it does for a file that never named a year.
 */
export function videoVariables(facts: VideoFacts): TemplateVariables {
	const episodeInfo = episodeMarker(facts.season, facts.episode)

	return {
		title: facts.title,
		episodeInfo,
		season: facts.season,
		episode: facts.episode,
		year: episodeInfo === "" ? facts.year : undefined,
	}
}

function episodeMarker(season: number | undefined, episode: number | undefined): string {
	if (season !== undefined && episode !== undefined) return `S${season}E${episode}`
	if (season !== undefined) return `Season ${season}`
	if (episode !== undefined) return `Episode ${episode}`
	return ""
}

const WHITESPACE_RUN = /\s+/g

export function drawnValue(name: string, variables: TemplateVariables): string {
	const held = variables[name]
	return held === undefined ? "" : String(held).trim()
}

/**
 * What each piece of the line puts on the profile, in place, and null for a piece that
 * took itself off. The builder reads the same answer, so a guard on what a line draws and
 * the line itself cannot come apart.
 */
export function drawnPieces(
	line: LayoutLine,
	variables: TemplateVariables,
): readonly (string | null)[] {
	const values = line.map((piece) =>
		piece.kind === "value" ? drawnValue(piece.name, variables) : null,
	)

	return line.map((piece, index) => {
		if (piece.kind === "value") {
			const held = values[index] ?? ""
			return held === "" ? null : held
		}

		const words = piece.text.trim()
		return words === "" || !carried(values, index) ? null : words
	})
}

/**
 * A piece with nothing to draw takes itself off the line, and takes the words next to it
 * with it. Leaving the words behind is what used to write "by " onto a profile with no
 * artist, and filling the gap instead is what used to write "Unknown".
 */
export function renderLine(line: LayoutLine, variables: TemplateVariables): string {
	const parts = drawnPieces(line, variables).filter((part): part is string => part !== null)

	return join(parts).replace(WHITESPACE_RUN, " ").trim()
}

const OPENS = /[([{]$/
const CLOSES = /^[)\]},.;:!?]/

/**
 * Pieces sit a space apart, except around the punctuation someone typed to wrap a value.
 * A bracket the user put beside the year is meant to touch it.
 */
function join(parts: readonly string[]): string {
	return parts.reduce((line, part) => {
		if (line === "") return part
		if (OPENS.test(line) || CLOSES.test(part)) return line + part
		return `${line} ${part}`
	}, "")
}

/**
 * Words belong to the value they were written for: the one after them, or the one before
 * when nothing follows. Words with no value anywhere on the line stand on their own.
 */
function carried(drawn: readonly (string | null)[], index: number): boolean {
	for (let after = index + 1; after < drawn.length; after += 1) {
		const held = drawn[after]
		if (held !== null && held !== undefined) return held !== ""
	}
	for (let before = index - 1; before >= 0; before -= 1) {
		const held = drawn[before]
		if (held !== null && held !== undefined) return held !== ""
	}
	return true
}

export interface PieceInfo {
	name: string
	/** What the piece is called on screen. Never a field name. */
	label: string
	/** Reads inside a sentence: "there is no <noun>". */
	noun: string
}

export const MUSIC_PIECES: readonly PieceInfo[] = [
	{ name: "title", label: "Song title", noun: "song title" },
	{ name: "artist", label: "Artist", noun: "artist" },
	{ name: "album", label: "Album", noun: "album" },
]

export const VIDEO_PIECES: readonly PieceInfo[] = [
	{ name: "title", label: "Title", noun: "title" },
	{ name: "episodeInfo", label: "Episode", noun: "episode, which a film has none of" },
	{ name: "year", label: "Year", noun: "release year" },
	{ name: "season", label: "Season number", noun: "season number" },
	{ name: "episode", label: "Episode number", noun: "episode number" },
]

export function pieceLabel(piece: LayoutPiece, pieces: readonly PieceInfo[]): string {
	if (piece.kind === "text") return piece.text
	return pieces.find((info) => info.name === piece.name)?.label ?? piece.name
}
