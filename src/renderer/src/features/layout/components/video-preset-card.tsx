import { useStore } from "@nanostores/react"
import { PresenceCard } from "@renderer/components/presence-card"
import type { MediaState } from "@renderer/features/media"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import type { VideoFacts, VideoLayout, VideoPreset } from "@shared/presence/layout"
import { VIDEO_PRESETS, renderLine, videoVariables } from "@shared/presence/layout"

import type { VideoCardData } from "../layout.constants"
import { PLAYING_BADGE, SAMPLE_EPISODE, SAMPLE_FILM } from "../layout.constants"
import { LayoutCard } from "./layout-card"

interface VideoPresetCardProps {
	card: VideoCardData
	groupName: string
	isSelected: boolean
	onSelect: (preset: VideoPreset) => void
}

interface VideoSample {
	label: string
	facts: VideoFacts
	artworkUrl: string | null
}

export function VideoPresetCard({
	card,
	groupName,
	isSelected,
	onSelect,
}: VideoPresetCardProps): JSX.Element {
	const media = useStore(mediaStore)
	const artworkUrl = useProxiedArtwork()

	const layout = VIDEO_PRESETS[card.preset]

	return (
		<LayoutCard
			value={card.preset}
			name={card.name}
			description={card.description}
			groupName={groupName}
			isSelected={isSelected}
			onSelect={onSelect}
		>
			<div className="flex flex-col gap-3">
				{videoSamples(media, artworkUrl).map((sample) => (
					<Preview key={sample.label} sample={sample} layout={layout} />
				))}
			</div>
		</LayoutCard>
	)
}

function Preview({ sample, layout }: { sample: VideoSample; layout: VideoLayout }): JSX.Element {
	const variables = videoVariables(sample.facts)

	return (
		<div className="flex flex-col gap-2">
			<span className="type-caption text-faint">{sample.label}</span>
			<PresenceCard
				kind="presence"
				size="sm"
				icon="video"
				badge={PLAYING_BADGE}
				header="Watching"
				details={renderLine(layout.details, variables)}
				state={renderLine(layout.state, variables)}
				artworkUrl={sample.artworkUrl}
			/>
		</div>
	)
}

/**
 * Both rows are always drawn, because the point of a video preset is how differently it
 * reads for an episode and for a film. What is playing takes over the row it belongs to.
 */
function videoSamples(media: MediaState, artworkUrl: string | null): VideoSample[] {
	const live = liveFacts(media)
	const liveIsEpisode = live !== null && (live.season !== undefined || live.episode !== undefined)

	return [
		live !== null && liveIsEpisode
			? { label: "TV show", facts: live, artworkUrl }
			: { label: "TV show", facts: SAMPLE_EPISODE, artworkUrl: null },
		live !== null && !liveIsEpisode
			? { label: "Movie", facts: live, artworkUrl }
			: { label: "Movie", facts: SAMPLE_FILM, artworkUrl: null },
	]
}

function liveFacts(media: MediaState): VideoFacts | null {
	if (media.mediaType !== "video" || !media.title) return null

	return {
		title: media.title,
		season: media.season ?? undefined,
		episode: media.episode ?? undefined,
		year: media.year ?? undefined,
	}
}
