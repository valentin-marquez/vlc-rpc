import { useStore } from "@nanostores/react"
import { Titlebar } from "@renderer/components/Titlebar"
import { UpdateNotification } from "@renderer/components/UpdateNotification"
import { cn, logger } from "@renderer/lib/utils"
import { FirstRun } from "@renderer/pages/FirstRun"
import { Layout } from "@renderer/pages/Layout"
import { Settings } from "@renderer/pages/Settings"
import { Home } from "@renderer/pages/home"
import { initializeAppStatus } from "@renderer/stores/app-status"
import { discordStatusStore } from "@renderer/stores/app-status"
import { configStore, isFirstRun, loadConfig } from "@renderer/stores/config"
import { initializeDiscordStore } from "@renderer/stores/discord"
import { checkDiscordStatus, tryReconnect } from "@renderer/stores/discord"
import { initializeVlcStore } from "@renderer/stores/vlc"
import { Gear, House, Layout as LayoutPhosphor } from "phosphor-react"

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
				await loadConfig()
				await initializeVlcStore()
				await initializeDiscordStore()
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

	if (firstRun) {
		return <FirstRun />
	}

	return (
		<Router hook={useHashLocation}>
			<div className="h-screen flex flex-col bg-background text-foreground antialiased no-scrollbar overscroll-none">
				<Titlebar />

				<div className="flex-1 flex flex-col min-h-0">
					<header className="sticky top-10 z-[9998] flex-shrink-0 h-14 px-4 border-b border-border flex items-center justify-center bg-card/50 text-card-foreground backdrop-blur-sm">
						<nav className="flex space-x-2">
							<NavLink to="/" active={location === "/"}>
								<House size={18} weight="fill" className="mr-1.5" />
								Home
							</NavLink>
							<NavLink to="/layout" active={location === "/layout"}>
								<LayoutPhosphor size={18} weight="fill" className="mr-1.5" />
								Layout
							</NavLink>
							<NavLink to="/settings" active={location === "/settings"}>
								<Gear size={18} weight="fill" className="mr-1.5" />
								Settings
							</NavLink>
						</nav>
					</header>

					<main className="flex-1 min-h-0 overflow-hidden">
						<div className="h-full overflow-y-auto no-scrollbar overscroll-y-contain p-4">
							<Switch>
								<Route path="/" component={Home} />
								<Route path="/layout" component={Layout} />
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

					<footer className="flex-shrink-0 py-2 px-4 text-center text-xs text-muted-foreground border-t border-border bg-card/30 backdrop-blur-sm">
						<p>VLC Discord RP v{config?.version || "4.0.1"}</p>
					</footer>
				</div>
			</div>

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
