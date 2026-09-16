import { cn } from "@renderer/lib/utils"
import { MusicNotes } from "phosphor-react"
import React from "react"

export type PresenceCardSize = "sm" | "lg"

export interface PresenceProgress {
	elapsedSeconds: number
	durationSeconds: number
	paused?: boolean
}

interface PresenceCardBase {
	size?: PresenceCardSize
	className?: string
}

export interface PresenceCardLiveProps extends PresenceCardBase {
	kind: "presence"
	/** The whole header line Discord draws, verb included: "Listening to Queen". */
	header: string
	/** Line one. */
	details: string
	/** Line two. */
	state?: string
	/** Line three, the large image text this app sends as the album. */
	largeText?: string
	artworkUrl?: string | null
	progress?: PresenceProgress
}

export interface PresenceCardEmptyProps extends PresenceCardBase {
	kind: "empty"
	header?: string
	message?: string
}

export type PresenceCardProps = PresenceCardLiveProps | PresenceCardEmptyProps

const ART: Record<PresenceCardSize, string> = { sm: "size-12", lg: "size-20" }
const PADDING: Record<PresenceCardSize, string> = { sm: "p-3", lg: "p-4" }
const GAP: Record<PresenceCardSize, string> = { sm: "gap-3", lg: "gap-4" }
const LINE: Record<PresenceCardSize, string> = { sm: "type-caption", lg: "type-body" }
// Both kinds hold the same body height at a size, so nothing jumps when playback stops.
const BODY: Record<PresenceCardSize, string> = { sm: "min-h-14", lg: "min-h-[92px]" }

const ART_RING = "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"

export function PresenceCard(props: PresenceCardProps): JSX.Element {
	const { size = "lg", className } = props
	const isEmpty = props.kind === "empty"

	return (
		<div className={cn("rounded-md border border-divider bg-card", PADDING[size], className)}>
			<p className="type-eyebrow mb-2 truncate text-muted-foreground">
				{props.kind === "presence" ? props.header : (props.header ?? "No activity")}
			</p>

			<div className={cn("flex items-start", GAP[size], BODY[size])}>
				{isEmpty ? (
					<ArtworkPlaceholder size={size} />
				) : (
					<Artwork key={props.artworkUrl ?? "none"} url={props.artworkUrl ?? null} size={size} />
				)}

				<div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
					{props.kind === "empty" ? (
						<p className="type-body text-muted-foreground">
							{props.message ?? "Nothing is playing"}
						</p>
					) : (
						<>
							<p className="type-label truncate text-strong" title={props.details}>
								{props.details}
							</p>
							{props.state && (
								<p className={cn(LINE[size], "truncate text-body")} title={props.state}>
									{props.state}
								</p>
							)}
							{props.largeText && (
								<p
									className={cn(LINE[size], "truncate text-muted-foreground")}
									title={props.largeText}
								>
									{props.largeText}
								</p>
							)}
							{props.progress && <Progress progress={props.progress} />}
						</>
					)}
				</div>
			</div>
		</div>
	)
}

function Artwork({
	url,
	size,
}: {
	url: string | null
	size: PresenceCardSize
}): JSX.Element {
	const [loaded, setLoaded] = React.useState(false)

	if (!url) return <ArtworkPlaceholder size={size} />

	return (
		<div className={cn("relative shrink-0 overflow-hidden rounded-md", ART[size], ART_RING)}>
			<ArtworkPlaceholder size={size} className="absolute inset-0" />
			<img
				src={url}
				alt=""
				onLoad={() => setLoaded(true)}
				className={cn(
					"absolute inset-0 size-full object-cover",
					"transition-opacity duration-200 ease-out-soft",
					loaded ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	)
}

function ArtworkPlaceholder({
	size,
	className,
}: {
	size: PresenceCardSize
	className?: string
}): JSX.Element {
	return (
		<div
			className={cn(
				"grid shrink-0 place-items-center rounded-md bg-inset text-faint",
				ART[size],
				ART_RING,
				className,
			)}
		>
			<MusicNotes size={size === "lg" ? 28 : 20} weight="fill" aria-hidden="true" />
		</div>
	)
}

function Progress({ progress }: { progress: PresenceProgress }): JSX.Element {
	const { elapsedSeconds, durationSeconds, paused = false } = progress
	const fraction =
		durationSeconds > 0 ? Math.min(Math.max(elapsedSeconds / durationSeconds, 0), 1) : 0
	const remaining = Math.max(durationSeconds - elapsedSeconds, 0)
	const fillRef = React.useRef<HTMLDivElement>(null)

	// The bar encodes elapsed time, so it runs to the end of the track at a linear rate and is
	// retimed on each poll. Stepping it per poll would visibly disagree with the audio.
	React.useEffect(() => {
		const fill = fillRef.current
		if (!fill || remaining <= 0) return
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

		const animation = fill.animate(
			[{ transform: `scaleX(${fraction})` }, { transform: "scaleX(1)" }],
			{ duration: remaining * 1000, easing: "linear", fill: "forwards" },
		)
		if (paused) animation.pause()

		return () => animation.cancel()
	}, [fraction, remaining, paused])

	return (
		<div className="mt-2">
			<div className="h-1 w-full overflow-hidden rounded-pill bg-inset">
				<div
					ref={fillRef}
					className="h-full w-full origin-left rounded-pill bg-brand"
					style={{ transform: `scaleX(${fraction})` }}
				/>
			</div>
			<div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
				<span>{formatTime(elapsedSeconds)}</span>
				<span>{formatTime(durationSeconds)}</span>
			</div>
		</div>
	)
}

function formatTime(seconds: number): string {
	const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
	const hours = Math.floor(safe / 3600)
	const minutes = Math.floor((safe % 3600) / 60)
	const rest = safe % 60

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`
	}
	return `${minutes}:${rest.toString().padStart(2, "0")}`
}
