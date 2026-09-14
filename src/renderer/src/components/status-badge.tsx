import {
	CheckCircledIcon,
	CrossCircledIcon,
	MinusCircledIcon,
	UpdateIcon,
} from "@radix-ui/react-icons"
import { cn } from "@renderer/lib/utils"
import type { ConnectionStatus } from "@shared/app/app.types"
interface StatusBadgeProps {
	status: ConnectionStatus | string
	className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element {
	switch (status) {
		case "connected":
			return (
				<span
					className={cn(
						"px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full",
						className,
					)}
				>
					Connected
				</span>
			)
		case "connecting":
			return (
				<span
					className={cn(
						"px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full animate-pulse",
						className,
					)}
				>
					Connecting...
				</span>
			)
		case "disconnected":
			return (
				<span
					className={cn(
						"px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full",
						className,
					)}
				>
					Disconnected
				</span>
			)
		case "error":
			return (
				<span
					className={cn(
						"px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full",
						className,
					)}
				>
					Error
				</span>
			)
		default:
			return (
				<span
					className={cn(
						"px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full",
						className,
					)}
				>
					{status}
				</span>
			)
	}
}

interface StatusIndicatorProps {
	type: ConnectionStatus
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

function StatusIcon({ type }: { type: ConnectionStatus }): JSX.Element {
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
