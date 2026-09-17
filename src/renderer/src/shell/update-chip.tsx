import { useUpdateOffer } from "@renderer/features/updates"
import { cn } from "@renderer/lib/utils"
import { ArrowClockwise } from "phosphor-react"
import { useEffect, useId, useRef, useState } from "react"

// The same delays as the status chips, so crossing the header on the way to the
// window controls does not pop a panel open behind the pointer.
const HOVER_DELAY_MS = 140
const LEAVE_DELAY_MS = 220

/** Mirrors the status chip panel: the offset is padding, so the hit area reaches the control. */
const PANEL_ANCHOR = "absolute end-0 top-full z-50 pt-1"

const PANEL = cn(
	"flex w-[272px] flex-col gap-1",
	"rounded-lg border border-divider bg-float p-3 text-start",
	"shadow-[0_8px_24px_rgb(0_0_0/0.45)]",
	"opacity-100 transition-opacity ease-out-soft [transition-duration:var(--dur-tint)]",
	"starting:opacity-0",
)

/**
 * Chip metrics, so the pill sits on the same line as VLC and Discord. It enters
 * by fading and growing the last tenth, which is the whole of the animation: the
 * pill being there at all is the signal, and it reads the same with the movement
 * off.
 */
const PILL = cn(
	"update-pill focus-discord type-caption flex h-6 items-center gap-1.5",
	"rounded-pill px-2",
	"[transition:opacity_var(--dur-tint)_var(--ease-out),scale_var(--spring-enter-duration)_var(--spring-enter),background-color_var(--dur-tint)_var(--ease-out)]",
	"scale-100 opacity-100 starting:scale-90 starting:opacity-0",
)

/**
 * Appears only when there is a release to act on, and says which version and
 * what pressing it does. Pressing it is the action itself, not a menu: a button
 * labelled "Update to 5.0.0" that opens something is a button that lied.
 *
 * The panel repeats the description the button already carries for a screen
 * reader, which is why it is hidden from one.
 */
export function UpdateChip(): JSX.Element {
	const { offer, accept } = useUpdateOffer()
	const descriptionId = useId()
	const wrapper = useRef<HTMLDivElement>(null)
	const hoverTimer = useRef<number | null>(null)
	const leaveTimer = useRef<number | null>(null)
	const [isOpen, setOpen] = useState(false)
	const actionable = offer.kind === "install" || offer.kind === "release-page"

	useEffect(() => cancelHover, [])

	function cancelHover(): void {
		if (hoverTimer.current !== null) {
			window.clearTimeout(hoverTimer.current)
			hoverTimer.current = null
		}
		if (leaveTimer.current !== null) {
			window.clearTimeout(leaveTimer.current)
			leaveTimer.current = null
		}
	}

	function close(): void {
		cancelHover()
		setOpen(false)
	}

	return (
		<>
			{/* The live region outlives the pill, because a region inserted along
			    with its own content is not reliably read out. It is positioned, so
			    an empty header keeps its spacing exactly as it was. The download
			    announces itself, so only the arrival is announced here. */}
			<span className="sr-only" aria-live="polite">
				{actionable ? offer.label : ""}
			</span>

			<div
				ref={wrapper}
				className="no-drag relative empty:hidden"
				onPointerEnter={() => {
					cancelHover()
					hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
				}}
				onPointerLeave={() => {
					cancelHover()
					leaveTimer.current = window.setTimeout(close, LEAVE_DELAY_MS)
				}}
				onFocus={() => setOpen(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) {
						close()
					}
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape" && isOpen) {
						event.stopPropagation()
						close()
					}
				}}
			>
				{offer.kind === "working" && (
					<output className={cn(PILL, "bg-brand-wash text-brand-text")}>
						<ArrowClockwise className="size-3.5" aria-hidden="true" />
						<span>{offer.label}</span>
						{/* Text, not a bar: a reduced motion setting must not cost the number. */}
						<span className="min-w-[3ch] text-end tabular-nums">{offer.percent}%</span>
					</output>
				)}

				{actionable && (
					<>
						<button
							type="button"
							onClick={accept}
							aria-describedby={descriptionId}
							className={cn(
								PILL,
								"cursor-pointer bg-brand text-white",
								"hover:bg-brand-hover active:bg-brand-press",
							)}
						>
							<ArrowClockwise className="size-3.5" aria-hidden="true" />
							<span>{offer.label}</span>
						</button>

						{/* What the panel says, for someone who will never hover it. */}
						<span id={descriptionId} className="sr-only">
							{offer.detail}
						</span>
					</>
				)}

				{isOpen && offer.kind !== "none" && (
					<div aria-hidden="true" className={PANEL_ANCHOR}>
						<div className={PANEL}>
							<p className="type-label text-strong">Version {offer.version}</p>
							<p className="type-caption text-pretty text-muted-foreground">{offer.detail}</p>
						</div>
					</div>
				)}
			</div>
		</>
	)
}
