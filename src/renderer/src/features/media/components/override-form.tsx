import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { logger } from "@renderer/lib/utils"
import type { OverrideDraft, OverrideSaveResult } from "@shared/ipc/channels"
import React from "react"

type MediaKindChoice = "deduced" | "movie" | "tv"

const KIND_LABELS: Record<"movie" | "tv", string> = { movie: "Movie", tv: "TV show" }

export interface OverrideFormProps {
	/** The key from `media:get-info`, passed back verbatim. */
	overrideKey: string
	/** The file title as VLC reports it, stored so a future rename can be migrated. */
	sourceFilename: string
	isAudio: boolean
	deducedTitle: string
	/** Named on the fallback choice, so the user can see what they are keeping. */
	deducedKind: "movie" | "tv" | null
	/** Shown beside the address field. Usually a data URL, so it cannot prefill the field. */
	currentCoverUrl: string | null
	overrideActive: boolean
	/** Saved or removed: the caller closes the form and refreshes the panel. */
	onDone: () => void
	onCancel: () => void
}

export function OverrideForm({
	overrideKey,
	sourceFilename,
	isAudio,
	deducedTitle,
	deducedKind,
	currentCoverUrl,
	overrideActive,
	onDone,
	onCancel,
}: OverrideFormProps): JSX.Element {
	const titleId = React.useId()
	const coverId = React.useId()
	const kindName = React.useId()
	const firstFieldRef = React.useRef<HTMLInputElement>(null)

	const [title, setTitle] = React.useState(deducedTitle)
	const [cover, setCover] = React.useState("")
	// Starts on the fallback so a correction pins only the fields the user chose.
	const [kind, setKind] = React.useState<MediaKindChoice>("deduced")
	const [busy, setBusy] = React.useState<"none" | "saving" | "removing">("none")
	const [error, setError] = React.useState<SaveError | null>(null)

	React.useEffect(() => {
		firstFieldRef.current?.focus()
	}, [])

	const trimmedCover = cover.trim()
	const trimmedTitle = title.trim()
	const canSave = isAudio
		? trimmedCover !== ""
		: trimmedTitle !== "" || trimmedCover !== "" || kind !== "deduced"

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setError(null)
		setBusy("saving")

		try {
			const result = await window.api.overrides.save(overrideKey, buildDraft())
			if (result.saved) {
				onDone()
				return
			}
			setError(failureMessage(result))
		} catch (cause) {
			logger.error(`Failed to save the override: ${cause}`)
			setError({
				message: "Saving did not go through. The app could not reach its own store.",
				coverAtFault: false,
			})
		} finally {
			setBusy("none")
		}
	}

	async function handleRemove(): Promise<void> {
		setError(null)
		setBusy("removing")

		try {
			await window.api.overrides.remove(overrideKey)
			onDone()
		} catch (cause) {
			logger.error(`Failed to remove the override: ${cause}`)
			setError({
				message: "Removing did not go through. The app could not reach its own store.",
				coverAtFault: false,
			})
			setBusy("none")
		}
	}

	function buildDraft(): OverrideDraft {
		if (isAudio) {
			return { kind: "audio", cover: trimmedCover, sourceFilename }
		}

		return {
			kind: "video",
			title: trimmedTitle || undefined,
			cover: trimmedCover || undefined,
			mediaKind: kind === "deduced" ? undefined : kind,
			sourceFilename,
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-4 rounded-md border border-divider bg-card p-4"
		>
			<p className="type-caption text-muted-foreground">
				{isAudio
					? "Audio text is built from the file's own tags, so only the cover can be corrected."
					: "Leave a field empty to keep what the app worked out."}
			</p>

			{!isAudio && (
				<div className="flex flex-col gap-2">
					<label htmlFor={titleId} className="type-caption text-muted-foreground">
						Title
					</label>
					<Input
						ref={firstFieldRef}
						id={titleId}
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="What this should be called"
					/>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<label htmlFor={coverId} className="type-caption text-muted-foreground">
					Cover image address
				</label>
				<div className="flex items-center gap-3">
					{currentCoverUrl && (
						<img
							src={currentCoverUrl}
							alt=""
							className="size-10 shrink-0 rounded-sm object-cover shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
						/>
					)}
					<Input
						ref={isAudio ? firstFieldRef : undefined}
						id={coverId}
						type="url"
						value={cover}
						onChange={(event) => setCover(event.target.value)}
						aria-invalid={error?.coverAtFault ? "true" : undefined}
						placeholder="Paste the address of an image"
					/>
				</div>
				<p className="type-caption text-muted-foreground">
					Open the image on its own first, then copy its address. The address of the page it sits on
					will not load.
				</p>
			</div>

			{!isAudio && (
				<fieldset className="flex flex-col gap-2">
					<legend className="type-caption text-muted-foreground">Media kind</legend>
					<div className="flex flex-wrap gap-4">
						{kindOptions(deducedKind).map((option) => (
							<label
								key={option.value}
								className="type-body flex cursor-pointer items-center gap-2 text-body"
							>
								<input
									type="radio"
									name={kindName}
									value={option.value}
									checked={kind === option.value}
									onChange={() => setKind(option.value)}
									className="focus-discord size-4 cursor-pointer [accent-color:hsl(var(--brand))]"
								/>
								{option.label}
							</label>
						))}
					</div>
				</fieldset>
			)}

			{error && (
				<p role="alert" className="type-caption text-danger-text">
					{error.message}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" size="sm" disabled={!canSave} isLoading={busy === "saving"}>
					Save correction
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				{overrideActive && (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="ms-auto"
						isLoading={busy === "removing"}
						onClick={() => {
							void handleRemove()
						}}
					>
						Remove correction
					</Button>
				)}
			</div>

			<p className="type-caption break-all text-muted-foreground">Filed under {overrideKey}</p>
		</form>
	)
}

interface SaveError {
	message: string
	coverAtFault: boolean
}

function kindOptions(deducedKind: "movie" | "tv" | null): {
	value: MediaKindChoice
	label: string
}[] {
	return [
		{
			value: "deduced",
			label: deducedKind
				? `Keep what the app worked out, ${KIND_LABELS[deducedKind].toLowerCase()}`
				: "Keep what the app worked out",
		},
		{ value: "movie", label: KIND_LABELS.movie },
		{ value: "tv", label: KIND_LABELS.tv },
	]
}

/**
 * The four failures are kept apart because each asks for a different move:
 * retype what was pasted, check a dead link, copy the image address rather than
 * the page it sits on, or report a key the store should never have offered.
 */
function failureMessage(result: Extract<OverrideSaveResult, { saved: false }>): SaveError {
	switch (result.reason) {
		case "cover-not-a-url":
			return {
				message: "That is not a web address. Paste a link that starts with http or https.",
				coverAtFault: true,
			}
		case "cover-unreachable":
			return {
				message:
					result.status === null
						? "The cover address did not answer. Check the link, or try again if the site is down."
						: `The cover address answered ${result.status}. The image has moved or been taken down.`,
				coverAtFault: true,
			}
		case "cover-not-an-image":
			return {
				message:
					result.contentType === null
						? "That address does not return an image. Open the image itself and copy its address."
						: `That address returns ${result.contentType}, not an image. Open the image itself and copy its address.`,
				coverAtFault: true,
			}
		case "store-refused":
			return {
				message:
					"Saving was refused for this file. Nothing was written, and that is a fault in the app rather than in what you typed.",
				coverAtFault: false,
			}
	}
}
