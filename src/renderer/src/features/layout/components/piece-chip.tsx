import { cn } from "@renderer/lib/utils"
import type { LayoutPiece } from "@shared/presence/layout"
import { X } from "phosphor-react"

import type { PointerEvent as ReactPointerEvent } from "react"
import { useEffect, useRef, useState } from "react"

import { Grip } from "./grip"

interface PieceChipProps {
	piece: LayoutPiece
	label: string
	/** What the piece draws for the example on screen, so the card reads before a drop. */
	drawn: string
	index: number
	slotLabel: string
	isLanding: boolean
	isLeaving: boolean
	isLifted: boolean
	trackNode: (node: HTMLElement | null) => void
	onGrab: (event: ReactPointerEvent<HTMLElement>) => void
	onRemove: () => void
	onNudge: (step: number) => void
	onLift: (step: number) => void
	onText: (words: string) => void
}

// The settle overshoots and comes back, which is what makes the piece read as a thing with
// weight rather than an element that switched on.
const SETTLE =
	"[transition:transform_var(--spring-bounce-duration)_var(--spring-bounce),opacity_var(--dur-tint)_var(--ease-out)]"

export function PieceChip({
	piece,
	label,
	drawn,
	index,
	slotLabel,
	isLanding,
	isLeaving,
	isLifted,
	trackNode,
	onGrab,
	onRemove,
	onNudge,
	onLift,
	onText,
}: PieceChipProps): JSX.Element {
	const [settled, setSettled] = useState(!isLanding)

	useEffect(() => {
		if (settled) return
		const frame = requestAnimationFrame(() => setSettled(true))
		return () => cancelAnimationFrame(frame)
	}, [settled])

	const resting = settled && !isLeaving

	return (
		<li
			ref={trackNode}
			data-piece-index={index}
			className={cn(
				"button inline-flex",
				// Flat and grey where it was, so the card still says where the piece came from.
				isLifted && "opacity-45 grayscale",
			)}
		>
			<span
				className={cn(
					"button inline-flex items-center rounded-pill",
					SETTLE,
					resting ? "opacity-100 [transform:scale(1)]" : "opacity-0 [transform:scale(0.85)]",
				)}
			>
				{piece.kind === "text" ? (
					<TextPiece
						piece={piece}
						slotLabel={slotLabel}
						onGrab={onGrab}
						onText={onText}
						onLift={onLift}
						onRemove={onRemove}
					/>
				) : (
					<button
						type="button"
						onPointerDown={onGrab}
						onClick={onRemove}
						onKeyDown={(event) => {
							if (event.key === "ArrowLeft") onNudge(-1)
							else if (event.key === "ArrowRight") onNudge(1)
							else if (event.key === "ArrowUp") onLift(-1)
							else if (event.key === "ArrowDown") onLift(1)
							else return
							event.preventDefault()
						}}
						title={label}
						aria-label={`${label}, ${drawn === "" ? "nothing to show" : drawn}, on the ${slotLabel}. Press to take it off, or use the arrow keys to move it.`}
						className={cn(
							"type-caption inline-flex cursor-grab touch-none select-none items-center gap-1",
							"rounded-pill px-2 py-[2px]",
							"focus-discord ring-inset active:cursor-grabbing",
							// A piece in the card reads as what it draws, because the card is the card.
							// Its name belongs in the palette, and only shows here when there is no value.
							drawn === ""
								? "bg-raised text-muted-foreground italic"
								: "bg-brand-wash text-brand-text",
						)}
					>
						<Grip />
						{drawn === "" ? label : drawn}
						<X size={10} weight="bold" aria-hidden="true" className="opacity-70" />
					</button>
				)}
			</span>
		</li>
	)
}

function TextPiece({
	piece,
	slotLabel,
	onGrab,
	onText,
	onLift,
	onRemove,
}: {
	piece: Extract<LayoutPiece, { kind: "text" }>
	slotLabel: string
	onGrab: (event: ReactPointerEvent<HTMLElement>) => void
	onText: (words: string) => void
	onLift: (step: number) => void
	onRemove: () => void
}): JSX.Element {
	const field = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (piece.text === "") field.current?.focus()
	}, [piece.text])

	return (
		<span
			onPointerDown={onGrab}
			className={cn(
				"inline-flex cursor-grab touch-none items-center gap-1 rounded-pill",
				"bg-raised px-2 py-[2px] text-body active:cursor-grabbing",
			)}
		>
			<Grip />
			<input
				ref={field}
				value={piece.text}
				size={Math.max(piece.text.length, 2)}
				spellCheck={false}
				aria-label={`Your own words on the ${slotLabel}`}
				placeholder="words"
				onPointerDown={(event) => event.stopPropagation()}
				onChange={(event) => onText(event.target.value)}
				onKeyDown={(event) => {
					if (!event.altKey) return
					if (event.key === "ArrowUp") onLift(-1)
					else if (event.key === "ArrowDown") onLift(1)
					else return
					event.preventDefault()
				}}
				className="type-caption min-w-0 border-none bg-transparent p-0 text-body outline-none placeholder:text-faint"
			/>
			<button
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={onRemove}
				aria-label={`Take your own words off the ${slotLabel}`}
				className="focus-discord ms-1 rounded-pill text-muted-foreground ring-inset hover:text-body"
			>
				<X size={10} weight="bold" aria-hidden="true" />
			</button>
		</span>
	)
}
