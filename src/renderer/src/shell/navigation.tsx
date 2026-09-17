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

const NAV_ITEMS: readonly NavItem[] = [
	{ path: "/", label: "Home", icon: House },
	{ path: "/layout", label: "Layout", icon: LayoutIcon },
	{ path: "/settings", label: "Settings", icon: Gear },
]

export function Navigation(): JSX.Element {
	const [location] = useHashLocation()

	return (
		<div className="flex items-center gap-3">
			<img src={logo} alt="" className="size-6 shrink-0" />

			<nav aria-label="Main" className="no-drag flex items-center gap-1 rounded-md bg-inset p-1">
				{NAV_ITEMS.map((item) => (
					<NavTab key={item.path} item={item} active={location === item.path} />
				))}
			</nav>
		</div>
	)
}

function NavTab({ item, active }: { item: NavItem; active: boolean }): JSX.Element {
	const Glyph = item.icon

	return (
		<Link
			to={item.path}
			aria-current={active ? "page" : undefined}
			className={cn(
				"focus-discord flex h-8 items-center gap-2 rounded-sm px-3",
				"type-caption font-medium",
				"transition-colors ease-out-soft [transition-duration:var(--dur-tint)]",
				active
					? "bg-float text-strong shadow-[0_1px_2px_rgb(0_0_0/0.35)]"
					: "text-muted-foreground hover:text-body",
			)}
		>
			<Glyph size={16} weight={active ? "fill" : "regular"} />
			{item.label}
		</Link>
	)
}
