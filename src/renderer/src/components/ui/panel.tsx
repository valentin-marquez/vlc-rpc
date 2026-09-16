import { cn } from "@renderer/lib/utils"
import React from "react"

export interface PanelProps {
	/** Eyebrow above the panel. Also names the section for assistive technology. */
	label?: string
	className?: string
	children: React.ReactNode
}

export function Panel({ label, className, children }: PanelProps): JSX.Element {
	const labelId = React.useId()

	return (
		<section className="flex flex-col gap-2" aria-labelledby={label ? labelId : undefined}>
			{label && (
				<h2 id={labelId} className="type-eyebrow px-1 text-muted-foreground">
					{label}
				</h2>
			)}
			<div
				className={cn(
					"divide-y divide-divider overflow-hidden rounded-md border border-divider bg-card",
					className,
				)}
			>
				{children}
			</div>
		</section>
	)
}

interface RowBase {
	className?: string
	/**
	 * Slot on the trailing edge, after the control. Phase 4 hangs its per field override
	 * control here, one per row, so it stays clear of the row's own control.
	 */
	trailing?: React.ReactNode
}

export interface SettingRowProps extends RowBase {
	kind?: "setting"
	label: React.ReactNode
	description?: React.ReactNode
	/** The row's own control, on the trailing edge. */
	control?: React.ReactNode
	/** Id of the control, so the label text toggles it. */
	htmlFor?: string
}

export interface ValueRowProps extends RowBase {
	kind: "value"
	label: React.ReactNode
	value: React.ReactNode
}

export type RowProps = SettingRowProps | ValueRowProps

export function Row(props: RowProps): JSX.Element {
	if (props.kind === "value") {
		const { label, value, trailing, className } = props
		return (
			<div className={cn("flex min-h-8 items-center gap-4 px-4 py-1", className)}>
				<span className="type-caption w-24 shrink-0 text-muted-foreground">{label}</span>
				<span className="type-body min-w-0 flex-1 truncate text-body">{value}</span>
				{trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
			</div>
		)
	}

	const { label, description, control, trailing, htmlFor, className } = props

	return (
		<div className={cn("flex min-h-14 items-center gap-4 px-4 py-3", className)}>
			<div className="min-w-0 flex-1">
				{htmlFor ? (
					<label htmlFor={htmlFor} className="type-label cursor-pointer text-body">
						{label}
					</label>
				) : (
					<div className="type-label text-body">{label}</div>
				)}
				{description && (
					<p className="type-caption text-pretty text-muted-foreground">{description}</p>
				)}
			</div>
			{(control || trailing) && (
				<div className="flex shrink-0 items-center gap-2">
					{control}
					{trailing}
				</div>
			)}
		</div>
	)
}
