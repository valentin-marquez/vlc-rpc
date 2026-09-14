import type { LayoutPreset } from "@shared/presence/layout"
export interface LayoutCardData {
	preset: LayoutPreset
	name: string
	description: string
	musicExample: {
		details: string
		state: string
	}
}

export const LAYOUT_CARDS: LayoutCardData[] = [
	{
		preset: "default",
		name: "Default",
		description: "Song title on top with 'by' prefix before artist name for clear attribution",
		musicExample: {
			details: "Bohemian Rhapsody",
			state: "by Queen",
		},
	},
	{
		preset: "album-focused",
		name: "Album Focus",
		description: "Highlights album artwork and name as primary information with song details below",
		musicExample: {
			details: "A Night at the Opera",
			state: "Bohemian Rhapsody • Queen",
		},
	},
	{
		preset: "artist-spotlight",
		name: "Artist Spotlight",
		description:
			"Prominent artist display with song title subtly shown below using minimalist punctuation",
		musicExample: {
			details: "Queen",
			state: "• Bohemian Rhapsody",
		},
	},
]
