import { cn } from "@renderer/lib/utils"
import type React from "react"

export type BadgeVariant = "neutral" | "accent"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant
}

const VARIANTS: Record<BadgeVariant, string> = {
	neutral: "bg-raised text-body",
	accent: "bg-brand-wash text-brand-text",
}

export function Badge({ variant = "neutral", className, ...props }: BadgeProps): JSX.Element {
	return (
		<span
			className={cn(
				// The eyebrow class carries the size and the uppercasing, the badge tightens the rest.
				"type-eyebrow inline-flex h-[18px] shrink-0 items-center rounded-pill px-[6px]",
				"font-semibold tracking-[0.04em]",
				VARIANTS[variant],
				className,
			)}
			{...props}
		/>
	)
}
