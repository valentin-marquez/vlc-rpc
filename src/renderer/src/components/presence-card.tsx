import { cn } from "@renderer/lib/utils"
import { MusicNotes, Pause, Play, VideoCamera } from "phosphor-react"
import type { ReactNode } from "react"
import React from "react"

export type PresenceCardSize = "sm" | "lg"
export type PresenceCardIcon = "music" | "video"

export interface PresenceProgress {
	elapsedSeconds: number
	durationSeconds: number
}

export type PresenceBadgeKind = "playing" | "paused"

/**
 * Discord's small image, the chip overlapping the artwork. The app sends it as an
 * asset key rather than a URL and only ever sends two of them, so the card draws the
 * state the key stands for instead of an image it has no address for.
 */
export interface PresenceBadge {
	kind: PresenceBadgeKind
	/** What Discord shows on hover, its `small_text`. */
	text?: string | undefined
}

const BADGE_LABEL: Record<PresenceBadgeKind, string> = {
	playing: "Playing",
	paused: "Paused",
}

interface PresenceCardBase {
	size?: PresenceCardSize
	className?: string
	/** Which glyph stands in while there is no artwork to draw. */
	icon?: PresenceCardIcon
}

export interface PresenceCardLiveProps extends PresenceCardBase {
	kind: "presence"
	/** The verb on its own, above the body: "Listening", "Watching", "Playing". */
	header: string
	/**
	 * The activity's name, which Discord draws as the first body line and in bold.
	 * The app names an audio activity and nothing else, so a card without one closes
	 * up rather than holding the line open.
	 */
	name?: string
	/** Body line two. */
	details?: string
	/** Body line three. Discord draws no fourth one for a third party presence. */
	state?: string
	/** Hover text on the artwork, which is the only place Discord shows it. */
	largeText?: string
	artworkUrl?: string | null
	/** The small image, drawn over the artwork's trailing bottom corner. */
	badge?: PresenceBadge
	progress?: PresenceProgress
}

export interface PresenceCardEmptyProps extends PresenceCardBase {
	kind: "empty"
	header?: string
	message?: string
}

/**
 * The same card with its body lines handed over, so the Layout screen can arrange the
 * card itself rather than a drawing of one beside it. Everything around the lines, the
 * frame, the artwork, the badge and the type ramp, stays the card's own.
 */
export interface PresenceCardSlotsProps extends PresenceCardBase {
	kind: "slots"
	header: string
	name?: ReactNode
	details?: ReactNode
	state?: ReactNode
	badge?: PresenceBadge
	progress?: PresenceProgress
}

export type PresenceCardProps =
	| PresenceCardLiveProps
	| PresenceCardEmptyProps
	| PresenceCardSlotsProps

const ART: Record<PresenceCardSize, string> = { sm: "size-12", lg: "size-20" }
const PADDING: Record<PresenceCardSize, string> = { sm: "p-3", lg: "p-4" }
const GAP: Record<PresenceCardSize, string> = { sm: "gap-3", lg: "gap-4" }
const LINE: Record<PresenceCardSize, string> = { sm: "type-caption", lg: "type-body" }
// Both kinds hold the same body height at a size, so nothing jumps when playback stops.
const BODY: Record<PresenceCardSize, string> = { sm: "min-h-14", lg: "min-h-[92px]" }

const BADGE: Record<PresenceCardSize, string> = { sm: "size-4", lg: "size-6" }
const BADGE_GLYPH: Record<PresenceCardSize, number> = { sm: 8, lg: 12 }

const ART_RING = "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"

export function PresenceCard(props: PresenceCardProps): JSX.Element {
	const { size = "lg", className, icon = "music" } = props
	const isEmpty = props.kind === "empty"

	if (props.kind === "slots") {
		return <SlotsCard {...props} size={size} icon={icon} />
	}

	return (
		<div className={cn("rounded-md border border-divider bg-card", PADDING[size], className)}>
			<p className="type-eyebrow mb-2 truncate text-muted-foreground">
				{props.kind === "presence" ? props.header : (props.header ?? "No activity")}
			</p>

			<div className={cn("flex items-start", GAP[size], BODY[size])}>
				{isEmpty ? (
					<ArtworkPlaceholder size={size} icon={icon} />
				) : (
					// The badge hangs over the artwork's corner, so it sits outside the clip
					// that keeps the image inside its own rounded box.
					<div className="relative shrink-0">
						<Artwork
							key={props.artworkUrl ?? "none"}
							url={props.artworkUrl ?? null}
							size={size}
							icon={icon}
							hoverText={props.largeText}
						/>
						{props.badge && <SmallImage badge={props.badge} size={size} />}
					</div>
				)}

				<div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
					{props.kind === "empty" ? (
						<p className="type-body text-muted-foreground">
							{props.message ?? "Nothing is playing"}
						</p>
					) : (
						<>
							{/* A template that could not fill renders nothing, and Discord drops the
							    line rather than drawing a blank one. */}
							{props.name && (
								<p className="type-label truncate text-strong" title={props.name}>
									{props.name}
								</p>
							)}
							{props.details && (
								<p className={cn(LINE[size], "truncate text-body")} title={props.details}>
									{props.details}
								</p>
							)}
							{props.state && (
								<p className={cn(LINE[size], "truncate text-muted-foreground")} title={props.state}>
									{props.state}
								</p>
							)}
							{/* No timestamps are sent for a paused file, so a bar at all means playback
							    is running unless the small image says otherwise. */}
							{props.progress && (
								<Progress progress={props.progress} playback={props.badge?.kind ?? "playing"} />
							)}
						</>
					)}
				</div>
			</div>
		</div>
	)
}

