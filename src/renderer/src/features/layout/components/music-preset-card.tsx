import { useStore } from "@nanostores/react"
import { PresenceCard } from "@renderer/components/presence-card"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import type { MusicPreset } from "@shared/presence/layout"
import { MUSIC_PRESETS, renderLine } from "@shared/presence/layout"

import type { MusicCardData } from "../layout.constants"
import { PLAYING_BADGE, SAMPLE_TRACK } from "../layout.constants"
import { LayoutCard } from "./layout-card"

interface MusicPresetCardProps {
	card: MusicCardData
	groupName: string
	isSelected: boolean
	onSelect: (preset: MusicPreset) => void
}

export function MusicPresetCard({
	card,
	groupName,
	isSelected,
	onSelect,
}: MusicPresetCardProps): JSX.Element {
	const media = useStore(mediaStore)
	const artworkUrl = useProxiedArtwork()

	const layout = MUSIC_PRESETS[card.preset]
	const isLive = media.mediaType === "audio" && media.title !== null && media.title !== ""
	const variables = isLive
		? { title: media.title ?? "", artist: media.artist ?? "", album: media.album ?? "" }
		: SAMPLE_TRACK

	// An empty name is what Discord falls back on, and it falls back to the app itself.
	const activityName = renderLine(layout.activityName, variables) || "VLC"

	return (
		<LayoutCard
			value={card.preset}
			name={card.name}
			description={card.description}
			groupName={groupName}
			isSelected={isSelected}
			onSelect={onSelect}
		>
			<PresenceCard
				kind="presence"
				size="sm"
				badge={PLAYING_BADGE}
				header={`Listening to ${activityName}`}
				details={renderLine(layout.details, variables)}
				state={renderLine(layout.state, variables)}
				largeText={variables.album}
				artworkUrl={isLive ? artworkUrl : null}
			/>
		</LayoutCard>
	)
}
