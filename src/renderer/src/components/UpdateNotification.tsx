import {
	CheckCircledIcon,
	Cross1Icon,
	DownloadIcon,
	ExclamationTriangleIcon,
	ReloadIcon,
} from "@radix-ui/react-icons"
import { logger } from "@renderer/lib/utils"
import { useEffect, useState } from "react"

interface UpdateInfo {
	version: string
	files: Array<{ url: string; size: number }>
	releaseDate: string
	releaseName?: string
}

interface ProgressInfo {
	percent: number
	bytesPerSecond: number
	total: number
	transferred: number
}

interface UpdateStatus {
	isPortable: boolean
	updateCheckInProgress: boolean
	retryCount: number
	currentVersion: string
}

interface UpdateStatus {
	isPortable: boolean
	updateCheckInProgress: boolean
	retryCount: number
	currentVersion: string
}

export function UpdateNotification(): JSX.Element | null {
	const [status, setStatus] = useState<string | null>(null)
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [visible, setVisible] = useState(false)
	const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
	const [installationType, setInstallationType] = useState<"portable" | "setup" | null>(null)

	useEffect(() => {
		// Get initial installation type and status
		Promise.all([window.api.update.getInstallationType(), window.api.update.getStatus()])
			.then(([type, status]) => {
				setInstallationType(type)
				setUpdateStatus(status)
			})
			.catch((err) => {
				logger.error(`Error getting update info: ${err}`)
			})

		const cleanup = window.api.update.onUpdateStatus((event, data) => {
			logger.info(`Update event: ${event} - ${JSON.stringify(data)}`)

			setStatus(event)

			if (event === "update-available") {
				setUpdateInfo(data)
				setVisible(true)
			} else if (event === "download-progress") {
				setProgressInfo(data)
				setVisible(true)
			} else if (event === "update-downloaded") {
				setUpdateInfo(data)
				setProgressInfo(null)
				setVisible(true)
			} else if (event === "error") {
				setError(data?.message || "Unknown error")
				setVisible(true)
			} else if (event === "checking-for-update") {
				// Just update status, don't show notification
				// Refresh status info
				window.api.update
					.getStatus()
					.then(setUpdateStatus)
					.catch((err) => {
						logger.error(`Error getting status: ${err}`)
					})
			} else if (event === "update-not-available") {
				// Just update status, don't show notification by default
				setVisible(false)
			}
		})

		return cleanup
	}, [])

	const checkForUpdates = () => {
		window.api.update.check(false).catch((err) => {
			logger.error(`Error checking for updates:${err}`)
		})
	}

	const downloadUpdate = () => {
		window.api.update.download().catch((err) => {
			logger.error(`Error downloading update: ${err}`)
		})
	}

	const closeNotification = () => {
		setVisible(false)
	}

	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return "0 B"

		const sizes = ["B", "KB", "MB", "GB"]
		const i = Math.floor(Math.log(bytes) / Math.log(1024))

		return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
	}

	const formatDate = (dateString: string): string => {
		const date = new Date(dateString)
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		})
	}

	if (!visible) {
		return null
	}

	// Debug info for development (uses variables to avoid lint errors)
	if (process.env.NODE_ENV === "development") {
		console.debug("Update status:", updateStatus, "Installation type:", installationType)
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 w-96 bg-card rounded-lg border border-border shadow-lg overflow-hidden">
			<div className="flex items-center justify-between bg-card p-3 border-b border-border">
				<div className="flex items-center space-x-2">
					{status === "error" && <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />}
					{status === "update-available" && <ReloadIcon className="h-5 w-5 text-primary" />}
					{status === "download-progress" && <DownloadIcon className="h-5 w-5 text-primary" />}
					{status === "update-downloaded" && (
						<CheckCircledIcon className="h-5 w-5 text-green-500" />
					)}

					<h3 className="font-medium text-card-foreground">
						{status === "error" && "Update Error"}
						{status === "update-available" && "Update Available"}
						{status === "download-progress" && "Downloading Update"}
						{status === "update-downloaded" && "Update Ready"}
					</h3>
				</div>

				<button
					type="button"
					onClick={closeNotification}
					className="text-muted-foreground hover:text-foreground"
					aria-label="Close"
				>
					<Cross1Icon className="h-4 w-4" />
				</button>
			</div>

			<div className="p-4">
				{status === "error" && (
					<div>
						<p className="text-destructive mb-3">{error}</p>
						<button
							type="button"
							onClick={checkForUpdates}
							className="w-full bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
						>
							Try Again
						</button>
					</div>
				)}

				{status === "update-available" && updateInfo && (
					<div>
						<p className="mb-3 text-card-foreground">
							Version {updateInfo.version} is available to download.
						</p>
						{updateInfo.releaseDate && (
							<p className="text-xs text-muted-foreground mb-3">
								Released: {formatDate(updateInfo.releaseDate)}
							</p>
						)}
						<button
							type="button"
							onClick={downloadUpdate}
							className="w-full bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
						>
							Download Update
						</button>
					</div>
				)}

				{status === "download-progress" && progressInfo && (
					<div>
						<div className="mb-2">
							<div className="flex justify-between text-xs mb-1">
								<span>{Math.round(progressInfo.percent)}%</span>
								<span>
									{formatBytes(progressInfo.transferred)} / {formatBytes(progressInfo.total)}
								</span>
							</div>
							<div className="h-2 bg-muted rounded-full overflow-hidden">
								<div className="h-full bg-primary" style={{ width: `${progressInfo.percent}%` }} />
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Speed: {formatBytes(progressInfo.bytesPerSecond)}/s
						</p>
					</div>
				)}

				{status === "update-downloaded" && updateInfo && (
					<div>
						<p className="mb-3 text-card-foreground">
							Version {updateInfo.version} has been downloaded and is ready to install.
						</p>
						<div className="flex justify-end space-x-2">
							<button
								type="button"
								onClick={closeNotification}
								className="bg-muted text-muted-foreground py-1 px-3 rounded-md text-sm hover:bg-muted/90"
							>
								Later
							</button>
							<button
								type="button"
								onClick={() => window.api.app.close()}
								className="bg-primary text-primary-foreground py-1 px-3 rounded-md text-sm hover:bg-primary/90"
							>
								Install & Restart
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
