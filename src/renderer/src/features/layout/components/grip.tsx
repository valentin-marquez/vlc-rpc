/** Six dots, the mark that says a thing is picked up rather than pressed. */
export function Grip(): JSX.Element {
	return (
		<span aria-hidden="true" className="grid shrink-0 grid-cols-2 gap-[2px] text-muted-foreground">
			{[0, 1, 2, 3, 4, 5].map((dot) => (
				<span key={dot} className="size-[2px] rounded-pill bg-current" />
			))}
		</span>
	)
}
