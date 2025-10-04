import { useStore } from "@nanostores/react"
import { Tabs, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { logger } from "@renderer/lib/utils"
import { mediaInfoStore } from "@renderer/stores/app-status"
import { configStore, saveConfig } from "@renderer/stores/config"
import { getProxiedImage, mediaStore } from "@renderer/stores/media"
import { LAYOUT_PRESETS, applyTemplate } from "@shared/constants/layouts"
import type { LayoutPreset } from "@shared/types"
import { MusicNotes, VideoCamera } from "phosphor-react"
import { useEffect, useState } from "react"

interface LayoutCard {
	preset: LayoutPreset
	name: string
	description: string
	musicExample: {
		details: string
		state: string
	}
}

const LAYOUT_CARDS: LayoutCard[] = [
	{
		preset: "default",
		name: "Default",
		description: "Song title on top with 'by' prefix before artist name for clear attribution",
		musicExample: {
			details: "Bohemian Rhapsody",
			state: "by Queen",
		},
	},
	{
		preset: "album-focused",
		name: "Album Focus",
		description: "Highlights album artwork and name as primary information with song details below",
		musicExample: {
			details: "A Night at the Opera",
			state: "Bohemian Rhapsody • Queen",
		},
	},
	{
		preset: "artist-spotlight",
		name: "Artist Spotlight",
		description:
			"Prominent artist display with song title subtly shown below using minimalist punctuation",
		musicExample: {
			details: "Queen",
			state: "• Bohemian Rhapsody",
		},
	},
]

export function Layout(): JSX.Element {
	const config = useStore(configStore)
	const mediaInfo = useStore(mediaInfoStore)
	const media = useStore(mediaStore)
	const [selectedPreset, setSelectedPreset] = useState<LayoutPreset>("default")
	const [activeTab, setActiveTab] = useState<"music" | "video">("music")
	const [proxiedArtworkUrl, setProxiedArtworkUrl] = useState<string | null>(null)

	useEffect(() => {
		if (config?.layoutPreset) {
			setSelectedPreset(config.layoutPreset)
		}
	}, [config])

	useEffect(() => {
		const updateProxiedArtwork = async () => {
			const artworkUrl = media.contentImageUrl || mediaInfo.artwork
			if (artworkUrl) {
				const proxied = await getProxiedImage(artworkUrl)
				setProxiedArtworkUrl(proxied)
			} else {
				setProxiedArtworkUrl(null)
			}
		}

		updateProxiedArtwork()
	}, [media.contentImageUrl, mediaInfo.artwork])

	const handleSelectPreset = async (preset: LayoutPreset) => {
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

			{/* Tab Selector */}
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

			{/* Layout Cards Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{LAYOUT_CARDS.map((card) => {
					const isSelected = selectedPreset === card.preset

					// Get the layout template for this card
					const layout = LAYOUT_PRESETS[card.preset]

					// Use real media info if available, otherwise use example data
					const hasMediaInfo = mediaInfo.title && mediaInfo.artist

					// Template variables for real data
					const templateVariables = {
						title: mediaInfo.title || "Bohemian Rhapsody",
						artist: mediaInfo.artist || "Queen",
						album: mediaInfo.album || "A Night at the Opera",
					}

					// Apply templates to show formatted data
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

					return (
						<button
							key={card.preset}
							type="button"
							onClick={() => handleSelectPreset(card.preset)}
							className={`text-left p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
								isSelected
									? "border-primary bg-primary/5 shadow-lg shadow-primary/20"
									: "border-border bg-card hover:border-primary/50 hover:bg-card/80"
							}`}
						>
							{/* Card Header */}
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

							{/* Discord-style Preview */}
							<div className="bg-background rounded-md p-3 border border-border">
								{/* Listening to header */}
								<div className="text-xs font-medium text-muted-foreground mb-2">
									Listening to {displayActivityName}
								</div>

								<div className="flex items-start gap-3">
									{/* Album Art / Thumbnail */}
									{proxiedArtworkUrl ? (
										<img
											src={proxiedArtworkUrl}
											alt="Album artwork"
											className="w-16 h-16 rounded object-cover flex-shrink-0"
										/>
									) : (
										<div className="w-16 h-16 bg-gradient-to-br from-primary/30 to-primary/10 rounded flex items-center justify-center flex-shrink-0">
											<MusicNotes size={32} weight="fill" className="text-primary" />
										</div>
									)}

									{/* Content */}
									<div className="flex-1 min-w-0">
										<div className="text-sm font-semibold text-foreground truncate mb-0.5">
											{displayDetails}
										</div>
										<div className="text-xs text-muted-foreground truncate mb-0.5">
											{displayState}
										</div>
										<div className="text-xs text-muted-foreground truncate">
											{hasMediaInfo && mediaInfo.album ? mediaInfo.album : "A Night at the Opera"}
										</div>
										<div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
											<div className="w-full bg-muted rounded-full h-1">
												<div className="bg-primary h-1 rounded-full w-1/3" />
											</div>
											<span className="text-[10px]">1:23</span>
										</div>
									</div>
								</div>
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}
