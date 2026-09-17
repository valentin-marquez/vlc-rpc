import { PresenceCard } from "@renderer/components/presence-card"
import { Button } from "@renderer/components/ui/button"
import type { ActivityVerb } from "@renderer/features/media"
import { activityHeader, headerPrefix, usePresenceArtwork } from "@renderer/features/media"
import { cn } from "@renderer/lib/utils"
import type { LayoutPiece, PieceInfo } from "@shared/presence/layout"
import { drawnValue, pieceLabel, renderLine, textPiece, valuePiece } from "@shared/presence/layout"
import type { LayoutReport, RepeatGroup } from "@shared/presence/layout-builder"
import { groupRepeats } from "@shared/presence/layout-builder"
import type { LastSentPresence } from "@shared/presence/presence.types"
import { WarningCircle } from "phosphor-react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Fragment, useEffect, useId, useRef, useState } from "react"

import type { PreviewSample, SlotLabel } from "../layout.constants"
import { EXAMPLE_BADGE, cardDressing } from "../layout.mapper"
import { useFlip } from "../use-flip"
import type { LayoutDraft } from "../use-layout-draft"
import type { DragOrigin, DragState, DragTarget } from "../use-piece-drag"
import { usePieceDrag } from "../use-piece-drag"
import { Grip } from "./grip"
import { PieceChip } from "./piece-chip"

interface LayoutCanvasProps {
	draft: LayoutDraft
	slots: readonly SlotLabel[]
	pieces: readonly PieceInfo[]
	samples: readonly PreviewSample[]
	report: LayoutReport
	/** The word the header opens with, before whatever the activity is called. */
	verb: ActivityVerb
	/**
	 * What the app last handed to Discord. The card drawing the live file takes its cover,
	 * its small image and its times from there rather than working any of them out again,
	 * so it cannot show a profile something the loop never sent. It also carries what
	 * Discord calls the app, which is the header of an arrangement that names nothing and
	 * which nothing here could guess.
	 */
	presence: LastSentPresence
	/** The asset key the loop sends for a paused file, which is how a paused card is known. */
	pausedImage: string
	icon: "music" | "video"
	onReset: () => void
}

const REMOVE_MS = 130

