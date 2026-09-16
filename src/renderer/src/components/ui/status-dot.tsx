import { cn } from "@renderer/lib/utils"

export type StatusTone = "ok" | "warn" | "danger" | "neutral"

/**
 * `kind` is a tag rather than an optional label so a caller has to decide who
 * names the state. Colour on its own never carries it.
 */
export type StatusDotProps = {
	tone: StatusTone
	className?: string
} & ({ kind: "labelled"; label: string } | { kind: "decorative" })

const TONE_FILL: Record<StatusTone, string> = {
	ok: "bg-ok",
	warn: "bg-warn",
	danger: "bg-danger",
	neutral: "bg-faint",
}

export function StatusDot(props: StatusDotProps): JSX.Element {
	return (
		<>
			<span
				aria-hidden="true"
				className={cn(
					"size-2 shrink-0 rounded-full transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
					TONE_FILL[props.tone],
					props.className,
				)}
			/>
			{props.kind === "labelled" ? <span className="sr-only">{props.label}</span> : null}
		</>
	)
}
