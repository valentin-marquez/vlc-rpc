import { cn } from "@renderer/lib/utils"
import * as React from "react"

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => (
	<label
		className={cn(
			"inline-flex items-center cursor-pointer",
			props.disabled && "opacity-50 cursor-not-allowed",
			className,
		)}
	>
		<input type="checkbox" className="sr-only peer" ref={ref} {...props} />
		<div
			className={cn(
				"relative w-11 h-6 bg-secondary rounded-full peer",
				"peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary",
				"peer-checked:after:translate-x-full peer-checked:after:border-white",
				"after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
				"after:bg-white after:border-gray-300 after:border after:rounded-full",
				"after:h-5 after:w-5 after:transition-all",
				"peer-checked:bg-primary",
			)}
		/>
	</label>
))

Switch.displayName = "Switch"

export { Switch }
