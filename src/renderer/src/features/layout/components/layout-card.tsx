import { useStore } from "@nanostores/react"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import { LAYOUT_PRESETS, applyTemplate } from "@shared/presence/layout"
import type { LayoutPreset } from "@shared/presence/layout"

import type { LayoutCardData } from "../layout.constants"
import { DiscordPreview } from "./discord-preview"

interface LayoutCardProps {
	card: LayoutCardData
	isSelected: boolean
	onSelect: (preset: LayoutPreset) => void
}

export function LayoutCard({ card, isSelected, onSelect }: LayoutCardProps): JSX.Element {
	const media = useStore(mediaStore)
	const proxiedArtworkUrl = useProxiedArtwork()

	const layout = LAYOUT_PRESETS[card.preset]
	const hasMediaInfo = media.title && media.artist

	const templateVariables = {
		title: media.title || "Bohemian Rhapsody",
		artist: media.artist || "Queen",
		album: media.album || "A Night at the Opera",
	}

	const displayActivityName =
		hasMediaInfo && layout.activityName
			? applyTemplate(layout.activityName, templateVariables)
			: "Queen"

	const displayDetails = hasMediaInfo
		? applyTemplate(layout.musicDetails, templateVariables)
		: card.musicExample.details

	const displayState = hasMediaInfo
		? applyTemplate(layout.musicState, templateVariables)
		: card.musicExample.state

	const displayAlbum = hasMediaInfo && media.album ? media.album : "A Night at the Opera"

	return (
		<button
			key={card.preset}
			type="button"
			onClick={() => onSelect(card.preset)}
			className={`text-left p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
				isSelected
					? "border-primary bg-primary/5 shadow-lg shadow-primary/20"
					: "border-border bg-card hover:border-primary/50 hover:bg-card/80"
			}`}
		>
			<div className="flex items-start justify-between mb-3">
				<div>
					<h3 className="font-semibold text-base flex items-center gap-2">
						{card.name}
						{isSelected && (
							<span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
								Active
							</span>
						)}
					</h3>
					<p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
				</div>
			</div>

			<DiscordPreview
				activityName={displayActivityName}
				details={displayDetails}
				state={displayState}
				albumName={displayAlbum}
				artworkUrl={proxiedArtworkUrl}
			/>
		</button>
	)
}
