import { useStore } from "@nanostores/react"
import { Badge } from "@renderer/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { logger } from "@renderer/lib/utils"
import { configStore, saveConfig } from "@renderer/stores/config.store"
import type { LayoutPreset } from "@shared/presence/layout"
import { LAYOUT_PRESETS } from "@shared/presence/layout"
import { MusicNotes, VideoCamera } from "phosphor-react"
import { useEffect, useId, useState } from "react"

import { LayoutCard } from "./components/layout-card"
import { LAYOUT_CARDS } from "./layout.constants"

const VIDEO_REASON_ID = "layout-video-reason"

export function LayoutPage(): JSX.Element {
	const config = useStore(configStore)
	const [selectedPreset, setSelectedPreset] = useState<LayoutPreset>("default")
	const groupName = useId()

	useEffect(() => {
		if (config?.layoutPreset) {
			setSelectedPreset(config.layoutPreset)
		}
	}, [config])

	async function selectPreset(preset: LayoutPreset): Promise<void> {
		const previousPreset = selectedPreset
		setSelectedPreset(preset)

		try {
			await saveConfig("layoutPreset", preset)
			await saveConfig("presenceLayout", LAYOUT_PRESETS[preset])
			logger.info(`Layout preset changed to: ${preset}`)
		} catch (error) {
			// Nothing was written, so the cards must not keep showing the new preset. A later
			// choice wins over this revert, otherwise a slow failure would undo it.
			setSelectedPreset((current) => (current === preset ? previousPreset : current))
			logger.error(`Failed to update layout preset: ${error}`)
		}
	}

	if (!config) {
		return <p className="type-caption text-muted-foreground">Loading</p>
	}

	return (
		<div className="@container flex flex-col gap-4">
			<h1 className="sr-only">Layout</h1>
			<p className="type-caption text-muted-foreground">
				Choose how your media appears in Discord. A change takes a few seconds to show up.
			</p>

			{/* Video presets do not exist yet, so music is the only value the tabs can hold. */}
			<Tabs value="music">
				<TabsList>
					<TabsTrigger value="music">
						<MusicNotes size={16} weight="fill" aria-hidden="true" />
						Music
					</TabsTrigger>
					<TabsTrigger value="video" aria-disabled="true" aria-describedby={VIDEO_REASON_ID}>
						<VideoCamera size={16} weight="fill" aria-hidden="true" />
						Video
						<Badge>Soon</Badge>
					</TabsTrigger>
				</TabsList>

				<p id={VIDEO_REASON_ID} className="sr-only">
					Video layouts are not ready yet. Video playback looks the same under every preset.
				</p>

				<TabsContent value="music">
					{/* The rail makes viewport widths lie about this pane, so the collapse is a
					    container query. Below two comfortable columns the grid stacks. */}
					<div
						role="radiogroup"
						aria-label="Layout preset"
						className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-2"
					>
						{LAYOUT_CARDS.map((card) => (
							<LayoutCard
								key={card.preset}
								card={card}
								groupName={groupName}
								isSelected={selectedPreset === card.preset}
								onSelect={selectPreset}
							/>
						))}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
