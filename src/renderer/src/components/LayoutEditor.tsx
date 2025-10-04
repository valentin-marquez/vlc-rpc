import { Input } from "@renderer/components/ui/input"
import {
	LAYOUT_PRESETS,
	MUSIC_TEMPLATE_VARS,
	VIDEO_TEMPLATE_VARS,
	applyTemplate,
} from "@shared/constants/layouts"
import type { LayoutPreset, PresenceLayout } from "@shared/types"
import { useState } from "react"

interface LayoutEditorProps {
	layout: PresenceLayout
	preset: LayoutPreset
	onLayoutChange: (layout: PresenceLayout) => void
	onPresetChange: (preset: LayoutPreset) => void
}

export function LayoutEditor({
	layout,
	preset,
	onLayoutChange,
	onPresetChange,
}: LayoutEditorProps): JSX.Element {
	const [activeTab, setActiveTab] = useState<"music" | "video">("music")

	// Example data for preview
	const musicExampleData = {
		title: "Bohemian Rhapsody",
		artist: "Queen",
		album: "A Night at the Opera",
	}

	const videoExampleData = {
		title: "Breaking Bad",
		episodeInfo: "S05E14",
		year: "2013",
		season: "5",
		episode: "14",
	}

	const presets: Array<{ value: LayoutPreset; label: string; description: string }> = [
		{
			value: "default",
			label: "Default",
			description: 'Music: "Song by Artist" • Video: "Show - Episode"',
		},
		{
			value: "title-first",
			label: "Title First",
			description: 'Music: "Song / Artist" • Video: "Show - Episode"',
		},
		{
			value: "artist-first",
			label: "Artist First",
			description: 'Music: "Artist / Song" • Video: "Show - Episode"',
		},
		{
			value: "detailed",
			label: "Detailed",
			description: 'Music: "Song - Artist / Album" • Video: "Show - Episode • Year"',
		},
	]

	const handlePresetChange = (newPreset: LayoutPreset) => {
		onPresetChange(newPreset)
		onLayoutChange(LAYOUT_PRESETS[newPreset])
	}

	const handleTemplateChange = (field: keyof PresenceLayout, value: string) => {
		onLayoutChange({
			...layout,
			[field]: value,
		})
		// Reset to custom when manually editing
		if (preset !== "default") {
			// Check if still matches a preset
			const matchesPreset = Object.entries(LAYOUT_PRESETS).some(([_presetKey, presetLayout]) => {
				const updatedLayout = { ...layout, [field]: value }
				return JSON.stringify(updatedLayout) === JSON.stringify(presetLayout)
			})
			if (!matchesPreset) {
				onPresetChange("default")
			}
		}
	}

	// Generate preview based on current layout
	const musicPreviewDetails = applyTemplate(layout.musicDetails, musicExampleData)
	const musicPreviewState = applyTemplate(layout.musicState, musicExampleData)

	const videoPreviewDetails = applyTemplate(layout.videoDetails, videoExampleData)
	const videoPreviewState = applyTemplate(layout.videoState, videoExampleData)

	return (
		<div className="space-y-4">
			{/* Preset Selector */}
			<div>
				<div className="text-sm font-medium mb-2">Layout Preset</div>
				<div className="grid grid-cols-1 gap-2">
					{presets.map((p) => (
						<button
							key={p.value}
							type="button"
							onClick={() => handlePresetChange(p.value)}
							className={`text-left p-3 rounded-md border transition-colors ${
								preset === p.value
									? "border-primary bg-primary/10"
									: "border-border hover:border-primary/50"
							}`}
						>
							<div className="font-medium text-sm">{p.label}</div>
							<div className="text-xs text-muted-foreground mt-1">{p.description}</div>
						</button>
					))}
				</div>
			</div>

			{/* Tab Selector */}
			<div className="flex gap-2 border-b border-border">
				<button
					type="button"
					onClick={() => setActiveTab("music")}
					className={`px-4 py-2 font-medium text-sm transition-colors ${
						activeTab === "music"
							? "border-b-2 border-primary text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					Music
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("video")}
					className={`px-4 py-2 font-medium text-sm transition-colors ${
						activeTab === "video"
							? "border-b-2 border-primary text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					Video
				</button>
			</div>

			{/* Music Tab */}
			{activeTab === "music" && (
				<div className="space-y-4">
					<div>
						<div className="text-sm font-medium mb-1">First Line (Details)</div>
						<Input
							value={layout.musicDetails}
							onChange={(e) => handleTemplateChange("musicDetails", e.target.value)}
							placeholder="{title}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(MUSIC_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-sm font-medium mb-1">Second Line (State)</div>
						<Input
							value={layout.musicState}
							onChange={(e) => handleTemplateChange("musicState", e.target.value)}
							placeholder="by {artist}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(MUSIC_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					{/* Preview */}
					<div className="bg-background border border-border rounded-md p-4">
						<div className="text-xs text-muted-foreground mb-2">Preview:</div>
						<div className="flex items-start gap-3">
							<div className="w-16 h-16 bg-primary/20 rounded-md flex items-center justify-center text-2xl">
								🎵
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-sm font-semibold mb-1">Listening to Spotify</div>
								<div className="text-sm font-medium truncate">{musicPreviewDetails}</div>
								<div className="text-xs text-muted-foreground truncate">{musicPreviewState}</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Video Tab */}
			{activeTab === "video" && (
				<div className="space-y-4">
					<div>
						<div className="text-sm font-medium mb-1">First Line (Details)</div>
						<Input
							value={layout.videoDetails}
							onChange={(e) => handleTemplateChange("videoDetails", e.target.value)}
							placeholder="{title}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(VIDEO_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					<div>
						<div className="text-sm font-medium mb-1">Second Line (State)</div>
						<Input
							value={layout.videoState}
							onChange={(e) => handleTemplateChange("videoState", e.target.value)}
							placeholder="{episodeInfo}"
							className="font-mono text-sm"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Available:{" "}
							{Object.keys(VIDEO_TEMPLATE_VARS)
								.map((v) => `{${v}}`)
								.join(", ")}
						</div>
					</div>

					{/* Preview */}
					<div className="bg-background border border-border rounded-md p-4">
						<div className="text-xs text-muted-foreground mb-2">Preview:</div>
						<div className="flex items-start gap-3">
							<div className="w-16 h-16 bg-primary/20 rounded-md flex items-center justify-center text-2xl">
								🎬
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-sm font-semibold mb-1">Watching VLC Media Player</div>
								<div className="text-sm font-medium truncate">{videoPreviewDetails}</div>
								<div className="text-xs text-muted-foreground truncate">{videoPreviewState}</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Template Variables Guide */}
			<div className="bg-muted/50 rounded-md p-3 text-xs">
				<div className="font-medium mb-1">💡 Template Variables Guide</div>
				<div className="space-y-1 text-muted-foreground">
					<div>
						• Use variables like {"{title}"}, {"{artist}"}, {"{album}"} for music
					</div>
					<div>
						• Use {"{title}"}, {"{episodeInfo}"}, {"{year}"} for videos
					</div>
					<div>
						• Combine them with text: "{"{title}"} - {"{artist}"}"
					</div>
					<div>• Unused variables will be removed automatically</div>
				</div>
			</div>
		</div>
	)
}
