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
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { TmdbKeyCheck } from "@shared/catalog/catalog.types"
import { useState } from "react"

interface TmdbKeyFormProps {
	savedApiKey: string
}

type Verification =
	| { state: "idle" }
	| { state: "checking" }
	| { state: "done"; result: TmdbKeyCheck }

export function TmdbKeyForm({ savedApiKey }: TmdbKeyFormProps): JSX.Element {
	const [apiKey, setApiKey] = useState(savedApiKey)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showKey, setShowKey] = useState(false)
	const [verification, setVerification] = useState<Verification>({ state: "idle" })

	const trimmedKey = apiKey.trim()
	const isBusy = isSubmitting || verification.state === "checking"

	function handleKeyChange(event: React.ChangeEvent<HTMLInputElement>): void {
		setApiKey(event.target.value)
		// A result about the previous text says nothing about this one.
		setVerification({ state: "idle" })
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setIsSubmitting(true)

		try {
			await saveConfig("tmdbApiKey", trimmedKey)
			logger.info("TMDB API key updated")
		} catch (error) {
			logger.error(`Failed to update TMDB API key: ${error}`)
		} finally {
			setIsSubmitting(false)
		}
	}

	async function handleVerify(): Promise<void> {
		setVerification({ state: "checking" })

		try {
			const result = await window.api.catalog.verifyTmdbKey(trimmedKey)
			setVerification({ state: "done", result })
		} catch (error) {
			logger.error(`TMDB API key verification could not run: ${error}`)
			setVerification({ state: "done", result: "unreachable" })
		}
	}

	return (
		<section className="bg-card text-card-foreground rounded-md overflow-hidden border border-border">
			<div className="border-b border-border px-4 py-3">
				<h2 className="font-semibold">TMDB API Key</h2>
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
								aria-describedby="tmdbApiKeyHint"
								className="focus-discord pr-10"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
								onClick={() => setShowKey(!showKey)}
								aria-label={showKey ? "Hide API key" : "Show API key"}
							>
								{showKey ? <EyeNoneIcon aria-hidden /> : <EyeOpenIcon aria-hidden />}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground" id="tmdbApiKeyHint">
							Used for movie and TV posters. Get a free one at{" "}
							<a
								href="https://www.themoviedb.org/settings/api"
								target="_blank"
								rel="noreferrer"
								className="text-primary hover:underline focus-discord rounded-sm"
							>
								themoviedb.org
							</a>
							, under Settings, API.
						</p>
					</div>

					{!savedApiKey && (
						<p className="text-xs text-muted-foreground bg-background p-3 rounded-md">
							Without a key, only anime resolves a poster, through AniList. Movies and western TV
							will play without one.
						</p>
					)}

					<div className="flex flex-col sm:flex-row gap-2">
						<Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
							Save API Key
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={handleVerify}
							disabled={isBusy || !trimmedKey}
							className="w-full sm:w-auto"
						>
							Verify API Key
						</Button>
					</div>

					<div aria-live="polite">
						{verification.state !== "idle" && <VerificationMessage verification={verification} />}
					</div>
				</form>
			</div>
		</section>
	)
}

function VerificationMessage({ verification }: { verification: Verification }): JSX.Element | null {
	if (verification.state === "checking") {
		return (
			<p className="flex items-start gap-2 text-xs text-muted-foreground">
				<UpdateIcon className="mt-0.5 shrink-0 animate-spin" aria-hidden />
				Checking this key with TMDB...
			</p>
		)
	}

	if (verification.state === "idle") {
		return null
	}

	switch (verification.result) {
		case "valid":
			return (
				<p className="flex items-start gap-2 text-xs text-green-400">
					<CheckCircledIcon className="mt-0.5 shrink-0" aria-hidden />
					TMDB accepted this key. Remember to save it.
				</p>
			)
		case "rejected":
			return (
				<p className="flex items-start gap-2 text-xs text-destructive">
					<CrossCircledIcon className="mt-0.5 shrink-0" aria-hidden />
					TMDB rejected this key. Copy the API Key (v3 auth) from your TMDB account again.
				</p>
			)
		case "unreachable":
			return (
				<p className="flex items-start gap-2 text-xs text-muted-foreground">
					<ExclamationTriangleIcon className="mt-0.5 shrink-0" aria-hidden />
					Could not reach TMDB, so the key was not checked. Try again once you are back online.
				</p>
			)
	}
}