export function LayoutCanvas({
	draft,
	slots,
	pieces,
	samples,
	report,
	verb,
	presence,
	pausedImage,
	icon,
	onReset,
}: LayoutCanvasProps): JSX.Element {
	const id = useId()
	const flip = useFlip()
	const [target, setTarget] = useState(0)
	const [leaving, setLeaving] = useState<string | null>(null)
	const [announcement, setAnnouncement] = useState("")
	const timer = useRef<number | null>(null)

	const drag = usePieceDrag((state, dropped) => {
		if (state.origin === null) {
			draft.place(dropped, state.piece)
			announce(`${state.label} added to the ${slotName(dropped.lineIndex)}.`)
			return
		}
		draft.move(state.origin, dropped)
		announce(`${state.label} moved to the ${slotName(dropped.lineIndex)}.`)
	})

	useEffect(() => {
		if (drag.state === null || !drag.state.moved) return
		const previous = document.body.style.cursor
		document.body.style.cursor = "grabbing"
		return () => {
			document.body.style.cursor = previous
		}
	}, [drag.state])

	// The live file is always the first sample, so it is the only card with a cover to
	// fetch. The ones under it are examples, and an example has none.
	const primary = samples[0]
	const others = samples.slice(1)
	const dressing = cardDressing(primary, presence, pausedImage)
	const artworkUrl = usePresenceArtwork(dressing.largeImage)
	const applicationName = presence.kind === "sent" ? presence.applicationName : null
	const repeats = groupRepeats(report.repeats)
	const canSave = draft.isDirty && report.stranded.length === 0

	function slotName(index: number): string {
		return slots[index]?.inSentence ?? "line"
	}

	function announce(what: string): void {
		setAnnouncement(what)
	}

	// A drag ends in a click on the piece that was grabbed, and that click must not add a
	// second copy of what was just dropped.
	function add(piece: LayoutPiece, label: string): void {
		if (drag.consumedClick()) return
		const line = draft.lines[target]
		draft.place({ lineIndex: target, index: line?.length ?? 0 }, piece)
		announce(`${label} added to the ${slotName(target)}.`)
	}

	function requestRemove(lineIndex: number, pieceId: string, label: string): void {
		if (drag.consumedClick()) return
		setLeaving(pieceId)
		if (timer.current !== null) window.clearTimeout(timer.current)
		timer.current = window.setTimeout(
			() => {
				draft.remove(lineIndex, pieceId)
				setLeaving(null)
			},
			window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : REMOVE_MS,
		)
		announce(`${label} taken off the ${slotName(lineIndex)}.`)
	}

	function nudge(lineIndex: number, pieceId: string, step: number): void {
		const line = draft.lines[lineIndex] ?? []
		const at = line.findIndex((one) => one.id === pieceId)
		if (at < 0) return
		const next = at + step
		if (next < 0 || next >= line.length) return
		draft.move({ lineIndex, pieceId }, { lineIndex, index: step > 0 ? next + 1 : next })
	}

	function lift(lineIndex: number, pieceId: string, step: number): void {
		const next = lineIndex + step
		if (next < 0 || next >= slots.length) return
		draft.move({ lineIndex, pieceId }, { lineIndex: next, index: draft.lines[next]?.length ?? 0 })
		setTarget(next)
		announce(`Moved to the ${slotName(next)}.`)
	}

	return (
		<div className="grid gap-6 @min-[640px]:grid-cols-[200px_minmax(0,1fr)]">
			<fieldset className="flex min-w-0 flex-col gap-3">
				<legend className="type-eyebrow mb-2 text-muted-foreground">Pieces</legend>

				<div className="flex flex-wrap gap-2 @min-[640px]:flex-col @min-[640px]:items-start">
					{pieces.map((piece) => (
						<PalettePiece
							key={piece.name}
							label={piece.label}
							held={primary === undefined ? "" : drawnValue(piece.name, primary.variables)}
							isLifted={
								drag.state?.origin === null && drag.state.label === piece.label && drag.state.moved
							}
							onGrab={(event) => drag.begin(event, valuePiece(piece.name), piece.label, null)}
							onAdd={() => add(valuePiece(piece.name), piece.label)}
						/>
					))}
					<PalettePiece
						label="Your own words"
						held="type anything"
						isLifted={
							drag.state?.origin === null &&
							drag.state.label === "Your own words" &&
							drag.state.moved
						}
						onGrab={(event) => drag.begin(event, textPiece(""), "Your own words", null)}
						onAdd={() => add(textPiece(""), "Your own words")}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<span id={`${id}-target`} className="type-eyebrow text-muted-foreground">
						Add to
					</span>
					<div role="radiogroup" aria-labelledby={`${id}-target`} className="flex flex-col gap-1">
						{slots.map((slot, index) => (
							<label
								key={slot.label}
								className={cn(
									"type-caption flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1",
									"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
									"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-text",
									index === target ? "bg-brand-wash text-brand-text" : "text-muted-foreground",
								)}
							>
								<input
									type="radio"
									name={`${id}-slot`}
									checked={index === target}
									onChange={() => setTarget(index)}
									className="sr-only"
								/>
								{slot.label}
							</label>
						))}
					</div>
				</div>
			</fieldset>

			<div className="flex min-w-0 flex-col gap-4">
				<div className="flex flex-col gap-2">
					{/* Which file the pieces are showing their values for. It says "What is playing"
					    the moment VLC reports one, which is the whole point of holding this card up
					    beside the real Discord window. */}
					{primary !== undefined && (
						<span className="type-caption text-faint">{primary.label}</span>
					)}
					<div className="rounded-lg border border-divider bg-inset p-4">
						<PresenceCard
							kind="slots"
							icon={icon}
							artworkUrl={artworkUrl}
							badge={dressing.badge}
							progress={dressing.progress}
							{...slotNodes()}
						/>
					</div>
				</div>

				{others.map((sample) => (
					<div key={sample.id} className="flex flex-col gap-2">
						<span className="type-caption text-faint">The same pieces for {sample.inSentence}</span>
						{/* No cover and no times: this file is not playing, and an example that
						    drew either would be showing something nobody could check. */}
						<PresenceCard
							kind="presence"
							size="sm"
							icon={icon}
							badge={EXAMPLE_BADGE}
							{...drawnCard(sample)}
							artworkUrl={null}
						/>
					</div>
				))}

				<div className="flex flex-col gap-2">
					{report.stranded.map((stray) => (
						<Note
							key={`${stray.lineId}-${stray.text}`}
							tone="problem"
							words={`"${stray.text}" would be drawn with nothing to separate, so it would sit on your profile as a stray mark.`}
						/>
					))}
					{repeats.map((repeat) => (
						<Note
							key={`${repeat.variable}-${repeat.lineIds.join()}`}
							tone="warning"
							words={describeRepeat(repeat, report, samples, pieces)}
						/>
					))}
					{/* A line empty for one example and not the other is the pieces doing their job,
					    and the card below shows it. A line empty for every example shows nowhere. */}
					{report.lines
						.filter((line) => line.neverDraws)
						.map((line) => (
							<Note
								key={line.id}
								tone="warning"
								words={`${line.label} draws nothing in either example, so Discord would leave it off.`}
							/>
						))}
				</div>

				<div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-4">
					<p id={`${id}-status`} className="type-caption text-muted-foreground">
						{status()}
					</p>
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="sm" onClick={onReset}>
							Reset to the default
						</Button>
						{draft.isDirty && (
							<Button variant="ghost" size="sm" onClick={draft.discard}>
								Discard changes
							</Button>
						)}
						<Button
							size="sm"
							isLoading={draft.isSaving}
							aria-disabled={!canSave}
							aria-describedby={`${id}-status`}
							className={cn(!canSave && "opacity-60")}
							onClick={() => {
								if (canSave) void draft.save()
							}}
						>
							Save
						</Button>
					</div>
				</div>
			</div>

			<p aria-live="polite" className="sr-only">
				{announcement}
			</p>

			{drag.state?.moved === true && <Ghost state={drag.state} />}
		</div>
	)

	function status(): string {
		if (draft.saveFailed) return "Could not save. Try again."
		if (report.stranded.length > 0) return "Take the stray mark off, then save."
		if (draft.isDirty) return "You have unsaved changes."
		return "Saved. Discord catches up within a few seconds."
	}

	/**
	 * The slots handed to the card where Discord draws each of them: one may run on from
	 * the verb in the header, and the rest are the body lines, in order.
	 */
	function slotNodes(): {
		header: JSX.Element
		details?: JSX.Element | undefined
		state?: JSX.Element | undefined
		largeText?: JSX.Element | undefined
	} {
		const nodes = slots.map((slot, index) => (
			<Slot
				key={slot.label}
				label={slot.label}
				whenEmpty={slot.whenEmpty}
				index={index}
				line={draft.lines[index] ?? []}
				pieces={pieces}
				sample={primary}
				isTarget={index === target}
				over={drag.state?.over ?? null}
				dragging={drag.state}
				flip={flip}
				landed={draft.landed}
				leaving={leaving}
				onSelect={() => setTarget(index)}
				onGrab={(event, origin, piece, label) => drag.begin(event, piece, label, origin)}
				onRemove={(pieceId, label) => requestRemove(index, pieceId, label)}
				onNudge={(pieceId, step) => nudge(index, pieceId, step)}
				onLift={(pieceId, step) => lift(index, pieceId, step)}
				onText={(pieceId, words) => draft.setText(index, pieceId, words)}
			/>
		))

		const headerAt = slots.findIndex((slot) => slot.place === "header")
		const body = nodes.filter((_, index) => slots[index]?.place === "body")
		const headerSlot = headerAt < 0 ? undefined : nodes[headerAt]

		return {
			header:
				headerSlot === undefined ? (
					<span className="truncate">{activityHeader(verb, applicationName)}</span>
				) : (
					<>
						<span className="shrink-0">{headerPrefix(verb)}</span>
						{/* The header is drawn in the card's eyebrow type, which is uppercase and
						    tracked out. The pieces inside it are words, not an eyebrow. */}
						<span className="min-w-0 flex-1 normal-case tracking-normal">{headerSlot}</span>
					</>
				),
			details: body[0],
			state: body[1],
			largeText: body[2],
		}
	}

	/** The same arrangement drawn for another example, exactly as the profile would draw it. */
	function drawnCard(sample: PreviewSample): {
		header: string
		details: string
		state: string
		largeText: string
	} {
		const drawn = slots.map((slot, index) => ({
			place: slot.place,
			text: renderLine(draft.cleaned[index] ?? [], sample.variables),
		}))
		const named = drawn.find((line) => line.place === "header")?.text ?? ""
		const body = drawn.filter((line) => line.place === "body")

		return {
			header: activityHeader(verb, named === "" ? applicationName : named),
			details: body[0]?.text ?? "",
			state: body[1]?.text ?? "",
			largeText: body[2]?.text ?? "",
		}
	}
}

