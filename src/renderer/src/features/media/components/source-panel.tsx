import { useStore } from "@nanostores/react"
import { Button } from "@renderer/components/ui/button"
import { Panel, Row } from "@renderer/components/ui/panel"
import { vlcStatusStore } from "@renderer/features/vlc"
import React from "react"

import { useProxiedArtwork } from "../hooks/use-proxied-artwork"
import { applyCorrection } from "../media.actions"
import type { CorrectionRow } from "../media.format"
import { contentTypeLabel, correctionSummary, formatDuration, formatEpisode } from "../media.format"
import type { MediaState } from "../media.store"
import { correctionStore, mediaStore } from "../media.store"
import { OverrideForm } from "./override-form"

interface SourceRow {
	label: string
	value: string
	tabular?: boolean
}

/**
 * An open correction form, pinned to the file it was opened for. It lasts as
 * long as that file plays: what is typed into it was typed about one file, and
 * neither the next track nor the same track played again inherits it.
 */
type EditSession = { kind: "closed" } | { kind: "open"; key: string; file: string | null }

/**
 * What VLC reports, beside what Discord shows. This app's whole job is the
 * mapping between the two, so the source sits next to the result and a wrong
 * title or a wrong cover is one glance away.
 */
export function SourcePanel(): JSX.Element {
	const vlcStatus = useStore(vlcStatusStore)
	const media = useStore(mediaStore)
	const correction = useStore(correctionStore)
	const artworkUrl = useProxiedArtwork()
	const [edit, setEdit] = React.useState<EditSession>({ kind: "closed" })
	const formId = React.useId()
	// Read once, so the key the form is opened on is the key the save is filed
	// under even though a poll can land between the two.
	const overrideKey = media.overrideKey
	// The file the correction would be about, named as the form itself records it.
	const playingFile = media.fileTitle ?? media.title
	// Both, and not the key alone. An audio correction is filed per record, so the
	// next track of the same album derives the same key: on the key alone a form
	// left open reopened over the next song still carrying what was typed for the
	// one before, which is a correction saved onto the wrong file.
	const editing = edit.kind === "open" && edit.key === overrideKey && edit.file === playingFile
	const applying = correction.kind === "applying" && correction.key === overrideKey

	React.useEffect(() => {
		if (edit.kind === "open" && edit.file !== playingFile) {
			setEdit({ kind: "closed" })
		}
	}, [edit, playingFile])

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

				{overrideKey && (
					<Row
						kind="value"
						label="Correction"
						// A live region rather than plain text: the row is where the answer
						// to "did that save" lives, and it changes without being touched.
						value={
							<output className="block truncate">
								{correctionSummary(correctionRow(media), correction)}
							</output>
						}
						trailing={
							<Button
								size="sm"
								variant="secondary"
								aria-expanded={editing}
								aria-controls={formId}
								isLoading={applying}
								onClick={() =>
									setEdit(
										editing
											? { kind: "closed" }
											: { kind: "open", key: overrideKey, file: playingFile },
									)
								}
							>
								{media.overrideActive ? "Edit correction" : "Correct this file"}
							</Button>
						}
					/>
				)}
			</Panel>

			{!overrideKey && (
				<p className="type-caption text-pretty text-muted-foreground">
					{isAudio
						? "This is not a file on disk, so there is nothing to file a correction against."
						: "This file name carries no title, so there is nothing to file a correction under."}
				</p>
			)}

			{editing && overrideKey && (
				<div id={formId}>
					<OverrideForm
						overrideKey={overrideKey}
						sourceFilename={media.fileTitle ?? media.title}
						isAudio={isAudio}
						binding={media.overrideBinding ?? "metadata"}
						deducedTitle={media.title}
						deducedArtist={media.artist ?? ""}
						deducedKind={deducedKind(media)}
						currentCoverUrl={artworkUrl}
						coverSourceUrl={media.contentImageSourceUrl}
						overrideActive={media.overrideActive}
						onDone={(outcome) => {
							setEdit({ kind: "closed" })
							void applyCorrection(overrideKey, outcome)
						}}
						onCancel={() => setEdit({ kind: "closed" })}
					/>
				</div>
			)}
		</div>
	)
}

function correctionRow(media: MediaState): CorrectionRow {
	return {
		key: media.overrideKey,
		active: media.overrideActive,
		binding: media.overrideBinding,
	}
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
