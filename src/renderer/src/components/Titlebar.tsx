import { Cross1Icon, MinusIcon, SizeIcon } from "@radix-ui/react-icons"
import logo from "@renderer/assets/logo.png"
import { cn } from "@renderer/lib/utils"
import { useEffect, useState } from "react"

export function Titlebar(): JSX.Element {
	const [isMaximized, setIsMaximized] = useState(false)
	const [platform, setPlatform] = useState<string>("win32")

	useEffect(() => {
		async function initWindowState() {
			try {
				const maximized = await window.api.app.isMaximized()
				setIsMaximized(maximized)

				const plat = await window.api.app.getPlatform()
				setPlatform(plat)

				const removeListener = window.api.app.onMaximizedChange(setIsMaximized)

				return removeListener
			} catch (error) {
				console.error("Failed to initialize window state", error)
				return () => {}
			}
		}

		const cleanup = initWindowState()

		return () => {
			cleanup.then((fn) => fn?.())
		}
	}, [])

	async function handleMinimize(): Promise<void> {
		await window.api.app.minimize()
	}

	async function handleMaximize(): Promise<void> {
		await window.api.app.maximize()
	}

	async function handleClose(): Promise<void> {
		await window.api.app.close()
	}

	const isMac = platform === "darwin"

	return (
		<div
			className={cn(
				"app-titlebar h-10 flex items-center justify-between",
				"border-b border-border bg-card text-card-foreground select-none",
				isMac ? "pl-20" : "pl-4", // Add space for traffic lights on macOS
			)}
		>
			<div className="flex items-center gap-2 drag">
				<img src={logo} alt="VLC Discord RP" className="h-5 w-5" />
				<span className="text-sm font-medium">VLC Discord RP</span>
			</div>

			{!isMac && (
				<div className="flex no-drag">
					<button
						type="button"
						onClick={handleMinimize}
						className="inline-flex cursor-pointer items-center justify-center h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
						aria-label="Minimize"
					>
						<MinusIcon className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={handleMaximize}
						className="inline-flex cursor-pointer items-center justify-center h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
						aria-label={isMaximized ? "Restore" : "Maximize"}
					>
						{isMaximized ? (
							<div className="h-3.5 w-3.5 border border-current" />
						) : (
							<SizeIcon className="h-4 w-4" />
						)}
					</button>
					<button
						type="button"
						onClick={handleClose}
						className="inline-flex cursor-pointer items-center justify-center h-10 w-10 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
						aria-label="Close"
					>
						<Cross1Icon className="h-4 w-4" />
					</button>
				</div>
			)}
		</div>
	)
}