interface SlotProps {
	label: string
	whenEmpty?: string | undefined
	index: number
	line: LayoutDraft["lines"][number]
	pieces: readonly PieceInfo[]
	sample: PreviewSample | undefined
	isTarget: boolean
	over: DragTarget | null
	dragging: DragState | null
	flip: ReturnType<typeof useFlip>
	landed: string | null
	leaving: string | null
	onSelect: () => void
	onGrab: (
		event: ReactPointerEvent<HTMLElement>,
		origin: DragOrigin,
		piece: LayoutPiece,
		label: string,
	) => void
	onRemove: (pieceId: string, label: string) => void
	onNudge: (pieceId: string, step: number) => void
	onLift: (pieceId: string, step: number) => void
	onText: (pieceId: string, words: string) => void
}

function Slot({
	label,
	whenEmpty,
	index,
	line,
	pieces,
	sample,
	isTarget,
	over,
	dragging,
	flip,
	landed,
	leaving,
	onSelect,
	onGrab,
	onRemove,
	onNudge,
	onLift,
	onText,
}: SlotProps): JSX.Element {
	const opening = over?.lineIndex === index ? over.index : null

	return (
		<div
			ref={flip.track(`slot-${index}`)}
			data-slot-index={index}
			onPointerDown={onSelect}
			className={cn(
				// Every line is drawn as a place something goes, which is what a dashed outline says.
				"-mx-1 flex min-h-7 flex-wrap items-center gap-1 rounded-sm border border-dashed px-1 py-[2px]",
				"border-divider transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				opening !== null && "border-solid border-brand bg-brand-wash",
				opening === null && isTarget && "border-muted-foreground",
			)}
		>
			<ul className="contents">
				{line.map((entry, position) => (
					<Fragment key={entry.id}>
						{opening === position && <Opening label={dragging?.label ?? ""} />}
						<PieceChip
							piece={entry.piece}
							label={pieceLabel(entry.piece, pieces)}
							drawn={
								entry.piece.kind === "value" && sample !== undefined
									? drawnValue(entry.piece.name, sample.variables)
									: ""
							}
							index={position}
							slotLabel={label}
							isLanding={landed === entry.id}
							isLeaving={leaving === entry.id}
							isLifted={dragging?.origin?.pieceId === entry.id && dragging.moved}
							trackNode={flip.track(entry.id)}
							onGrab={(event) =>
								onGrab(
									event,
									{ lineIndex: index, pieceId: entry.id },
									entry.piece,
									pieceLabel(entry.piece, pieces),
								)
							}
							onRemove={() => onRemove(entry.id, pieceLabel(entry.piece, pieces))}
							onNudge={(step) => onNudge(entry.id, step)}
							onLift={(step) => onLift(entry.id, step)}
							onText={(words) => onText(entry.id, words)}
						/>
					</Fragment>
				))}
				{opening === line.length && <Opening label={dragging?.label ?? ""} />}
			</ul>

			{line.length === 0 && opening === null && (
				<span className="type-caption text-faint">{whenEmpty ?? `${label}, empty`}</span>
			)}
		</div>
	)
}

