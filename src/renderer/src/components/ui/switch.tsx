import { cn } from "@renderer/lib/utils"
import React from "react"

export type SwitchProps = React.InputHTMLAttributes<HTMLInputElement>

// translateX as a transform, not Tailwind's standalone translate property, because the reduced
// motion block in the token layer neutralises transforms.
const KNOB =
	"absolute left-[3px] top-[3px] size-[18px] rounded-pill peer-checked:[transform:translateX(16px)]"

// The knob overshoots, the glyphs cross fade. Same spring on both so they travel together.
const KNOB_MOTION =
	"[transition:transform_var(--spring-bounce-duration)_var(--spring-bounce),opacity_var(--dur-tint)_var(--ease-out)]"

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
	({ className, disabled, ...props }, ref) => (
		<label
			className={cn(
				"relative inline-flex h-6 w-10 shrink-0 items-center",
				disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
				className,
			)}
		>
			<input ref={ref} type="checkbox" disabled={disabled} className="peer sr-only" {...props} />
			<span
				className={cn(
					"absolute inset-0 rounded-pill bg-raised",
					"transition-colors [transition-duration:var(--dur-tint)] ease-out-soft",
					"peer-checked:bg-brand",
					"peer-focus-visible:ring-2 peer-focus-visible:ring-brand-text",
					"peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
				)}
			/>
			<span
				className={cn(KNOB, KNOB_MOTION, "bg-white shadow-[0_1px_2px_rgb(0_0_0/0.35)]")}
				aria-hidden="true"
			/>
			<span
				className={cn(
					KNOB,
					KNOB_MOTION,
					"grid place-items-center text-faint peer-checked:opacity-0",
				)}
				aria-hidden="true"
			>
				<svg viewBox="0 0 10 10" className="size-[10px]" fill="none" aria-hidden="true">
					<path
						d="M2.2 2.2 7.8 7.8M7.8 2.2 2.2 7.8"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
			</span>
			<span
				className={cn(
					KNOB,
					KNOB_MOTION,
					"grid place-items-center text-brand opacity-0 peer-checked:opacity-100",
				)}
				aria-hidden="true"
			>
				<svg viewBox="0 0 10 10" className="size-[10px]" fill="none" aria-hidden="true">
					<path
						d="M2 5.3 4.1 7.4 8 3.1"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
		</label>
	),
)

Switch.displayName = "Switch"

export { Switch }
