import { useStore } from "@nanostores/react"
import { PresenceCard } from "@renderer/components/presence-card"
import { mediaStore, useProxiedArtwork } from "@renderer/features/media"
import { cn } from "@renderer/lib/utils"
import type { LayoutPreset } from "@shared/presence/layout"
import { LAYOUT_PRESETS, applyTemplate } from "@shared/presence/layout"
import { useId } from "react"

import type { LayoutCardData } from "../layout.constants"
import { SAMPLE_TRACK } from "../layout.constants"

interface LayoutCardProps {
	card: LayoutCardData
	/** Shared by every card in the group, which is what makes the arrow keys work. */
	groupName: string
	isSelected: boolean
	onSelect: (preset: LayoutPreset) => void
}

export function LayoutCard({
	card,
	groupName,
	isSelected,
	onSelect,
}: LayoutCardProps): JSX.Element {
	const media = useStore(mediaStore)
	const artworkUrl = useProxiedArtwork()
	const id = useId()

	const nameId = `${id}-name`
	const descriptionId = `${id}-description`

	const layout = LAYOUT_PRESETS[card.preset]
	const variables = {
		...(media.mediaType === "audio" && media.title
			? { title: media.title, artist: media.artist ?? "", album: media.album ?? "" }
			: SAMPLE_TRACK),
	}

	const activityName = layout.activityName ? applyTemplate(layout.activityName, variables) : "VLC"

	return (
		<label
			className={cn(
				"relative block cursor-pointer overflow-hidden rounded-md border p-4",
				"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				isSelected ? "border-brand bg-brand-wash" : "border-divider bg-card hover:bg-float",
				"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-text",
				"has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
			)}
		>
			<input
				type="radio"
				name={groupName}
				value={card.preset}
				checked={isSelected}
				onChange={() => onSelect(card.preset)}
				aria-labelledby={nameId}
				aria-describedby={descriptionId}
				className="sr-only"
			/>

			{/* Discord's own "this one" mark. It grows from the vertical centre, so the origin
			    matters, and it carries no reduced motion hook because the hook would blank it out. */}
			<span
				aria-hidden="true"
				className={cn(
					"absolute inset-y-0 start-0 w-[3px] origin-center rounded-s-md bg-brand",
					"transition-transform ease-spring-snap",
					"[transition-duration:var(--spring-snap-duration)]",
					isSelected ? "[transform:scaleY(1)]" : "[transform:scaleY(0)]",
				)}
			/>

			<span id={nameId} className="type-label block text-strong">
				{card.name}
			</span>
			<span
				id={descriptionId}
				className="type-caption mt-1 block text-pretty text-muted-foreground"
			>
				{card.description}
			</span>

			<PresenceCard
				kind="presence"
				size="sm"
				className="mt-3"
				header={`Listening to ${activityName}`}
				details={applyTemplate(layout.musicDetails, variables)}
				state={applyTemplate(layout.musicState, variables)}
				largeText={variables.album}
				artworkUrl={artworkUrl}
			/>
		</label>
	)
}
