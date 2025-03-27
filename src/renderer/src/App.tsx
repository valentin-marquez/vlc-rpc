import { useStore } from "@nanostores/react"
import { GearIcon, HomeIcon } from "@radix-ui/react-icons"
import { Titlebar } from "@renderer/components/Titlebar"
import { UpdateNotification } from "@renderer/components/UpdateNotification"
import { cn, logger } from "@renderer/lib/utils"
import { FirstRun } from "@renderer/pages/FirstRun"
import { Settings } from "@renderer/pages/Settings"
import { Home } from "@renderer/pages/home"
import { initializeAppStatus } from "@renderer/stores/app-status"
import { discordStatusStore } from "@renderer/stores/app-status"
import { configStore, isFirstRun, loadConfig } from "@renderer/stores/config"
import { initializeDiscordStore } from "@renderer/stores/discord"
import { checkDiscordStatus, tryReconnect } from "@renderer/stores/discord"
import { initializeVlcStore } from "@renderer/stores/vlc"

import { useEffect, useState } from "react"
import { Link, Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

function App(): JSX.Element {
	const [loading, setLoading] = useState(true)
	const firstRun = useStore(isFirstRun)
	const config = useStore(configStore)
	const [location] = useHashLocation()
	const [, setInitialized] = useState(false)
	const discordStatus = useStore(discordStatusStore)

	useEffect(() => {
		async function init() {
			try {
				// Load app configuration first
				await loadConfig()

				// Initialize VLC store
				await initializeVlcStore()

				// Initialize Discord store
				await initializeDiscordStore()

				// Initialize general app status
				await initializeAppStatus()

				console.log("App initialized")
			} catch (error) {
				console.error("Failed to initialize app", error)
			} finally {
				setLoading(false)
			}
		}

		init()
	}, [])

	useEffect(() => {
		async function initApp(): Promise<void> {
			try {
				logger.info("App initializing")
				await initializeAppStatus()
				await initializeVlcStore()
				await initializeDiscordStore()
				setInitialized(true)
				logger.info("App initialized")
			} catch (error) {
				logger.error(`Initialization error: ${error}`)
			}
		}

		initApp()
	}, [])

	useEffect(() => {
		// Check every 2 minutes if Discord is disconnected
		const interval = setInterval(() => {
			if (discordStatus !== "connected") {
				checkDiscordStatus().then((isConnected) => {
					if (!isConnected) {
						logger.info("Periodic check found Discord disconnected")
						tryReconnect()
					}
				})
			}
		}, 120000) // 2 minutes

		// Check when the window regains visibility
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible" && discordStatus !== "connected") {
				logger.info("Document became visible, checking Discord connection")
				checkDiscordStatus().then((isConnected) => {
					if (!isConnected) {
						tryReconnect()
					}
				})
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			clearInterval(interval)
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
	}, [discordStatus])

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background text-foreground">
				<div className="animate-pulse flex items-center space-x-2">
					<div className="h-6 w-6 bg-primary rounded-full animate-bounce" />
					<p>Loading...</p>
				</div>
			</div>
		)
	}

	// Show first run wizard if this is the first run
	if (firstRun) {
		return <FirstRun />
	}

	return (
		<Router hook={useHashLocation}>
			<div className="min-h-screen flex flex-col bg-background text-foreground antialiased overflow-hidden">
				{/* Custom titlebar */}
				<Titlebar />

				{/* Navigation header */}
				<header className="flex-shrink-0 h-14 px-4 border-b border-border flex items-center justify-center bg-card/50 text-card-foreground z-10">
					<nav className="flex space-x-2">
						<NavLink to="/" active={location === "/"}>
							<HomeIcon className="mr-1.5" />
							Home
						</NavLink>
						<NavLink to="/settings" active={location === "/settings"}>
							<GearIcon className="mr-1.5" />
							Settings
						</NavLink>
					</nav>
				</header>

				<main className="flex-1 overflow-auto">
					<div className="p-4">
						<Switch>
							<Route path="/" component={Home} />
							<Route path="/settings" component={Settings} />
							<Route>
								<div className="max-w-2xl mx-auto p-6 text-center">
									<h2 className="text-xl font-bold">404 - Page Not Found</h2>
									<p className="mt-2 text-muted-foreground">
										The page you're looking for doesn't exist.
									</p>
								</div>
							</Route>
						</Switch>
					</div>
				</main>
				<footer className="flex-shrink-0 py-2 px-4 text-center text-xs text-muted-foreground border-t border-border">
					<p>VLC Discord RP v{config?.version || "3.0.0"}</p>
				</footer>
			</div>

			{/* Add the update notification component */}
			<UpdateNotification />
		</Router>
	)
}

interface NavLinkProps {
	to: string
	active: boolean
	children: React.ReactNode
}

function NavLink({ to, active, children }: NavLinkProps): JSX.Element {
	return (
		<Link
			href={to}
			className={cn(
				"flex items-center px-3 py-2 rounded-md text-sm font-medium",
				active ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-card-foreground",
			)}
		>
			{children}
		</Link>
	)
}

export default App
