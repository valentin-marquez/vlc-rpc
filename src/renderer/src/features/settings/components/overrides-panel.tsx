import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { logger } from "@renderer/lib/utils"
import type { OverrideListEntry, SavedOverride } from "@shared/ipc/channels"
import { useCallback, useEffect, useState } from "react"
import { Link } from "wouter"
import type { OverrideMatch } from "../overrides.key"
import { describeOverrideMatch, matchHeadline, readOverrideKey } from "../overrides.key"

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
					A correction is matched on what the app reads from the file name. Another release of the
					same title can read differently, and then it needs a correction of its own.
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
						{describeChanges(entry.override)} Applies when the app reads a file as{" "}
						{describeOverrideMatch(match)}.
					</span>
					<span className="block truncate" title={entry.override.sourceFilename}>
						Saved from {entry.override.sourceFilename}
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
	const title = entry.override.kind === "video" ? entry.override.title : undefined
	if (title !== undefined && title.length > 0) {
		return title
	}
	return matchHeadline(match)
}

function describeChanges(override: SavedOverride): string {
	if (override.kind === "audio") {
		return "Sets the cover art."
	}

	const fields: string[] = []
	if (override.title !== undefined && override.title.length > 0) {
		fields.push("the title")
	}
	if (override.cover !== undefined && override.cover.length > 0) {
		fields.push("the cover art")
	}

	const sentences: string[] = []
	if (fields.length > 0) {
		sentences.push(`Sets ${fields.join(" and ")}.`)
	}
	if (override.mediaKind === "movie") {
		sentences.push("Shows it as a movie.")
	}
	if (override.mediaKind === "tv") {
		sentences.push("Shows it as a series.")
	}

	return sentences.join(" ")
}
