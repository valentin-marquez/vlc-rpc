import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { StatusDot, type StatusTone } from "@renderer/components/ui/status-dot"
import { checkDiscordStatus, discordStatusStore } from "@renderer/features/discord"
import {
	checkVlcConnection,
	repairVlcConfig,
	vlcConnectionReasonStore,
	vlcStatusStore,
} from "@renderer/features/vlc"
import { cn } from "@renderer/lib/utils"
import type { ConnectionStatus } from "@shared/app/app.types"
import {
	type VlcConnectionRemedy,
	type VlcConnectionSeverity,
	describeVlcConnection,
} from "@shared/vlc/vlc-connection.mapper"
import type { VlcConnectionReason } from "@shared/vlc/vlc.types"
import { useEffect, useId, useRef, useState } from "react"
import { useLocation } from "wouter"

/**
 * Pending is not a severity the mapper can return: nothing has gone right or
 * wrong yet, which is a different thing from nothing being wrong.
 */
type ChipSeverity = VlcConnectionSeverity | "pending"

interface ChipDescription {
	severity: ChipSeverity
	state: string
	headline: string
	detail: string
	remedy: VlcConnectionRemedy
}

const TONE: Record<ChipSeverity, StatusTone> = {
	ok: "ok",
	warning: "warn",
	error: "danger",
	pending: "neutral",
}

const STATE_COLOUR: Record<ChipSeverity, string> = {
	ok: "text-muted-foreground",
	warning: "text-warn-text",
	error: "text-danger-text",
	pending: "text-muted-foreground",
}

const NO_REMEDY: VlcConnectionRemedy = { kind: "none" }

export function StatusChips(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const vlcReason = useStore(vlcConnectionReasonStore)
	const discordStatus = useStore(discordStatusStore)

	return (
		<>
			<StatusChip
				label="VLC"
				description={describeVlc(vlcStatus, vlcReason)}
				onCheck={checkVlcConnection}
			/>
			<StatusChip
				label="Discord"
				description={describeDiscord(discordStatus)}
				onCheck={checkDiscordStatus}
			/>
		</>
	)
}

function describeVlc(
	status: ConnectionStatus,
	reason: VlcConnectionReason | null,
): ChipDescription {
	if (status === "connecting") {
		return {
			severity: "pending",
			state: "connecting",
			headline: "Connecting to VLC",
			detail: "This takes a moment.",
			remedy: NO_REMEDY,
		}
	}

	// No reason at all means either the first check has not come back yet or the
	// check itself broke, and only the second of those is worth a red dot.
	if (reason === null) {
		if (status !== "error") {
			return {
				severity: "pending",
				state: "checking",
				headline: "Looking for VLC",
				detail: "This takes a moment.",
				remedy: NO_REMEDY,
			}
		}
		return describeVlcConnection("unknown-error")
	}

	return describeVlcConnection(reason)
}

function describeDiscord(status: ConnectionStatus): ChipDescription {
	switch (status) {
		case "connected":
			return {
				severity: "ok",
				state: "connected",
				headline: "Discord is connected",
				detail: "Your status updates while VLC plays.",
				remedy: NO_REMEDY,
			}
		case "connecting":
			return {
				severity: "pending",
				state: "connecting",
				headline: "Connecting to Discord",
				detail: "This takes a moment.",
				remedy: NO_REMEDY,
			}
		case "disconnected":
			return {
				severity: "warning",
				state: "not connected",
				headline: "Discord is not connected",
				detail: "Open Discord on this computer. The app reconnects on its own.",
				remedy: NO_REMEDY,
			}
		case "error":
			return {
				severity: "error",
				state: "cannot connect",
				headline: "The app cannot reach Discord",
				detail: "Close Discord, open it again, then check again.",
				remedy: NO_REMEDY,
			}
	}
}

interface StatusChipProps {
	label: string
	description: ChipDescription
	onCheck: () => Promise<boolean>
}

type RepairState = { kind: "idle" } | { kind: "working" } | { kind: "done" } | { kind: "failed" }

/**
 * A repair rewrites vlcrc, which VLC only reads at startup, so the check that
 * follows honestly reports no VLC on the port. Saying so beats letting the
 * panel answer a question the user did not ask.
 */
function panelText(description: ChipDescription, repair: RepairState): [string, string] {
	if (repair.kind === "done") {
		return ["Turned on VLC's web interface", "Restart VLC for the change to take effect."]
	}
	if (repair.kind === "failed") {
		return ["Could not turn it on", "Turn the web interface on in VLC, then restart it."]
	}
	return [description.headline, description.detail]
}

// Long enough that crossing the chips on the way to the window controls does
// not pop a panel open behind the pointer.
const HOVER_DELAY_MS = 140
// Long enough to survive a pointer that clips a corner on its way to the button.
const LEAVE_DELAY_MS = 220

/** Positioned shell whose padding is the visual offset, so its hit area reaches
 * the chip. With the gap as a margin the pointer left the wrapper on its way
 * down and the panel closed before it arrived at the button inside. */
const PANEL_ANCHOR = "absolute end-0 top-full z-50 pt-1"

