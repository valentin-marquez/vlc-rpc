import { cn } from "@renderer/lib/utils"
import type { ReactNode } from "react"
import { useId } from "react"

interface LayoutCardProps<T extends string> {
	value: T
	name: string
	description: string
	/** Shared by every card in the group, which is what makes the arrow keys work. */
	groupName: string
	isSelected: boolean
	onSelect: (value: T) => void
	/** The preview, which differs between the music grid and the video one. */
	children: ReactNode
}

export function LayoutCard<T extends string>({
	value,
	name,
	description,
	groupName,
	isSelected,
	onSelect,
	children,
}: LayoutCardProps<T>): JSX.Element {
	const id = useId()

	const nameId = `${id}-name`
	const descriptionId = `${id}-description`

	return (
		<label
			className={cn(
				"block cursor-pointer rounded-md border p-4",
				"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				isSelected ? "border-brand bg-brand-wash" : "border-divider bg-card hover:bg-float",
				"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-text",
				"has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
			)}
		>
			<input
				type="radio"
				name={groupName}
				value={value}
				checked={isSelected}
				onChange={() => onSelect(value)}
				aria-labelledby={nameId}
				aria-describedby={descriptionId}
				className="sr-only"
			/>

			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<span id={nameId} className="type-label block text-strong">
						{name}
					</span>
					<span
						id={descriptionId}
						className="type-caption mt-1 block text-pretty text-muted-foreground"
					>
						{description}
					</span>
				</div>

				<RadioMark isSelected={isSelected} />
			</div>

			<div className="mt-3">{children}</div>
		</label>
	)
}

/**
 * The state of the radio the whole card stands in for. It carries no reduced motion
 * hook: the hook clears transforms outright, which would leave the dot at scale zero.
 */
function RadioMark({ isSelected }: { isSelected: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={cn(
				// 2px of optical nudge lines the circle up with the cap height of the name.
				"mt-[2px] grid size-4 shrink-0 place-items-center rounded-pill border-2",
				"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				isSelected ? "border-brand" : "border-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-2 rounded-pill bg-brand",
					"transition-transform ease-spring-snap",
					"[transition-duration:var(--spring-snap-duration)]",
					isSelected ? "[transform:scale(1)]" : "[transform:scale(0)]",
				)}
			/>
		</span>
	)
}
