import {
	CheckCircledIcon,
	CrossCircledIcon,
	ExclamationTriangleIcon,
	EyeNoneIcon,
	EyeOpenIcon,
	UpdateIcon,
} from "@radix-ui/react-icons"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import { cn, logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { TmdbKeyCheck } from "@shared/catalog/catalog.types"
import { useEffect, useRef, useState } from "react"

interface TmdbKeyFormProps {
	savedApiKey: string
}

type Status =
	| { state: "idle" }
	| { state: "checking" }
	| { state: "saving" }
	| { state: "checked"; result: TmdbKeyCheck }
	| { state: "empty" }
	| { state: "refused" }
	| { state: "saveFailed" }
	| { state: "savedAndVerified" }
	| { state: "savedUnchecked" }
	| { state: "removed" }

type SavedState = Extract<Status, { state: "savedAndVerified" | "savedUnchecked" | "removed" }>

const HINT_ID = "tmdbApiKeyHint"
const NO_KEY_NOTE_ID = "tmdbApiKeyNoKeyNote"
const STATUS_ID = "tmdbApiKeyStatus"

async function checkKey(apiKey: string): Promise<TmdbKeyCheck> {
	try {
		return await window.api.catalog.verifyTmdbKey(apiKey)
	} catch (error) {
		logger.error(`TMDB API key verification could not run: ${error}`)
		return "unreachable"
	}
}

export function TmdbKeyForm({ savedApiKey }: TmdbKeyFormProps): JSX.Element {
	const [apiKey, setApiKey] = useState(savedApiKey)
	const [showKey, setShowKey] = useState(false)
	const [status, setStatus] = useState<Status>({ state: "idle" })
	const keyAtMount = useRef(savedApiKey)
	// A verdict is about one exact string. Bumping this discards any answer that
	// arrives after the field moved on.
	const checkId = useRef(0)

	const trimmedKey = apiKey.trim()
	const isDirty = trimmedKey !== savedApiKey
	const isBusy = status.state === "checking" || status.state === "saving"
	const describedBy = savedApiKey
		? `${HINT_ID} ${STATUS_ID}`
		: `${HINT_ID} ${NO_KEY_NOTE_ID} ${STATUS_ID}`

	// Reopening Settings should show the verdict for the key that is actually
	// stored, not a blank slate that makes a bad key look like a good one.
	useEffect(() => {
		const savedAtMount = keyAtMount.current
		if (!savedAtMount) {
			return
		}

		let cancelled = false
		checkId.current += 1
		const id = checkId.current
		setStatus({ state: "checking" })

		checkKey(savedAtMount).then((result) => {
			if (!cancelled && checkId.current === id) {
				setStatus({ state: "checked", result })
			}
		})

		return () => {
			cancelled = true
		}
	}, [])

	function handleKeyChange(event: React.ChangeEvent<HTMLInputElement>): void {
		setApiKey(event.target.value)
		checkId.current += 1
		// A result about the previous text says nothing about this one.
		setStatus({ state: "idle" })
	}

	async function persist(value: string, outcome: SavedState["state"]): Promise<void> {
		setStatus({ state: "saving" })

		try {
			await saveConfig("tmdbApiKey", value)
			setStatus({ state: outcome })
			logger.info(value ? "TMDB API key updated" : "TMDB API key removed")
		} catch (error) {
			logger.error(`Failed to update TMDB API key: ${error}`)
			setStatus({ state: "saveFailed" })
		}
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (isBusy) {
			return
		}

		if (!trimmedKey) {
			if (!savedApiKey) {
				setStatus({ state: "empty" })
				return
			}
			// Dropping the key is always safe: the lookup falls back to AniList.
			await persist("", "removed")
			return
		}

		checkId.current += 1
		const id = checkId.current
		setStatus({ state: "checking" })
		const result = await checkKey(trimmedKey)
		if (checkId.current !== id) {
			return
		}

		// A key TMDB refuses would still take over the lookup once saved, so it
		// is worse than no key at all. Refuse the write instead.
		if (result === "rejected") {
			setStatus({ state: "refused" })
			return
		}

		await persist(trimmedKey, result === "valid" ? "savedAndVerified" : "savedUnchecked")
	}

	async function handleVerify(): Promise<void> {
		if (isBusy) {
			return
		}

		if (!trimmedKey) {
			setStatus({ state: "empty" })
			return
		}

		checkId.current += 1
		const id = checkId.current
		setStatus({ state: "checking" })
		const result = await checkKey(trimmedKey)
		if (checkId.current === id) {
			setStatus({ state: "checked", result })
		}
	}

	return (
		<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
			<div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
				<h2 className="font-semibold">TMDB API Key</h2>
				<span className="text-sm text-muted-foreground">
					{savedApiKey ? "Key saved" : "No key set"}
				</span>
			</div>
			<div className="p-4">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm font-medium text-card-foreground" htmlFor="tmdbApiKey">
							API Key
						</label>
						<div className="relative">
							<Input
								id="tmdbApiKey"
								name="tmdbApiKey"
								type={showKey ? "text" : "password"}
								value={apiKey}
								onChange={handleKeyChange}
								placeholder={savedApiKey ? "••••••••" : "No API key set"}
								autoComplete="off"
								spellCheck={false}
								aria-describedby={describedBy}
								className="focus-discord pr-10"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
								onClick={() => setShowKey(!showKey)}
								aria-pressed={showKey}
								aria-label={showKey ? "Hide API key" : "Show API key"}
							>
								{showKey ? <EyeNoneIcon aria-hidden /> : <EyeOpenIcon aria-hidden />}
							</Button>
						</div>
						<p className="text-sm text-muted-foreground" id={HINT_ID}>
							Used for movie and TV posters. Get a free one at{" "}
							<a
								href="https://www.themoviedb.org/settings/api"
								target="_blank"
								rel="noreferrer"
								className="text-foreground underline underline-offset-2 decoration-foreground/40 hover:decoration-foreground focus-discord rounded-sm"
							>
								themoviedb.org
							</a>
							, under Settings, API.
						</p>
					</div>

					{!savedApiKey && (
						<p
							className="text-xs text-muted-foreground bg-background p-3 rounded-md"
							id={NO_KEY_NOTE_ID}
						>
							Without a key, only anime resolves a poster, through AniList. Movies and western TV
							will play without one.
						</p>
					)}

					<div className="flex flex-col sm:flex-row gap-2">
						{/* Neither action is ever natively disabled: a disabled button leaves the
						    keyboard with a dead end and drops focus mid check. */}
						<Button
							type="submit"
							aria-disabled={isBusy}
							aria-busy={isBusy}
							className="w-full sm:w-auto aria-disabled:opacity-60"
						>
							{isBusy && <UpdateIcon className="mr-2 animate-spin" aria-hidden />}
							{status.state === "saving" ? "Saving..." : "Save and verify"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={handleVerify}
							aria-disabled={isBusy}
							className="w-full sm:w-auto aria-disabled:opacity-60"
						>
							Verify without saving
						</Button>
					</div>

					<div aria-live="polite" id={STATUS_ID}>
						{status.state !== "idle" && <StatusMessage status={status} isDirty={isDirty} />}
					</div>
				</form>
			</div>
		</section>
	)
}

const TONE = {
	neutral: "text-muted-foreground",
	good: "text-green-400",
	bad: "text-destructive",
} as const

// Every icon in @radix-ui/react-icons shares this shape.
type IconComponent = typeof UpdateIcon

interface StatusLineProps {
	tone: keyof typeof TONE
	icon: IconComponent
	spin?: boolean
	children: React.ReactNode
}

function StatusLine({ tone, icon: Icon, spin, children }: StatusLineProps): JSX.Element {
	return (
		<p className={cn("flex items-start gap-2 text-xs", TONE[tone])}>
			<Icon className={cn("mt-0.5 shrink-0", spin && "animate-spin")} aria-hidden />
			{children}
		</p>
	)
}

function StatusMessage({
	status,
	isDirty,
}: { status: Status; isDirty: boolean }): JSX.Element | null {
	switch (status.state) {
		case "idle":
			return null

		case "checking":
			return (
				<StatusLine tone="neutral" icon={UpdateIcon} spin>
					Checking this key with TMDB...
				</StatusLine>
			)

		case "saving":
			return (
				<StatusLine tone="neutral" icon={UpdateIcon} spin>
					Saving this key...
				</StatusLine>
			)

		case "empty":
			return (
				<StatusLine tone="neutral" icon={ExclamationTriangleIcon}>
					Paste your TMDB API key into the field first.
				</StatusLine>
			)

		case "refused":
			return (
				<StatusLine tone="bad" icon={CrossCircledIcon}>
					TMDB rejected this key, so it was not saved. A saved key takes over the lookup, so this
					one would remove the AniList fallback that is finding posters today. Copy the API Key (v3
					auth) from your TMDB account again.
				</StatusLine>
			)

		case "saveFailed":
			return (
				<StatusLine tone="bad" icon={CrossCircledIcon}>
					Could not save the key, so nothing changed. Try again.
				</StatusLine>
			)

		case "savedAndVerified":
			return (
				<StatusLine tone="good" icon={CheckCircledIcon}>
					Saved. TMDB accepted this key.
				</StatusLine>
			)

		case "savedUnchecked":
			return (
				<StatusLine tone="neutral" icon={ExclamationTriangleIcon}>
					Saved, but TMDB did not answer, so the key was not checked. Check your connection, or try
					again in a minute.
				</StatusLine>
			)

		case "removed":
			return (
				<StatusLine tone="good" icon={CheckCircledIcon}>
					Saved. The key was removed, so posters come from AniList only.
				</StatusLine>
			)

		case "checked":
			return <CheckResult result={status.result} isDirty={isDirty} />
	}
}

function CheckResult({ result, isDirty }: { result: TmdbKeyCheck; isDirty: boolean }): JSX.Element {
	switch (result) {
		case "valid":
			return (
				<StatusLine tone="good" icon={CheckCircledIcon}>
					{isDirty
						? "TMDB accepted this key. It is not saved yet, use Save and verify."
						: "TMDB accepted the saved key."}
				</StatusLine>
			)

		case "rejected":
			return (
				<StatusLine tone="bad" icon={CrossCircledIcon}>
					TMDB rejected this key. Copy the API Key (v3 auth) from your TMDB account again.
				</StatusLine>
			)

		case "unreachable":
			return (
				<StatusLine tone="neutral" icon={ExclamationTriangleIcon}>
					TMDB did not answer, so the key was not checked. Check your connection, or try again in a
					minute.
				</StatusLine>
			)
	}
}
