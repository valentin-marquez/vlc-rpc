import { useStore } from "@nanostores/react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { configStore } from "@renderer/stores/config.store"
import { MusicNotes, VideoCamera } from "phosphor-react"
import { useState } from "react"

import { MusicCanvas } from "./components/music-canvas"
import { VideoCanvas } from "./components/video-canvas"

export function LayoutPage(): JSX.Element {
	const config = useStore(configStore)
	const [tab, setTab] = useState<"music" | "video">("music")

	if (!config) {
		return <p className="type-caption text-muted-foreground">Loading</p>
	}

	return (
		<div className="@container flex flex-col gap-4">
			<h1 className="sr-only">Layout</h1>
			<p className="type-caption text-pretty text-muted-foreground">
				Drag a piece onto a line of the card to build what Discord shows. Press a piece instead to
				put it on the line you picked. The card here is the card your profile draws, not a drawing
				of one. Music and video are arranged separately.
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
					<MusicCanvas config={config} />
				</TabsContent>

				<TabsContent value="video">
					<VideoCanvas config={config} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
