import { PresenceCard } from "@renderer/components/presence-card"
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
				{videoSamples().map((sample) => (
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
 * Both rows are drawn from examples, never from what is playing.
 *
 * The point of a video preset is how differently it reads for an episode and for
 * a film, and that comparison only works on matched content. Folding the live
 * item into one row left an example without artwork sitting beside a real cover:
 * two cards that stopped looking like a pair. What is playing is on Home, at
 * full size, which is where it belongs.
 */
function videoSamples(): VideoSample[] {
	return [
		{ label: "TV show", facts: SAMPLE_EPISODE, artworkUrl: null },
		{ label: "Movie", facts: SAMPLE_FILM, artworkUrl: null },
	]
}
