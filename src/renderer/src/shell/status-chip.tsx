import { useStore } from "@nanostores/react"
import { StatusDot, type StatusTone } from "@renderer/components/ui/status-dot"
import { checkDiscordStatus, discordStatusStore } from "@renderer/features/discord"
import { checkVlcConnection, vlcStatusStore } from "@renderer/features/vlc"
import { cn } from "@renderer/lib/utils"
import type { ConnectionStatus } from "@shared/app/app.types"

export function connectionTone(status: ConnectionStatus): StatusTone {
	switch (status) {
		case "connected":
			return "ok"
		case "connecting":
			return "warn"
		case "error":
			return "danger"
		case "disconnected":
			return "neutral"
	}
}

export function connectionWord(status: ConnectionStatus): string {
	switch (status) {
		case "connected":
			return "connected"
		case "connecting":
			return "connecting"
		case "error":
			return "error"
		case "disconnected":
			return "disconnected"
	}
}

export function StatusChips(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const discordStatus = useStore(discordStatusStore)

	return (
		<>
			<StatusChip label="VLC" status={vlcStatus} onCheck={checkVlcConnection} />
			<StatusChip label="Discord" status={discordStatus} onCheck={checkDiscordStatus} />
		</>
	)
}

interface StatusChipProps {
	label: string
	status: ConnectionStatus
	onCheck: () => Promise<boolean>
}

function StatusChip({ label, status, onCheck }: StatusChipProps): JSX.Element {
	const word = connectionWord(status)
	const state = `${label}: ${word}`

	return (
		<button
			type="button"
			onClick={() => {
				void onCheck()
			}}
			aria-label={state}
			title={`${state}. Click to check again.`}
			className={cn(
				"no-drag focus-discord type-caption flex h-6 cursor-pointer items-center gap-1",
				"rounded-pill px-2 text-muted-foreground",
				"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				"hover:bg-float hover:text-body",
			)}
		>
			<StatusDot kind="decorative" tone={connectionTone(status)} />
			<span>{label}</span>
			<span className="sr-only">{word}</span>
		</button>
	)
}