function SlotsCard({
	size,
	icon,
	className,
	header,
	name,
	details,
	state,
	badge,
	progress,
}: PresenceCardSlotsProps & { size: PresenceCardSize; icon: PresenceCardIcon }): JSX.Element {
	return (
		<div className={cn("rounded-md border border-divider bg-card", PADDING[size], className)}>
			<p className="type-eyebrow mb-2 truncate text-muted-foreground">{header}</p>

			<div className={cn("flex items-start", GAP[size], BODY[size])}>
				<div className="relative shrink-0">
					<ArtworkPlaceholder size={size} icon={icon} />
					{badge && <SmallImage badge={badge} size={size} />}
				</div>

				<div className="flex min-w-0 flex-1 flex-col justify-center gap-1 self-stretch">
					{name !== undefined && <div className="type-label text-strong">{name}</div>}
					{details !== undefined && <div className={cn(LINE[size], "text-body")}>{details}</div>}
					{state !== undefined && (
						<div className={cn(LINE[size], "text-muted-foreground")}>{state}</div>
					)}
					{progress && <Progress progress={progress} playback={badge?.kind ?? "playing"} />}
				</div>
			</div>
		</div>
	)
}

function Artwork({
	url,
	size,
	icon,
	hoverText,
}: {
	url: string | null
	size: PresenceCardSize
	icon: PresenceCardIcon
	hoverText?: string | undefined
}): JSX.Element {
	const [loaded, setLoaded] = React.useState(false)

	if (!url) return <ArtworkPlaceholder size={size} icon={icon} />

	return (
		<div
			title={hoverText}
			className={cn("relative shrink-0 overflow-hidden rounded-md", ART[size], ART_RING)}
		>
			<ArtworkPlaceholder size={size} icon={icon} className="absolute inset-0" />
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

function SmallImage({
	badge,
	size,
}: {
	badge: PresenceBadge
	size: PresenceCardSize
}): JSX.Element {
	const Glyph = badge.kind === "paused" ? Pause : Play
	const label = BADGE_LABEL[badge.kind]

	return (
		<span
			title={badge.text ?? label}
			className={cn(
				"absolute -bottom-1 -end-1 grid place-items-center rounded-pill",
				"bg-raised text-strong ring-2 ring-card",
				BADGE[size],
			)}
		>
			<Glyph size={BADGE_GLYPH[size]} weight="fill" aria-hidden="true" />
			<span className="sr-only">{label}</span>
		</span>
	)
}

function ArtworkPlaceholder({
	size,
	icon,
	className,
}: {
	size: PresenceCardSize
	icon: PresenceCardIcon
	className?: string
}): JSX.Element {
	const Glyph = icon === "video" ? VideoCamera : MusicNotes

	return (
		<div
			className={cn(
				"grid shrink-0 place-items-center rounded-md bg-inset text-faint",
				ART[size],
				ART_RING,
				className,
			)}
		>
			<Glyph size={size === "lg" ? 28 : 20} weight="fill" aria-hidden="true" />
		</div>
	)
}

function Progress({
	progress,
	playback,
}: {
	progress: PresenceProgress
	playback: PresenceBadgeKind
}): JSX.Element {
	const { elapsedSeconds, durationSeconds } = progress
	const fraction =
		durationSeconds > 0 ? Math.min(Math.max(elapsedSeconds / durationSeconds, 0), 1) : 0
	const remaining = Math.max(durationSeconds - elapsedSeconds, 0)
	const fillRef = React.useRef<HTMLDivElement>(null)
	const animationRef = React.useRef<Animation | null>(null)
	const endsAtRef = React.useRef<number | null>(null)

	// The bar encodes elapsed time, so it runs to the end of the track at a linear
	// rate rather than stepping once per poll, which would visibly disagree with
	// the audio.
	//
	// It is not restarted on every poll though. Cancelling snaps the fill back to
	// whatever the data says, and that data crossed IPC a few hundred milliseconds
	// ago while the animation kept going, so restarting on each tick jumps the bar
	// backwards every time. Only a real move, a seek, a pause or a new track,
	// shifts where the track ends by enough to be worth retiming.
	React.useEffect(() => {
		const fill = fillRef.current
		if (!fill || remaining <= 0) return
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

		const endsAt = Date.now() + remaining * 1000
		const settled = endsAtRef.current
		if (animationRef.current && settled !== null && Math.abs(endsAt - settled) < 1500) {
			return
		}

		animationRef.current?.cancel()
		animationRef.current = fill.animate(
			[{ transform: `scaleX(${fraction})` }, { transform: "scaleX(1)" }],
			{ duration: remaining * 1000, easing: "linear", fill: "forwards" },
		)
		endsAtRef.current = endsAt
	}, [fraction, remaining])

	React.useEffect(
		() => () => {
			animationRef.current?.cancel()
		},
		[],
	)

	// The glyph repeats the small image on purpose: it is where Discord draws the
	// state next to the times, and the badge is where it draws the image itself.
	const Glyph = playback === "paused" ? Pause : Play

	return (
		<div className="type-caption mt-2 flex items-center gap-2 tabular-nums text-muted-foreground">
			<Glyph aria-hidden="true" weight="fill" className="size-3 shrink-0" />
			<span>{formatTime(elapsedSeconds)}</span>
			<div className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-inset">
				<div
					ref={fillRef}
					className="h-full w-full origin-left rounded-pill bg-brand"
					style={{ transform: `scaleX(${fraction})` }}
				/>
			</div>
			<span>{formatTime(durationSeconds)}</span>
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
