import type { LayoutPiece } from "@shared/presence/layout"
import type { PointerEvent as ReactPointerEvent } from "react"
import { useEffect, useRef, useState } from "react"

/** Where a dragged piece came from. Null means the palette, so the drop makes a new one. */
export interface DragOrigin {
	lineIndex: number
	pieceId: string
}

export interface DragTarget {
	lineIndex: number
	/** Where it would land among the pieces already on that line. */
	index: number
}

export interface DragState {
	piece: LayoutPiece
	label: string
	origin: DragOrigin | null
	/** Held so the piece sits under the finger exactly where it was grabbed. */
	offsetX: number
	offsetY: number
	x: number
	y: number
	/** Where it would go back to when it is dropped on nothing. */
	homeX: number
	homeY: number
	over: DragTarget | null
	/** A drag only counts once the pointer has really moved, so a click stays a click. */
	moved: boolean
	returning: boolean
}

const THRESHOLD = 4

export interface PieceDrag {
	state: DragState | null
	begin: (
		event: ReactPointerEvent<HTMLElement>,
		piece: LayoutPiece,
		label: string,
		origin: DragOrigin | null,
	) => void
	/** True while the pointer that just went up was a real drag, so the click is not a click. */
	consumedClick: () => boolean
}

/**
 * Pointer events rather than the native drag and drop API: its ghost image and its cursor
 * cannot be styled, and in a frameless Electron window it behaves worse than it looks.
 */
export function usePieceDrag(onDrop: (state: DragState, target: DragTarget) => void): PieceDrag {
	const [state, setState] = useState<DragState | null>(null)
	const pointer = useRef<number | null>(null)
	const dragged = useRef(false)
	const settling = useRef<number | null>(null)
	const held = useRef<DragState | null>(null)

	held.current = state

	useEffect(
		() => () => {
			if (settling.current !== null) window.clearTimeout(settling.current)
		},
		[],
	)

	useEffect(() => {
		if (state === null || state.returning) return

		function move(event: PointerEvent): void {
			if (event.pointerId !== pointer.current) return
			setState((current) => {
				if (current === null) return null
				const travelled =
					Math.abs(event.clientX - current.homeX - current.offsetX) +
					Math.abs(event.clientY - current.homeY - current.offsetY)
				const moved = current.moved || travelled > THRESHOLD
				return {
					...current,
					x: event.clientX,
					y: event.clientY,
					moved,
					over: moved ? targetAt(event.clientX, event.clientY) : null,
				}
			})
		}

		function end(event: PointerEvent): void {
			if (event.pointerId !== pointer.current) return
			pointer.current = null

			// The drop is read outside the updater on purpose: React may run an updater more
			// than once, and a piece would land twice from one gesture.
			const current = held.current
			if (current === null) return
			dragged.current = current.moved

			const target = current.moved ? targetAt(event.clientX, event.clientY) : null
			if (target !== null) {
				setState(null)
				onDrop(current, target)
				return
			}
			if (!current.moved) {
				setState(null)
				return
			}

			// Dropped on nothing, so it goes back where it was grabbed from rather than
			// disappearing, which would read as the app having eaten it.
			settling.current = window.setTimeout(() => setState(null), 240)
			setState({ ...current, returning: true, over: null })
		}

		window.addEventListener("pointermove", move)
		window.addEventListener("pointerup", end)
		window.addEventListener("pointercancel", end)

		return () => {
			window.removeEventListener("pointermove", move)
			window.removeEventListener("pointerup", end)
			window.removeEventListener("pointercancel", end)
		}
	}, [state, onDrop])

	return {
		state,
		begin(event, piece, label, origin) {
			if (event.button !== 0) return
			const rect = event.currentTarget.getBoundingClientRect()
			pointer.current = event.pointerId
			dragged.current = false

			// Capture keeps the stream on the piece when the pointer leaves the window. The
			// listeners below already cover the drag without it, so a refusal is not a failure.
			try {
				event.currentTarget.setPointerCapture(event.pointerId)
			} catch {
				// The pointer went away between the event and this call.
			}

			setState({
				piece,
				label,
				origin,
				offsetX: rect.left - event.clientX,
				offsetY: rect.top - event.clientY,
				x: event.clientX,
				y: event.clientY,
				homeX: rect.left,
				homeY: rect.top,
				over: null,
				moved: false,
				returning: false,
			})
		},
		consumedClick() {
			const was = dragged.current
			dragged.current = false
			return was
		},
	}
}

/**
 * Asking the document what is under the pointer beats caching rectangles: the card opens a
 * gap as the piece moves over it, and a cached rectangle would drop it where the slot was.
 */
function targetAt(x: number, y: number): DragTarget | null {
	const element = document.elementFromPoint(x, y)
	if (element === null) return null

	const slot = element.closest("[data-slot-index]")
	if (!(slot instanceof HTMLElement)) return null

	const lineIndex = Number(slot.dataset.slotIndex)
	if (!Number.isInteger(lineIndex)) return null

	const placed = [...slot.querySelectorAll("[data-piece-index]")].filter(
		(node): node is HTMLElement => node instanceof HTMLElement,
	)

	for (const node of placed) {
		const rect = node.getBoundingClientRect()
		if (x < rect.left + rect.width / 2) {
			return { lineIndex, index: Number(node.dataset.pieceIndex) }
		}
	}

	return { lineIndex, index: placed.length }
}
