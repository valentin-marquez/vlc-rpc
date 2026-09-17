import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { logger } from "@renderer/lib/utils"
import type { OverrideListEntry, SavedOverride } from "@shared/ipc/channels"
import { useCallback, useEffect, useState } from "react"
import { Link } from "wouter"
import type { OverrideMatch } from "../overrides.key"
import { describeOverrideScope, matchHeadline, readOverrideKey } from "../overrides.key"

type ListState =
	| { kind: "loading" }
	| { kind: "ready"; entries: OverrideListEntry[] }
	| { kind: "failed" }

const REMOVE_BUTTON = "text-danger-text hover:bg-danger-wash hover:text-danger-text"

export function OverridesPanel(): JSX.Element {
	const [list, setList] = useState<ListState>({ kind: "loading" })
	const [pendingKey, setPendingKey] = useState<string | null>(null)
	const [removeFailed, setRemoveFailed] = useState(false)

	const load = useCallback(async (): Promise<void> => {
		try {
			const entries = await window.api.overrides.list()
			const newestFirst = [...entries].sort((a, b) => b.override.savedAt - a.override.savedAt)
			setList({ kind: "ready", entries: newestFirst })
		} catch (error) {
			logger.error(`Failed to read the saved corrections: ${error}`)
			setList({ kind: "failed" })
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	async function handleRemove(key: string): Promise<void> {
		setPendingKey(key)
		setRemoveFailed(false)

		try {
			const removed = await window.api.overrides.remove(key)

			if (!removed) {
				// The store no longer holds what the screen is showing, so take the store's word for it.
				await load()
				return
			}

			setList((current) =>
				current.kind === "ready"
					? { kind: "ready", entries: current.entries.filter((entry) => entry.key !== key) }
					: current,
			)
		} catch (error) {
			logger.error(`Failed to remove a correction: ${error}`)
			setRemoveFailed(true)
		} finally {
			setPendingKey(null)
		}
	}

	return (
		<Panel label="Corrections">
			{list.kind === "loading" && (
				<p className="type-caption px-4 py-3 text-muted-foreground">Loading your corrections</p>
			)}

			{list.kind === "failed" && (
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<p className="type-caption text-pretty text-muted-foreground">
						Could not read your corrections.
					</p>
					<Button variant="secondary" size="sm" onClick={load}>
						Try again
					</Button>
				</div>
			)}

			{list.kind === "ready" && list.entries.length === 0 && <EmptyCorrections />}

			{list.kind === "ready" &&
				list.entries.map((entry) => (
					<OverrideRow
						key={entry.key}
						entry={entry}
						isRemoving={pendingKey === entry.key}
						onRemove={handleRemove}
					/>
				))}

			{removeFailed && (
				<p className="type-caption px-4 py-3 text-danger-text">
					Could not remove that correction. Try again.
				</p>
			)}

			{list.kind === "ready" && list.entries.length > 0 && (
				<p className="type-caption text-pretty px-4 py-3 text-muted-foreground">
					Most corrections are matched on what the app reads from the file, so another release of
					the same title reads differently and needs one of its own. Music that carries no tags is
					held against the file itself, and ends if that file moves.
				</p>
			)}
		</Panel>
	)
}

interface OverrideRowProps {
	entry: OverrideListEntry
	isRemoving: boolean
	onRemove: (key: string) => void
}

function OverrideRow({ entry, isRemoving, onRemove }: OverrideRowProps): JSX.Element {
	const match = readOverrideKey(entry.key)
	const headline = headlineFor(entry, match)

	return (
		<Row
			label={
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate">{headline}</span>
					<Badge>{entry.override.kind === "video" ? "Video" : "Music"}</Badge>
				</span>
			}
			description={
				<>
					<span className="block" title={entry.key}>
						{describeChanges(entry.override)} {describeOverrideScope(match)}
					</span>
					<span className="block truncate" title={entry.override.sourceFilename}>
						Saved from <span className="select-text">{entry.override.sourceFilename}</span>
					</span>
				</>
			}
			control={
				<Button
					variant="ghost"
					size="sm"
					className={REMOVE_BUTTON}
					isLoading={isRemoving}
					onClick={() => onRemove(entry.key)}
					aria-label={`Remove the correction for ${headline}`}
				>
					Remove
				</Button>
			}
		/>
	)
}

function EmptyCorrections(): JSX.Element {
	return (
		<div className="flex flex-col gap-2 px-4 py-6">
			<p className="type-label text-body">You have not corrected anything yet.</p>
			<p className="type-caption text-pretty text-muted-foreground">
				When the app reads the wrong title or shows the wrong cover art, correct it on Home while
				the file is playing. What you correct is listed here, so you can see it and take it back.
			</p>
			<Link
				href="/"
				className="focus-discord type-label w-fit rounded-xs text-brand-text underline-offset-4 hover:underline"
			>
				Open Home
			</Link>
		</div>
	)
}

/** What the row leads with: what the user typed, or failing that the key's own name for the thing. */
function headlineFor(entry: OverrideListEntry, match: OverrideMatch): string {
	const title = entry.override.kind === "audio" ? undefined : entry.override.title
	if (title !== undefined && title.length > 0) {
		return title
	}
	return matchHeadline(match)
}

function describeChanges(override: SavedOverride): string {
	if (override.kind === "audio") {
		return "Sets the cover art."
	}

	if (override.kind === "untagged-audio") {
		const named = listFields([
			[override.title, "the song title"],
			[override.artist, "the artist"],
			[override.cover, "the cover art"],
		])
		// The search reaching the artwork is the reason for typing two words
		// rather than going to find an image, so the row says when it did.
		const rest =
			override.cover === undefined || override.cover.length === 0
				? " The cover comes from searching those."
				: ""
		return named === "" ? "" : `Sets ${named}.${rest}`
	}

	const named = listFields([
		[override.title, "the title"],
		[override.cover, "the cover art"],
	])

	const sentences: string[] = []
	if (named !== "") {
		sentences.push(`Sets ${named}.`)
	}
	if (override.mediaKind === "movie") {
		sentences.push("Shows it as a movie.")
	}
	if (override.mediaKind === "tv") {
		sentences.push("Shows it as a series.")
	}

	return sentences.join(" ")
}

function listFields(fields: [string | undefined, string][]): string {
	const named = fields
		.filter(([value]) => value !== undefined && value.length > 0)
		.map(([, label]) => label)
	if (named.length === 0) return ""
	if (named.length === 1) return named[0] ?? ""
	return `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
}
