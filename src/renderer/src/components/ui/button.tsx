import { cn } from "@renderer/lib/utils"
import React from "react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link"
export type ButtonSize = "sm" | "md" | "lg" | "icon"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant
	size?: ButtonSize
	isLoading?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
	primary: "bg-brand text-white hover:bg-brand-hover active:bg-brand-press",
	secondary: "bg-float text-body hover:bg-raised",
	ghost: "bg-transparent text-muted-foreground hover:bg-float hover:text-body",
	// Discord darkens the danger fill instead of tinting it, so hover and press are their own reds.
	danger: "bg-danger text-white hover:bg-[hsl(358_56%_41%)] active:bg-[hsl(358_58%_34%)]",
	link: "h-auto bg-transparent px-0 text-brand-text underline-offset-4 hover:underline",
}

const SIZES: Record<ButtonSize, string> = {
	sm: "h-8 rounded-sm px-3",
	md: "h-10 rounded-md px-4",
	lg: "h-11 rounded-md px-6",
	icon: "size-8 rounded-md",
}

const MOTION =
	"[transition:transform_var(--spring-press-duration)_var(--spring-press),background-color_var(--dur-tint)_var(--ease-out),border-color_var(--dur-tint)_var(--ease-out),color_var(--dur-tint)_var(--ease-out)]"

// The press must read the instant the pointer goes down, so only the release springs back.
// scale as a transform, not Tailwind's standalone scale property, so `.button` reduced motion bites.
const PRESS = "active:[transition:transform_100ms_var(--ease-out)] active:[transform:scale(0.97)]"

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "primary",
			size = "md",
			isLoading = false,
			children,
			disabled,
			type = "button",
			...props
		},
		ref,
	) => (
		<button
			ref={ref}
			type={type}
			className={cn(
				"button relative inline-flex cursor-pointer select-none items-center justify-center",
				"type-label whitespace-nowrap [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				"focus-discord disabled:pointer-events-none disabled:opacity-60",
				MOTION,
				PRESS,
				SIZES[size],
				VARIANTS[variant],
				className,
			)}
			disabled={isLoading || disabled}
			aria-busy={isLoading}
			{...props}
		>
			{isLoading && (
				<span className="absolute inset-0 grid place-items-center">
					<Spinner />
				</span>
			)}
			<span className={cn("inline-flex items-center gap-2", isLoading && "opacity-0")}>
				{children}
			</span>
		</button>
	),
)

Button.displayName = "Button"

// A spinner that eases wobbles, and the duration is inline so the class shorthand cannot win.
function Spinner(): JSX.Element {
	return (
		<svg
			className="spinner size-4 animate-spin"
			style={{ animationDuration: "600ms" }}
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
			<path
				d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	)
}

export { Button }
