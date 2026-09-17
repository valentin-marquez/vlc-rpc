import { useStore } from "@nanostores/react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { logger } from "@renderer/lib/utils"
import { configStore, saveConfig } from "@renderer/stores/config.store"
import { DEFAULT_MUSIC_PRESET, DEFAULT_VIDEO_PRESET } from "@shared/presence/layout"
import { MusicNotes, VideoCamera } from "phosphor-react"
import { useEffect, useId, useState } from "react"

import { MusicPresetCard } from "./components/music-preset-card"
import { VideoPresetCard } from "./components/video-preset-card"
import { MUSIC_CARDS, VIDEO_CARDS } from "./layout.constants"

// The rail makes viewport widths lie about this pane, so the collapse is a container
// query. Below two comfortable columns the grid stacks.
const GRID = "grid grid-cols-1 gap-3 @min-[560px]:grid-cols-2"

function usePresetChoice<T extends string>(
	stored: T | undefined,
	fallback: T,
	save: (preset: T) => Promise<void>,
): [T, (preset: T) => Promise<void>] {
	const [selected, setSelected] = useState<T>(fallback)

	useEffect(() => {
		if (stored !== undefined) {
			setSelected(stored)
		}
	}, [stored])

	async function select(preset: T): Promise<void> {
		const previous = selected
		setSelected(preset)

		try {
			await save(preset)
		} catch (error) {
			// Nothing was written, so the cards must not keep showing the new preset. A later
			// choice wins over this revert, otherwise a slow failure would undo it.
			setSelected((current) => (current === preset ? previous : current))
			logger.error(`Failed to update layout preset: ${error}`)
		}
	}

	return [selected, select]
}

export function LayoutPage(): JSX.Element {
	const config = useStore(configStore)
	const [tab, setTab] = useState<"music" | "video">("music")
	const musicGroup = useId()
	const videoGroup = useId()

	const [musicPreset, selectMusicPreset] = usePresetChoice(
		config?.layoutPreset,
		DEFAULT_MUSIC_PRESET,
		async (preset) => {
			await saveConfig("layoutPreset", preset)
			logger.info(`Music layout preset changed to: ${preset}`)
		},
	)

	const [videoPreset, selectVideoPreset] = usePresetChoice(
		config?.videoLayoutPreset,
		DEFAULT_VIDEO_PRESET,
		async (preset) => {
			await saveConfig("videoLayoutPreset", preset)
			logger.info(`Video layout preset changed to: ${preset}`)
		},
	)

	if (!config) {
		return <p className="type-caption text-muted-foreground">Loading</p>
	}

	return (
		<div className="@container flex flex-col gap-4">
			<h1 className="sr-only">Layout</h1>
			<p className="type-caption text-muted-foreground">
				Choose how your media appears in Discord. Music and video are set separately. A change takes
				a few seconds to show up.
			</p>

			<Tabs value={tab} onValueChange={(value) => setTab(value === "video" ? "video" : "music")}>
				<TabsList>
					<TabsTrigger value="music">
						<MusicNotes size={16} weight="fill" aria-hidden="true" />
						Music
					</TabsTrigger>
					<TabsTrigger value="video">
						<VideoCamera size={16} weight="fill" aria-hidden="true" />
						Video
					</TabsTrigger>
				</TabsList>

				<TabsContent value="music">
					<div role="radiogroup" aria-label="Music layout preset" className={GRID}>
						{MUSIC_CARDS.map((card) => (
							<MusicPresetCard
								key={card.preset}
								card={card}
								groupName={musicGroup}
								isSelected={musicPreset === card.preset}
								onSelect={selectMusicPreset}
							/>
						))}
					</div>
				</TabsContent>

				<TabsContent value="video">
					<div role="radiogroup" aria-label="Video layout preset" className={GRID}>
						{VIDEO_CARDS.map((card) => (
							<VideoPresetCard
								key={card.preset}
								card={card}
								groupName={videoGroup}
								isSelected={videoPreset === card.preset}
								onSelect={selectVideoPreset}
							/>
						))}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
