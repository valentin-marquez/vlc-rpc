import {
	CheckCircledIcon,
	CrossCircledIcon,
	MinusCircledIcon,
	UpdateIcon,
} from "@radix-ui/react-icons"
import { cn } from "@renderer/lib/utils"

type StatusType = "connected" | "disconnected" | "error" | "connecting"

interface StatusIndicatorProps {
	type: StatusType
	label: string
	className?: string
}

export function StatusIndicator({ type, label, className }: StatusIndicatorProps): JSX.Element {
	return (
		<div className={cn("flex items-center text-card-foreground", className)}>
			<StatusIcon type={type} />
			<span className="ml-2 text-sm">{label}</span>
		</div>
	)
}

function StatusIcon({ type }: { type: StatusType }): JSX.Element {
	switch (type) {
		case "connected":
			return <CheckCircledIcon className="text-green-500" />
		case "disconnected":
			return <MinusCircledIcon className="text-muted-foreground" />
		case "error":
			return <CrossCircledIcon className="text-destructive" />
		case "connecting":
			return <UpdateIcon className="text-primary animate-spin" />
	}
}
