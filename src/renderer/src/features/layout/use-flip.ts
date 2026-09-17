import { useLayoutEffect, useRef } from "react"

export interface Flip {
	track: (id: string) => (node: HTMLElement | null) => void
}

/**
 * Measure, then animate the difference. A piece that lands in a slot pushes the pieces
 * beside it and the lines under it, and moving them with a transform is what keeps that
 * push off the layout: animating height or margin would relayout the card on every frame.
 *
 * Under reduced motion the transform is cleared by globals.css, so every element simply
 * appears where it belongs. Nothing here is the only way to learn where a piece went.
 */
export function useFlip(): Flip {
	const nodes = useRef(new Map<string, HTMLElement>())
	const before = useRef(new Map<string, DOMRect>())

	useLayoutEffect(() => {
		const moved: HTMLElement[] = []
		const measured = new Map<string, DOMRect>()

		for (const [id, node] of nodes.current) {
			node.style.transition = "none"
			node.style.transform = ""

			const after = node.getBoundingClientRect()
			measured.set(id, after)

			const was = before.current.get(id)
			if (was === undefined) continue

			const dx = was.left - after.left
			const dy = was.top - after.top
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue

			node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
			moved.push(node)
		}

		before.current = measured
		if (moved.length === 0) return

		const frame = requestAnimationFrame(() => {
			for (const node of moved) {
				node.style.transition = "transform var(--spring-enter-duration) var(--spring-enter)"
				node.style.transform = ""
			}
		})

		return () => cancelAnimationFrame(frame)
	})

	return {
		track: (id) => (node) => {
			if (node === null) {
				nodes.current.delete(id)
				before.current.delete(id)
				return
			}
			nodes.current.set(id, node)
		},
	}
}
