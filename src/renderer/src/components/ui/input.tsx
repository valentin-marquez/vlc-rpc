import { cn } from "@renderer/lib/utils"
import React from "react"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", ...props }, ref) => (
		<input
			ref={ref}
			type={type}
			className={cn(
				"type-body flex h-10 w-full rounded-sm border border-transparent bg-inset px-3 text-body",
				"placeholder:text-faint outline-none",
				// An offset ring on a full width field inside a padded card clips, so focus is a
				// border colour change plus a 1px inner shadow.
				"focus-visible:border-brand focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--brand))]",
				"aria-[invalid=true]:border-danger",
				"aria-[invalid=true]:shadow-[inset_0_0_0_1px_hsl(var(--danger))]",
				"disabled:cursor-not-allowed disabled:opacity-60",
				className,
			)}
			{...props}
		/>
	),
)

Input.displayName = "Input"

export { Input }
