import { Cross1Icon, MinusIcon, SizeIcon } from "@radix-ui/react-icons"
import { cn } from "@renderer/lib/utils"
import { NAV_ITEMS } from "@renderer/shell/navigation"
import { StatusChips } from "@renderer/shell/status-chip"
import { useEffect, useState } from "react"
import { useHashLocation } from "wouter/use-hash-location"

const windowControl = cn(
	"focus-discord inline-flex h-8 w-[46px] cursor-pointer items-center justify-center",
	"rounded-sm text-muted-foreground",
	"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
)

interface TitlebarProps {
	isMac: boolean
	scrolled: boolean
}

export function Titlebar({ isMac, scrolled }: TitlebarProps): JSX.Element {
	const [isMaximized, setIsMaximized] = useState(false)
	const [location] = useHashLocation()

	useEffect(() => {
		async function initWindowState() {
			try {
				const maximized = await window.api.app.isMaximized()
				setIsMaximized(maximized)

				return window.api.app.onMaximizedChange(setIsMaximized)
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

	const title = NAV_ITEMS.find((item) => item.path === location)?.label ?? "Not found"

	return (
		<header
			className={cn(
				"app-titlebar relative col-start-2 row-start-1 flex h-12 select-none items-center",
				"justify-between bg-canvas ps-6 shadow-[inset_0_-1px_0_hsl(var(--divider))]",
				isMac && "pe-6",
			)}
		>
			<h1 className="type-title text-strong">{title}</h1>

			<div className="flex items-center gap-1">
				<StatusChips />

				{!isMac && (
					<div className="no-drag ms-2 flex">
						<button
							type="button"
							onClick={handleMinimize}
							className={cn(windowControl, "hover:bg-float hover:text-strong")}
							aria-label="Minimize"
						>
							<MinusIcon className="size-4" />
						</button>
						<button
							type="button"
							onClick={handleMaximize}
							className={cn(windowControl, "hover:bg-float hover:text-strong")}
							aria-label={isMaximized ? "Restore" : "Maximize"}
						>
							{isMaximized ? (
								<span className="size-3 border border-current" />
							) : (
								<SizeIcon className="size-4" />
							)}
						</button>
						<button
							type="button"
							onClick={handleClose}
							className={cn(windowControl, "hover:bg-danger hover:text-white")}
							aria-label="Close"
						>
							<Cross1Icon className="size-4" />
						</button>
					</div>
				)}
			</div>

			{/* The pane owns the scroll, so the lift under the header is driven by its scrollTop. */}
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-0 h-px",
					"shadow-[0_4px_12px_rgb(0_0_0/0.35)] transition-opacity duration-150 ease-out-soft",
					scrolled ? "opacity-100" : "opacity-0",
				)}
			/>
		</header>
	)
}
