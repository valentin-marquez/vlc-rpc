import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { vlcStatusStore } from "@renderer/features/vlc"
import React from "react"

import { useProxiedArtwork } from "../hooks/use-proxied-artwork"
import { refreshMediaInfo } from "../media.actions"
import { contentTypeLabel, formatDuration, formatEpisode } from "../media.format"
import type { MediaState } from "../media.store"
import { mediaStore } from "../media.store"
import { OverrideForm } from "./override-form"

interface SourceRow {
	label: string
	value: string
	tabular?: boolean
}

/**
 * What VLC reports, beside what Discord shows. This app's whole job is the
 * mapping between the two, so the source sits next to the result and a wrong
 * title or a wrong cover is one glance away.
 */
export function SourcePanel(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const media = useStore(mediaStore)
	const artworkUrl = useProxiedArtwork()
	// Held as the key rather than a flag, so a file change closes the form on its own.
	const [editingKey, setEditingKey] = React.useState<string | null>(null)
	const formId = React.useId()
	const editing = editingKey !== null && editingKey === media.overrideKey

	if (vlcStatus !== "connected" || !media.title) {
		return (
			<Panel label="What VLC reports">
				<p className="type-body px-4 py-3 text-muted-foreground">
					{vlcStatus === "connected" ? "Nothing is playing" : "VLC is not connected"}
				</p>
			</Panel>
		)
	}

	const isAudio = media.contentType === "audio"
	const rows = sourceRows(media)

	return (
		<div className="flex flex-col gap-3">
			<Panel label="What VLC reports">
				{rows.map((row) => (
					<Row
						key={row.label}
						kind="value"
						label={row.label}
						value={row.tabular ? <span className="tabular-nums">{row.value}</span> : row.value}
					/>
				))}

				{media.overrideKey && (
					<Row
						kind="value"
						label="Correction"
						value={correctionSummary(media)}
						trailing={
							<Button
								size="sm"
								variant="secondary"
								aria-expanded={editing}
								aria-controls={formId}
								onClick={() => setEditingKey(editing ? null : media.overrideKey)}
							>
								{media.overrideActive ? "Edit correction" : "Correct this file"}
							</Button>
						}
					/>
				)}
			</Panel>

			{!media.overrideKey && (
				<p className="type-caption text-pretty text-muted-foreground">
					{isAudio
						? "This is not a file on disk, so there is nothing to file a correction against."
						: "This file name carries no title, so there is nothing to file a correction under."}
				</p>
			)}

			{editing && media.overrideKey && (
				<div id={formId}>
					<OverrideForm
						overrideKey={media.overrideKey}
						sourceFilename={media.fileTitle ?? media.title}
						isAudio={isAudio}
						binding={media.overrideBinding ?? "metadata"}
						deducedTitle={media.title}
						deducedArtist={media.artist ?? ""}
						deducedKind={deducedKind(media)}
						currentCoverUrl={artworkUrl}
						coverSourceUrl={media.contentImageSourceUrl}
						overrideActive={media.overrideActive}
						onDone={() => {
							setEditingKey(null)
							// The save evicted the caches, so the panel reflects the correction
							// now rather than at the next poll.
							void refreshMediaInfo()
						}}
						onCancel={() => setEditingKey(null)}
					/>
				</div>
			)}
		</div>
	)
}

/**
 * A file binding is worth saying out loud: it behaves differently from the
 * usual one, and Settings is where the difference is explained in full.
 */
function correctionSummary(media: MediaState): string {
	if (!media.overrideActive) {
		return media.overrideBinding === "file" ? "Not set, held against this file" : "Not set"
	}
	return media.overrideBinding === "file" ? "Saved against this file" : "Saved for this file"
}

function deducedKind(media: MediaState): "movie" | "tv" | null {
	if (media.contentType === "tv_show" || media.contentType === "anime") {
		return "tv"
	}
	if (media.contentType === "movie") {
		return "movie"
	}
	return null
}

function sourceRows(media: MediaState): SourceRow[] {
	const rows: SourceRow[] = []

	// Only worth a row when the parse moved: side by side, a bad parse is obvious.
	if (media.fileTitle && media.fileTitle !== media.title) {
		rows.push({ label: "File", value: media.fileTitle })
	}
	if (media.title) {
		rows.push({ label: "Title", value: media.title })
	}
	if (media.artist) {
		rows.push({ label: "Artist", value: media.artist })
	}
	if (media.album) {
		rows.push({ label: "Album", value: media.album })
	}

	const episode = formatEpisode(media.season, media.episode)
	if (episode) {
		rows.push({ label: "Episode", value: episode })
	}
	if (media.year) {
		rows.push({ label: "Year", value: media.year })
	}

	const duration = formatDuration(media.duration)
	if (duration) {
		rows.push({ label: "Duration", value: duration, tabular: true })
	}

	const kind = contentTypeLabel(media.contentType, media.mediaType)
	if (kind) {
		rows.push({ label: "Media type", value: kind })
	}

	return rows
}