const PANEL = cn(
	"flex w-[288px] flex-col gap-2",
	"rounded-lg border border-divider bg-float p-3 text-start",
	"shadow-[0_8px_24px_rgb(0_0_0/0.45)]",
	"opacity-100 transition-opacity ease-out-soft [transition-duration:var(--dur-tint)]",
	"starting:opacity-0",
)

/**
 * A disclosure rather than a title tooltip: a native one is slow, unstyled and
 * cannot hold the button that fixes the problem. Hover and focus both open it,
 * nothing moves focus into it, and the panel sits next in the tab order, so a
 * keyboard reaches the actions without ever being trapped.
 */
function StatusChip({ label, description, onCheck }: StatusChipProps): JSX.Element {
	const { severity, state, remedy } = description
	const panelId = useId()
	const wrapper = useRef<HTMLDivElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	const hoverTimer = useRef<number | null>(null)
	const leaveTimer = useRef<number | null>(null)
	// Sending focus back to the chip after a close would otherwise reopen the
	// panel through the same handler that opens it for a keyboard.
	const ignoreFocus = useRef(false)
	const [isOpen, setOpen] = useState(false)
	const [isChecking, setChecking] = useState(false)
	const [repair, setRepair] = useState<RepairState>({ kind: "idle" })
	const [, navigate] = useLocation()
	const [headline, detail] = panelText(description, repair)

	useEffect(() => {
		if (!isOpen) {
			return
		}

		function handlePointerDown(event: PointerEvent): void {
			if (!wrapper.current?.contains(event.target as Node)) {
				setOpen(false)
			}
		}

		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [isOpen])

	useEffect(() => cancelHover, [])

	function cancelHover(): void {
		if (hoverTimer.current !== null) {
			window.clearTimeout(hoverTimer.current)
			hoverTimer.current = null
		}
		if (leaveTimer.current !== null) {
			window.clearTimeout(leaveTimer.current)
			leaveTimer.current = null
		}
	}

	function close(): void {
		cancelHover()
		setOpen(false)
		setRepair({ kind: "idle" })
	}

	function closeAndKeepFocus(): void {
		close()

		if (document.activeElement !== trigger.current) {
			ignoreFocus.current = true
			trigger.current?.focus()
		}
	}

	async function handleCheck(): Promise<void> {
		setChecking(true)
		try {
			await onCheck()
		} finally {
			setChecking(false)
		}
	}

	async function handleRepair(): Promise<void> {
		setRepair({ kind: "working" })
		const repaired = await repairVlcConfig()
		setRepair(repaired ? { kind: "done" } : { kind: "failed" })
		await checkVlcConnection()
	}

	function handleSettings(): void {
		closeAndKeepFocus()
		navigate("/settings")
	}

	// A dot plus a word, because the amber one and the red one differ in colour
	// alone until something spells out which is which.
	const showState = severity === "warning" || severity === "error"

	return (
		<div
			ref={wrapper}
			className="no-drag relative"
			onPointerEnter={() => {
				cancelHover()
				hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
			}}
			onPointerLeave={() => {
				cancelHover()
				leaveTimer.current = window.setTimeout(close, LEAVE_DELAY_MS)
			}}
			onFocus={() => {
				if (ignoreFocus.current) {
					ignoreFocus.current = false
					return
				}
				setOpen(true)
			}}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					close()
				}
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape" && isOpen) {
					event.stopPropagation()
					closeAndKeepFocus()
				}
			}}
		>
			<button
				ref={trigger}
				type="button"
				aria-expanded={isOpen}
				aria-controls={isOpen ? panelId : undefined}
				onClick={() => {
					cancelHover()
					if (isOpen) {
						close()
						return
					}
					setOpen(true)
				}}
				className={cn(
					"focus-discord type-caption flex h-6 cursor-pointer items-center gap-2",
					"rounded-pill px-2 text-muted-foreground",
					"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
					"hover:bg-float hover:text-body",
				)}
			>
				<StatusDot kind="decorative" tone={TONE[severity]} />
				<span>{label}</span>
				<span className={cn(showState ? STATE_COLOUR[severity] : "sr-only")}>{state}</span>
			</button>

			{isOpen && (
				<div className={PANEL_ANCHOR}>
					<div id={panelId} className={PANEL}>
						<p className="type-label text-strong">{headline}</p>
						<p className="type-caption text-pretty text-muted-foreground">{detail}</p>

						<div className="mt-1 flex items-stretch gap-2">
							{remedy.kind === "enable-http" && repair.kind !== "done" && (
								<Button
									size="sm"
									variant="secondary"
									className="flex-1"
									isLoading={repair.kind === "working"}
									onClick={() => {
										void handleRepair()
									}}
								>
									{remedy.label}
								</Button>
							)}
							{remedy.kind === "open-settings" && (
								<Button size="sm" variant="secondary" className="flex-1" onClick={handleSettings}>
									{remedy.label}
								</Button>
							)}
							<Button
								size="sm"
								variant="secondary"
								className="flex-1"
								isLoading={isChecking}
								onClick={() => {
									void handleCheck()
								}}
							>
								Check again
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
