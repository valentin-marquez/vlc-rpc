import {
	CheckCircledIcon,
	Cross1Icon,
	DownloadIcon,
	ExclamationTriangleIcon,
	ReloadIcon,
} from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"
import { cn } from "@renderer/lib/utils"
import { useEffect, useState } from "react"
import { useUpdateListener } from "../hooks/use-update-listener"

type Phase = "closed" | "opening" | "open" | "closing"

const EXIT_DURATION_MS = 140

// The exit is faster because the user has already decided and is only waiting on the system.
// Opacity rides --dur-tint rather than the spring so that reduced motion, which zeroes the spring
// duration, drops the travel and keeps the fade. A toast that pops in unannounced is what the
// setting is meant to prevent.
const ENTER_MOTION =
	"[transition:transform_var(--spring-enter-duration)_var(--spring-enter),opacity_var(--dur-tint)_var(--ease-out)]"
const EXIT_MOTION = "[transition:transform_140ms_var(--ease-out),opacity_140ms_var(--ease-out)]"

export function UpdateNotification(): JSX.Element | null {
	const {
		status,
		updateInfo,
		progressInfo,
		error,
		visible,
		checkForUpdates,
		downloadUpdate,
		closeNotification,
	} = useUpdateListener()

	const [phase, setPhase] = useState<Phase>("closed")

	useEffect(() => {
		if (visible) {
			setPhase("opening")
			return
		}
		setPhase((current) => (current === "closed" ? "closed" : "closing"))
	}, [visible])

	useEffect(() => {
		if (phase === "opening") {
			const raf = requestAnimationFrame(() => setPhase("open"))
			return () => cancelAnimationFrame(raf)
		}
		if (phase === "closing") {
			const timeout = setTimeout(() => setPhase("closed"), EXIT_DURATION_MS)
			return () => clearTimeout(timeout)
		}
		return undefined
	}, [phase])

	if (phase === "closed") return null

	const isError = status === "error"
	const open = phase === "open"

	return (
		<div
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
			aria-atomic="true"
			className={cn(
				"toast fixed bottom-4 right-4 z-50 w-[360px] overflow-hidden rounded-lg border border-divider bg-float shadow-[0_8px_24px_rgb(0_0_0/0.45)]",
				phase === "closing" ? EXIT_MOTION : ENTER_MOTION,
				open ? "opacity-100 [transform:translateY(0)]" : "opacity-0 [transform:translateY(12px)]",
			)}
		>
			<div className="flex items-center justify-between gap-2 border-b border-divider p-3">
				<div className="flex items-center gap-2">
					{isError && (
						<ExclamationTriangleIcon className="size-5 text-danger-text" aria-hidden="true" />
					)}
					{status === "update-available" && (
						<ReloadIcon className="size-5 text-brand-text" aria-hidden="true" />
					)}
					{status === "download-progress" && (
						<DownloadIcon className="size-5 text-brand-text" aria-hidden="true" />
					)}
					{status === "update-downloaded" && (
						<CheckCircledIcon className="size-5 text-ok-text" aria-hidden="true" />
					)}

					<h3 className="type-label text-strong">
						{isError && "Update error"}
						{status === "update-available" && "Update available"}
						{status === "download-progress" && "Downloading update"}
						{status === "update-downloaded" && "Update ready"}
					</h3>
				</div>

				<Button
					variant="ghost"
					size="icon"
					onClick={closeNotification}
					aria-label="Close notification"
				>
					<Cross1Icon aria-hidden="true" />
				</Button>
			</div>

			<div className="p-4">
				{isError && (
					<div>
						<p className="type-body mb-3 text-danger-text">{error}</p>
						<Button variant="primary" className="w-full" onClick={checkForUpdates}>
							Try again
						</Button>
					</div>
				)}

				{status === "update-available" && updateInfo && (
					<div>
						<p className="type-body mb-3 text-body">
							Version {updateInfo.version} is available to download.
						</p>
						{updateInfo.releaseDate && (
							<p className="type-caption mb-3 text-muted-foreground">
								Released: {formatDate(updateInfo.releaseDate)}
							</p>
						)}
						<Button variant="primary" className="w-full" onClick={downloadUpdate}>
							Download update
						</Button>
					</div>
				)}

				{status === "download-progress" && progressInfo && (
					<div>
						<div className="mb-2">
							<div className="type-caption mb-1 flex justify-between text-muted-foreground">
								<span className="tabular-nums">{Math.round(progressInfo.percent)}%</span>
								<span className="tabular-nums">
									{formatBytes(progressInfo.transferred)} / {formatBytes(progressInfo.total)}
								</span>
							</div>
							<div aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-inset">
								<div className="h-full bg-brand" style={{ width: `${progressInfo.percent}%` }} />
							</div>
						</div>
						<p className="type-caption tabular-nums text-muted-foreground">
							Speed: {formatBytes(progressInfo.bytesPerSecond)}/s
						</p>
					</div>
				)}

				{status === "update-downloaded" && updateInfo && (
					<div>
						<p className="type-body mb-3 text-body">
							Version {updateInfo.version} has been downloaded and is ready to install.
						</p>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={closeNotification}>
								Later
							</Button>
							<Button variant="primary" onClick={() => window.api.app.close()}>
								Install and restart
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B"
	const sizes = ["B", "KB", "MB", "GB"]
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
}

function formatDate(dateString: string): string {
	const date = new Date(dateString)
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}