/**
 * The place the piece is about to take, at its own size, drawn flat and grey. Held together
 * with the ghost it left behind, the two say where it came from and where it is going.
 */
function Opening({ label }: { label: string }): JSX.Element {
	return (
		<li
			aria-hidden="true"
			className="type-caption inline-flex items-center rounded-pill bg-raised px-2 py-[2px] text-transparent"
		>
			{label || "here"}
		</li>
	)
}

function PalettePiece({
	label,
	held,
	isLifted,
	onGrab,
	onAdd,
}: {
	label: string
	held: string
	isLifted: boolean
	onGrab: (event: ReactPointerEvent<HTMLElement>) => void
	onAdd: () => void
}): JSX.Element {
	return (
		<button
			type="button"
			onPointerDown={onGrab}
			onClick={onAdd}
			aria-label={`Add ${label}`}
			className={cn(
				"button flex w-full cursor-grab touch-none select-none items-center gap-2",
				"rounded-md border border-divider bg-card px-3 py-2 text-start",
				"focus-discord hover:bg-float active:cursor-grabbing",
				"[transition:transform_var(--spring-press-duration)_var(--spring-press),background-color_var(--dur-tint)_var(--ease-out),opacity_var(--dur-tint)_var(--ease-out)]",
				"active:[transform:scale(0.97)]",
				// The piece it left behind, flat and grey, so the palette still says where it came from.
				isLifted && "opacity-45 grayscale",
			)}
		>
			<Grip />
			<span className="flex min-w-0 flex-col">
				<span className="type-label text-strong">{label}</span>
				<span className="type-caption truncate text-muted-foreground">
					{held || "nothing here"}
				</span>
			</span>
		</button>
	)
}

