import { SymbolIcon } from "@radix-ui/react-icons"
import { cn } from "@renderer/lib/utils"
import React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "default" | "outline" | "ghost" | "link" | "destructive"
	size?: "default" | "sm" | "lg" | "icon"
	isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "default",
			size = "default",
			isLoading = false,
			children,
			disabled,
			...props
		},
		ref,
	) => {
		return (
			<button
				className={cn(
					"inline-flex items-center justify-center font-medium transition-colors",
					"focus-discord",
					"disabled:opacity-60 disabled:pointer-events-none cursor-pointer",
					variant === "default" &&
						"bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
					variant === "destructive" &&
						"bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
					variant === "outline" &&
						"border border-border bg-transparent hover:bg-accent/10 text-foreground",
					variant === "ghost" && "hover:bg-secondary text-foreground hover:text-foreground",
					variant === "link" &&
						"text-primary underline-offset-4 hover:underline bg-transparent p-0",
					size === "default" && "h-10 py-2 px-4 text-sm rounded-md",
					size === "sm" && "h-8 px-3 text-xs rounded-sm",
					size === "lg" && "h-11 px-6 text-base rounded-lg",
					size === "icon" && "h-10 w-10 rounded-md",
					className,
				)}
				ref={ref}
				disabled={isLoading || disabled}
				{...props}
			>
				{isLoading ? (
					<div className="flex items-center">
						<SymbolIcon className="animate-spin mr-2 h-4 w-4" />
						<span>Loading...</span>
					</div>
				) : (
					children
				)}
			</button>
		)
	},
)

Button.displayName = "Button"

export { Button }
