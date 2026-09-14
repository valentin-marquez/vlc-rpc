import { useStore } from "@nanostores/react"
import { Tabs, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { logger } from "@renderer/lib/utils"
import { configStore, saveConfig } from "@renderer/stores/config.store"
import { LAYOUT_PRESETS } from "@shared/presence/layout"
import type { LayoutPreset } from "@shared/presence/layout"

import { MusicNotes, VideoCamera } from "phosphor-react"
import { useEffect, useState } from "react"
import { LayoutCard } from "./components/layout-card"
import { LAYOUT_CARDS } from "./layout.constants"

export function LayoutPage(): JSX.Element {
	const config = useStore(configStore)
	const [selectedPreset, setSelectedPreset] = useState<LayoutPreset>("default")
	const [activeTab, setActiveTab] = useState<"music" | "video">("music")

	useEffect(() => {
		if (config?.layoutPreset) {
			setSelectedPreset(config.layoutPreset)
		}
	}, [config])

	const handleSelectPreset = async (preset: LayoutPreset): Promise<void> => {
		setSelectedPreset(preset)
		try {
			await saveConfig("layoutPreset", preset)
			await saveConfig("presenceLayout", LAYOUT_PRESETS[preset])
			logger.info(`Layout preset changed to: ${preset}`)
		} catch (error) {
			logger.error(`Failed to update layout preset: ${error}`)
		}
	}

	if (!config) {
		return <div className="p-6 text-center text-foreground">Loading...</div>
	}

	return (
		<div className="max-w-7xl mx-auto">
			<div className="mb-4">
				<h1 className="text-xl font-bold">Rich Presence Layout</h1>
				<p className="text-sm text-muted-foreground">
					Choose how your media appears in Discord. Changes may take a few seconds to apply.
				</p>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as "music" | "video")}
				className="mb-4"
			>
				<TabsList>
					<TabsTrigger value="music">
						<MusicNotes size={18} weight="fill" />
						Music
					</TabsTrigger>
					<TabsTrigger value="video" disabled>
						<VideoCamera size={18} weight="fill" />
						Video
						<span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-1">Soon</span>
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{LAYOUT_CARDS.map((card) => (
					<LayoutCard
						key={card.preset}
						card={card}
						isSelected={selectedPreset === card.preset}
						onSelect={handleSelectPreset}
					/>
				))}
			</div>
		</div>
	)
}
