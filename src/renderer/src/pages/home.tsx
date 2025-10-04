import { useStore } from "@nanostores/react"
import { PauseIcon, PlayIcon, StopIcon } from "@radix-ui/react-icons"
import { discordStatusStore, mediaInfoStore, mediaStatusStore } from "@renderer/stores/app-status"
import { checkDiscordStatus } from "@renderer/stores/discord"
import {
	mediaStore,
	getProxiedImage,
	refreshMediaInfo,
} from "@renderer/stores/media"
import {
	checkVlcConnection,
	refreshVlcStatus,
	vlcErrorStore,
	vlcStatusStore,
} from "@renderer/stores/vlc"
import { useEffect, useState } from "react"

export function Home(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const discordStatus = useStore(discordStatusStore)
	const mediaStatus = useStore(mediaStatusStore)
	const mediaInfo = useStore(mediaInfoStore)
	const media = useStore(mediaStore)
	const vlcError = useStore(vlcErrorStore)
	const [proxiedArtworkUrl, setProxiedArtworkUrl] = useState<string | null>(null)

	useEffect(() => {
		const checkStatus = async () => {
			await checkVlcConnection()
			await checkDiscordStatus()

			if (vlcStatusStore.get() === "connected") {
				await refreshVlcStatus()
				await refreshMediaInfo()
			}
		}

		checkStatus()
		const intervalId = setInterval(checkStatus, 5000)
		return () => clearInterval(intervalId)
	}, [])

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

	const displayTitle = media.title || mediaInfo.title
	const isEpisode = media.season !== null && media.episode !== null
	const isMovie = media.contentType === "movie" && media.year !== null

	return (
		<div className="max-w-3xl mx-auto">
			{vlcStatus === "error" && vlcError && (
				<div className="mb-6 bg-destructive/10 text-destructive p-4 rounded-md">
					<h3 className="font-semibold mb-1">Connection Error</h3>
					<p className="text-sm">{vlcError}</p>
				</div>
			)}

			<div className="mb-6">
				<div className="flex justify-between items-center mb-2">
					<h2 className="text-xl font-semibold">Connection Status</h2>
					<button
						type="button"
						onClick={async () => {
							await checkVlcConnection()
							await checkDiscordStatus()
						}}
						className="px-3 py-1 cursor-pointer text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20"
					>
						Refresh
					</button>
				</div>
				<div className="bg-card text-card-foreground rounded-md border border-border p-4">
					<div className="flex flex-col sm:flex-row sm:gap-8">
						<StatusItem label="VLC" status={vlcStatus} />
						<StatusItem label="Discord" status={discordStatus} />
					</div>
				</div>
			</div>

			<div>
				<div className="flex justify-between items-center mb-2">
					<h2 className="text-xl font-semibold">Now Playing</h2>
					{vlcStatus === "connected" && (
						<button
							type="button"
							onClick={async () => {
								await refreshVlcStatus()
								await refreshMediaInfo()
							}}
							className="px-3 py-1 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20"
						>
							Refresh
						</button>
					)}
				</div>

				{vlcStatus !== "connected" ? (
					<div className="bg-card text-card-foreground rounded-md border border-border p-8 text-center">
						<div className="text-muted-foreground mb-2">
							{vlcStatus === "connecting" ? (
								<span className="animate-pulse">Connecting to VLC...</span>
							) : (
								<>VLC is not connected</>
							)}
						</div>
						<p className="text-xs mt-2 text-muted-foreground">
							Make sure VLC is running with HTTP interface enabled
						</p>
					</div>
				) : !displayTitle ? (
					<div className="bg-card text-card-foreground rounded-md border border-border p-8 text-center">
						<StopIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
						<p className="text-muted-foreground">Nothing playing in VLC</p>
						<p className="text-xs mt-2 text-muted-foreground">
							Play something in VLC to see it here
						</p>
					</div>
				) : (
					<div className="bg-card text-card-foreground rounded-md border border-border p-4">
						<div className="flex flex-col sm:flex-row gap-4">
							{proxiedArtworkUrl ? (
								<div className="w-32 h-32 rounded-md overflow-hidden bg-muted flex-shrink-0 mx-auto sm:mx-0 border border-border/30">
									<img
										src={proxiedArtworkUrl}
										alt="Media artwork"
										className="w-full h-full object-cover"
									/>
								</div>
							) : (
								<div className="w-32 h-32 rounded-md overflow-hidden bg-muted flex-shrink-0 mx-auto sm:mx-0 flex items-center justify-center border border-border/30">
									<MusicIcon className="h-12 w-12 text-muted-foreground" />
								</div>
							)}

							<div className="flex-1">
								<div className="flex items-center mb-2">
									{mediaStatus === "playing" ? (
										<div className="flex items-center text-green-400 text-sm font-medium">
											<PlayIcon className="mr-1.5" />
											<span>Playing</span>
										</div>
									) : (
										<div className="flex items-center text-muted-foreground text-sm font-medium">
											<PauseIcon className="mr-1.5" />
											<span>Paused</span>
										</div>
									)}
									{media.contentType && (
										<span className="ml-2 px-2 py-0.5 bg-secondary/20 text-secondary text-xs rounded-full">
											{media.contentType === "tv_show"
												? "TV Show"
												: media.contentType === "movie"
													? "Movie"
													: media.contentType === "anime"
														? "Anime"
														: media.contentType === "audio"
															? "Audio"
															: media.contentType === "video"
																? "Video"
																: ""}
										</span>
									)}
								</div>

								<h3 className="font-semibold text-lg">{displayTitle}</h3>

								{isEpisode && (
									<p className="text-sm mt-1">
										Season {media.season} · Episode {media.episode}
									</p>
								)}

								{isMovie && media.year && (
									<p className="text-sm mt-1">{media.year}</p>
								)}

								{(mediaInfo.artist || media.artist) && (
									<p className="mt-1">{media.artist || mediaInfo.artist}</p>
								)}

								{mediaInfo.album && (
									<p className="text-sm text-muted-foreground">{mediaInfo.album}</p>
								)}

								{mediaInfo.duration && (
									<div className="mt-4">
										<div className="h-2 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full bg-primary"
												style={{
													width: `${((mediaInfo.position || 0) / mediaInfo.duration) * 100}%`,
												}}
											/>
										</div>
										<div className="flex justify-between mt-1 text-xs text-muted-foreground">
											<span>{formatTime(mediaInfo.position || 0)}</span>
											<span>{formatTime(mediaInfo.duration)}</span>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

interface StatusItemProps {
	label: string
	status: string
}

function StatusItem({ label, status }: StatusItemProps): JSX.Element {
	return (
		<div className="flex items-center py-1">
			<span className="font-medium w-16">{label}:</span>
			<StatusBadge status={status} />
		</div>
	)
}

function StatusBadge({ status }: { status: string }): JSX.Element {
	switch (status) {
		case "connected":
			return (
				<span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
					Connected
				</span>
			)
		case "connecting":
			return (
				<span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full animate-pulse">
					Connecting...
				</span>
			)
		case "disconnected":
			return (
				<span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">
					Disconnected
				</span>
			)
		case "error":
			return (
				<span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full">
					Error
				</span>
			)
		default:
			return (
				<span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">
					{status}
				</span>
			)
	}
}

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60)
	const secs = Math.floor(seconds % 60)
	return `${mins}:${secs.toString().padStart(2, "0")}`
}

function MusicIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
	return (
		<svg
			{...props}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Music</title>
			<path d="M9 18V5l12-2v13" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="16" r="3" />
		</svg>
	)
}
