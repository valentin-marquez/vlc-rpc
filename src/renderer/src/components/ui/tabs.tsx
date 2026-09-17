"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import type * as React from "react"

import { cn } from "@renderer/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-4", className)}
			{...props}
		/>
	)
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn("inline-flex h-10 w-fit items-center rounded-md bg-inset p-1", className)}
			{...props}
		/>
	)
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
				// 13px / 500 is the segmented control's own size, off the type scale on purpose.
				"rounded-sm px-3 type-label text-muted-foreground",
				"transition-colors [transition-duration:var(--dur-tint)] ease-out-soft",
				"hover:text-body focus-discord",
				"data-[state=active]:bg-float data-[state=active]:text-strong",
				"data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.35)]",
				"disabled:cursor-not-allowed disabled:opacity-45",
				"aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
				"[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	)
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	)
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
