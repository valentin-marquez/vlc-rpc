import { logger } from "@renderer/lib/utils"
import type { LayoutLine, LayoutPiece } from "@shared/presence/layout"
import { useEffect, useRef, useState } from "react"

import type { DragOrigin, DragTarget } from "./use-piece-drag"

/**
 * A piece on the canvas. It carries an id because pieces are inserted and removed from the
 * middle of a line, and keying them by position would move what is typed in one chip into
 * the chip beside it.
 */
export interface DraftPiece {
	id: string
	piece: LayoutPiece
}

export type DraftLine = readonly DraftPiece[]

export interface LayoutDraft {
	lines: readonly DraftLine[]
	/** The arrangement with blank typed pieces dropped, which is what is drawn and saved. */
	cleaned: readonly LayoutLine[]
	isDirty: boolean
	isSaving: boolean
	saveFailed: boolean
	/** The piece that just landed, so it can settle into place rather than appear. */
	landed: string | null
	place: (target: DragTarget, piece: LayoutPiece) => void
	move: (origin: DragOrigin, target: DragTarget) => void
	remove: (lineIndex: number, pieceId: string) => void
	setText: (lineIndex: number, pieceId: string, words: string) => void
	replaceAll: (lines: readonly LayoutLine[]) => void
	discard: () => void
	save: () => Promise<void>
}

let nextId = 0

function held(piece: LayoutPiece): DraftPiece {
	nextId += 1
	return { id: `piece-${nextId}`, piece }
}

function toDraft(lines: readonly LayoutLine[]): readonly DraftLine[] {
	return lines.map((line) => line.map(held))
}

function clean(lines: readonly DraftLine[]): readonly LayoutLine[] {
	return lines.map((line) =>
		line
			.filter((entry) => entry.piece.kind !== "text" || entry.piece.text.trim() !== "")
			.map((entry) =>
				entry.piece.kind === "text"
					? { kind: "text" as const, text: entry.piece.text.trim() }
					: entry.piece,
			),
	)
}

function key(lines: readonly LayoutLine[]): string {
	return JSON.stringify(lines)
}

/**
 * The draft is held apart from the config on purpose: a piece dropped and picked up again
 * would otherwise be two writes to a profile nobody meant to change yet.
 */
export function useLayoutDraft(
	stored: readonly LayoutLine[],
	save: (lines: readonly LayoutLine[]) => Promise<void>,
): LayoutDraft {
	const storedKey = key(stored)
	const [lines, setLines] = useState<readonly DraftLine[]>(() => toDraft(stored))
	const [isSaving, setIsSaving] = useState(false)
	const [saveFailed, setSaveFailed] = useState(false)
	const [landed, setLanded] = useState<string | null>(null)
	const latest = useRef(stored)
	const synced = useRef(storedKey)

	latest.current = stored

	// A config change from anywhere else adopts only when there is nothing unsaved to lose.
	useEffect(() => {
		if (storedKey === synced.current) return
		const adopting = synced.current
		synced.current = storedKey
		setLines((current) => (key(clean(current)) === adopting ? toDraft(stored) : current))
	}, [storedKey, stored])

	const cleaned = clean(lines)

	function edit(change: (lines: readonly DraftLine[]) => readonly DraftLine[]): void {
		setSaveFailed(false)
		setLines(change)
	}

	function place(target: DragTarget, piece: LayoutPiece): void {
		const entry = held(piece)
		setLanded(entry.id)
		edit((current) =>
			current.map((line, index) =>
				index === target.lineIndex ? insertAt(line, target.index, entry) : line,
			),
		)
	}

	function move(origin: DragOrigin, target: DragTarget): void {
		const entry = lines[origin.lineIndex]?.find((one) => one.id === origin.pieceId)
		if (entry === undefined) return
		setLanded(entry.id)

		edit((current) => {
			const without = current.map((line, index) =>
				index === origin.lineIndex ? line.filter((one) => one.id !== origin.pieceId) : line,
			)
			// Taking the piece out first shifts everything after it, so a move to the right of
			// where it was has to land one place earlier than the pointer said.
			const shift =
				origin.lineIndex === target.lineIndex &&
				(current[origin.lineIndex]?.findIndex((one) => one.id === origin.pieceId) ?? 0) <
					target.index
					? 1
					: 0

			return without.map((line, index) =>
				index === target.lineIndex ? insertAt(line, target.index - shift, entry) : line,
			)
		})
	}

	function remove(lineIndex: number, pieceId: string): void {
		edit((current) =>
			current.map((line, index) =>
				index === lineIndex ? line.filter((one) => one.id !== pieceId) : line,
			),
		)
	}

	function setText(lineIndex: number, pieceId: string, words: string): void {
		edit((current) =>
			current.map((line, index) =>
				index === lineIndex
					? line.map((one) =>
							one.id === pieceId ? { ...one, piece: { kind: "text" as const, text: words } } : one,
						)
					: line,
			),
		)
	}

	async function runSave(): Promise<void> {
		const next = clean(lines)
		setIsSaving(true)
		setSaveFailed(false)

		try {
			await save(next)
			synced.current = key(next)
		} catch (error) {
			setSaveFailed(true)
			logger.error(`Failed to save the layout: ${error}`)
		} finally {
			setIsSaving(false)
		}
	}

	return {
		lines,
		cleaned,
		isDirty: key(cleaned) !== storedKey,
		isSaving,
		saveFailed,
		landed,
		place,
		move,
		remove,
		setText,
		replaceAll: (next) => {
			setLanded(null)
			edit(() => toDraft(next))
		},
		discard: () => {
			setLanded(null)
			edit(() => toDraft(latest.current))
		},
		save: runSave,
	}
}

function insertAt(line: DraftLine, index: number, entry: DraftPiece): DraftLine {
	const at = Math.max(0, Math.min(index, line.length))
	return [...line.slice(0, at), entry, ...line.slice(at)]
}
