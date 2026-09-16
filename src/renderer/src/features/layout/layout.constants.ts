import type { LayoutPreset } from "@shared/presence/layout"

export interface LayoutCardData {
	preset: LayoutPreset
	name: string
	description: string
}

/** Stands in for the live track so every preset stays readable before VLC reports one. */
export const SAMPLE_TRACK = {
	title: "Bohemian Rhapsody",
	artist: "Queen",
	album: "A Night at the Opera",
}

export const LAYOUT_CARDS: LayoutCardData[] = [
	{
		preset: "default",
		name: "Default",
		description: "Shows the song title first and the artist below it.",
	},
	{
		preset: "album-focused",
		name: "Album focus",
		description: "Shows the album first, with the song and artist below it.",
	},
	{
		preset: "artist-spotlight",
		name: "Artist spotlight",
		description: "Shows the artist first, with the song title below it.",
	},
]
