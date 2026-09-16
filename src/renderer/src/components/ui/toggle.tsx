"use client"

import * as TogglePrimitive from "@radix-ui/react-toggle"
import { type VariantProps, cva } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@renderer/lib/utils"

const toggleVariants = cva(
	cn(
		"type-label inline-flex cursor-pointer select-none items-center justify-center gap-2",
		"whitespace-nowrap text-muted-foreground",
		"transition-colors [transition-duration:var(--dur-tint)] ease-out-soft",
		"hover:bg-float hover:text-body focus-discord",
		"data-[state=on]:bg-brand-wash data-[state=on]:text-brand-text",
		"disabled:pointer-events-none disabled:opacity-60",
		"[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	),
	{
		variants: {
			variant: {
				ghost: "bg-transparent",
				outline: "border border-divider bg-transparent",
			},
			size: {
				sm: "h-8 min-w-8 rounded-sm px-3",
				md: "h-10 min-w-10 rounded-md px-4",
				lg: "h-11 min-w-11 rounded-md px-6",
			},
		},
		defaultVariants: {
			variant: "ghost",
			size: "md",
		},
	},
)

function Toggle({
	className,
	variant,
	size,
	...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive.Root
			data-slot="toggle"
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Toggle, toggleVariants }
