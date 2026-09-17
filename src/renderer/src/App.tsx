import { useStore } from "@nanostores/react"
import logo from "@renderer/assets/logo.png"
import { useDiscordHealth } from "@renderer/features/discord/hooks/use-discord-health"
import { HomePage } from "@renderer/features/home"
import { LayoutPage } from "@renderer/features/layout"
import { FirstRunPage } from "@renderer/features/onboarding"
import { SettingsPage } from "@renderer/features/settings"
import { useAppInit } from "@renderer/hooks/use-app-init"
import { cn } from "@renderer/lib/utils"
import { Titlebar } from "@renderer/shell/titlebar"
import { isFirstRun } from "@renderer/stores/config.store"
import { useEffect, useState } from "react"
import { Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

/** Long enough that a fast start never flashes a loader nobody asked for. */
const LOADER_DELAY = 400

function App(): JSX.Element {
	const loading = useAppInit()
	const firstRun = useStore(isFirstRun)
	const [platform, setPlatform] = useState("win32")
	const [scrolled, setScrolled] = useState(false)
	const [loaderVisible, setLoaderVisible] = useState(false)

	useDiscordHealth()

	useEffect(() => {
		window.api.app
			.getPlatform()
			.then(setPlatform)
			.catch((error) => {
				console.error("Failed to read the platform", error)
			})
	}, [])

	// The spinner loops, and it should not run while nobody is looking.
	useEffect(() => {
		const root = document.documentElement

		const syncIdle = (): void => {
			const idle = !document.hasFocus() || document.visibilityState !== "visible"
			root.toggleAttribute("data-window-idle", idle)
		}

		syncIdle()
		window.addEventListener("focus", syncIdle)
		window.addEventListener("blur", syncIdle)
		document.addEventListener("visibilitychange", syncIdle)

		return () => {
			window.removeEventListener("focus", syncIdle)
			window.removeEventListener("blur", syncIdle)
			document.removeEventListener("visibilitychange", syncIdle)
			root.removeAttribute("data-window-idle")
		}
	}, [])

	useEffect(() => {
		if (!loading) {
			return
		}

		const timer = window.setTimeout(() => setLoaderVisible(true), LOADER_DELAY)
		return () => window.clearTimeout(timer)
	}, [loading])

	if (loading) {
		return (
			<div className="flex h-dvh items-center justify-center bg-chrome">
				<div
					className={cn(
						"flex flex-col items-center gap-4 transition-opacity ease-out-soft",
						"[transition-duration:var(--spring-enter-duration)]",
						loaderVisible ? "opacity-100" : "opacity-0",
					)}
				>
					<img src={logo} alt="" className="size-8" />
					<p className="type-caption text-muted-foreground">Starting</p>
				</div>
			</div>
		)
	}

	if (firstRun) {
		return <FirstRunPage />
	}

	const isMac = platform === "darwin"

	return (
		<Router hook={useHashLocation}>
			<div className="grid h-dvh grid-rows-[48px_1fr] bg-canvas text-body">
				<Titlebar isMac={isMac} scrolled={scrolled} />

				<main
					onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
					className="scroll-region min-h-0 px-6 pt-6 pb-8"
				>
					<div className="mx-auto w-full max-w-[880px]">
						<Switch>
							<Route path="/" component={HomePage} />
							<Route path="/layout" component={LayoutPage} />
							<Route path="/settings" component={SettingsPage} />
							<Route>
								<h2 className="type-hero text-strong">Not found</h2>
								<p className="type-body mt-2 text-muted-foreground">That page does not exist.</p>
							</Route>
						</Switch>
					</div>
				</main>
			</div>
		</Router>
	)
}

export default App