function Ghost({ state }: { state: DragState }): JSX.Element {
	const x = state.returning ? state.homeX : state.x + state.offsetX
	const y = state.returning ? state.homeY : state.y + state.offsetY

	return (
		<div
			aria-hidden="true"
			style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
			className={cn(
				"pointer-events-none fixed top-0 left-0 z-50",
				state.returning &&
					"[transition:transform_var(--spring-enter-duration)_var(--spring-enter)]",
			)}
		>
			{/* A chip is small, so the tilt is smaller than a kanban card's: enough to read as
			    picked up, not enough to look broken at this size. */}
			<span
				className={cn(
					"type-caption inline-flex items-center gap-1 rounded-pill px-2 py-[2px]",
					"cursor-grabbing bg-brand-wash text-brand-text ring-1 ring-brand",
					"shadow-[0_10px_24px_rgb(0_0_0/0.45)] [transform:rotate(3deg)_scale(1.06)]",
				)}
			>
				<Grip />
				{state.label}
			</span>
		</div>
	)
}

function Note({
	tone,
	words,
}: {
	tone: "problem" | "warning" | "muted"
	words: string
}): JSX.Element {
	const colour =
		tone === "problem"
			? "text-danger-text"
			: tone === "warning"
				? "text-warn-text"
				: "text-muted-foreground"

	return (
		<p className={cn("type-caption flex items-start gap-2 text-pretty", colour)}>
			{tone !== "muted" && (
				<WarningCircle size={14} weight="fill" aria-hidden="true" className="mt-[2px] shrink-0" />
			)}
			<span>{words}</span>
		</p>
	)
}

function describeRepeat(
	repeat: RepeatGroup,
	report: LayoutReport,
	samples: readonly PreviewSample[],
	pieces: readonly PieceInfo[],
): string {
	const where = join(
		repeat.lineIds.map(
			(lineId) => report.lines.find((line) => line.id === lineId)?.label ?? lineId,
		),
	)
	const when =
		repeat.sampleIds.length === samples.length
			? ""
			: ` for ${join(
					repeat.sampleIds.map(
						(sampleId) => samples.find((one) => one.id === sampleId)?.inSentence ?? sampleId,
					),
				)}`

	if (repeat.sameText) return `${where} show the same thing${when}. Discord draws both.`

	const noun = pieces.find((info) => info.name === repeat.variable)?.noun ?? repeat.variable
	return `The ${noun} shows on ${where}${when}.`
}

function join(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? ""
	return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
