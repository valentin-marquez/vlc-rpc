import logo from "@renderer/assets/logo.png"
import { cn } from "@renderer/lib/utils"
import { Gear, House, type Icon, Layout as LayoutIcon } from "phosphor-react"
import { Link } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

interface NavItem {
	path: string
	label: string
	icon: Icon
}

export const NAV_ITEMS: readonly NavItem[] = [
	{ path: "/", label: "Home", icon: House },
	{ path: "/layout", label: "Layout", icon: LayoutIcon },
	{ path: "/settings", label: "Settings", icon: Gear },
]

export function Navigation({ isMac }: { isMac: boolean }): JSX.Element {
	const [location] = useHashLocation()

	return (
		<div className="col-start-1 row-start-1 row-end-3 flex w-[72px] flex-col items-center bg-chrome">
			{/* The traffic lights sit over the top of the rail, so the mark moves below them. */}
			<div
				className={cn("app-titlebar flex w-full shrink-0 justify-center", isMac ? "pt-10" : "pt-3")}
			>
				<img src={logo} alt="" className="size-8" />
			</div>

			<div className="mt-2 mb-3 h-px w-8 bg-divider opacity-40" />

			<nav aria-label="Main" className="flex w-full flex-col items-center gap-4">
				{NAV_ITEMS.map((item) => (
					<RailTile key={item.path} item={item} active={location === item.path} />
				))}
			</nav>
		</div>
	)
}

function RailTile({ item, active }: { item: NavItem; active: boolean }): JSX.Element {
	const Glyph = item.icon

	return (
		<Link
			to={item.path}
			aria-current={active ? "page" : undefined}
			className="no-drag group relative flex w-full flex-col items-center outline-none"
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-0 start-0 flex h-12 items-center"
			>
				<span
					className={cn(
						"w-1 rounded-e-[2px] bg-strong",
						"[transition-property:height] [transition-duration:var(--spring-snap-duration)] [transition-timing-function:var(--spring-snap)]",
						active ? "h-6" : "h-0 group-hover:h-3",
					)}
				/>
			</span>

			<span
				className={cn(
					"rail-tile flex size-12 items-center justify-center",
					"[transition-property:border-radius,background-color,color]",
					"[transition-duration:var(--spring-snap-duration),var(--dur-tint),var(--dur-tint)]",
					"[transition-timing-function:var(--spring-snap),var(--ease-out),var(--ease-out)]",
					"group-focus-visible:ring-2 group-focus-visible:ring-brand-text group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-chrome",
					active
						? "rounded-[14px] bg-brand text-white"
						: "rounded-[24px] text-muted-foreground group-hover:rounded-[16px] group-hover:bg-float group-hover:text-body",
				)}
			>
				<Glyph size={22} weight={active ? "fill" : "regular"} />
			</span>

			<span
				className={cn(
					"type-eyebrow mt-1 transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
					active ? "text-strong" : "text-faint group-hover:text-muted-foreground",
				)}
			>
				{item.label}
			</span>
		</Link>
	)
}
