/**
 * What this copy of the app can do about a release. It is a fact of how the
 * copy got onto the machine, not a preference: a portable build cannot replace
 * the file it is running from.
 */
export type UpdateInstallKind = "portable" | "setup"

/**
 * What the updater knows about a release right now. A tag rather than a bag of
 * nullable fields: every state but the first names a version, so nothing can
 * read a version out of a state that has none.
 *
 * `downloading` and `ready` are reachable only by an installed copy. A portable
 * one is never asked to download, because the feed carries the installer.
 */
export type UpdateAvailability =
	| { kind: "none" }
	| { kind: "available"; version: string }
	/** Whole percent, rounded where the progress is received. */
	| { kind: "downloading"; version: string; percent: number }
	| { kind: "ready"; version: string }
	| { kind: "failed"; version: string }

/**
 * The answer to a check a person asked for. The scheduled checks announce a
 * release and say nothing else, which is right for something nobody asked for
 * and wrong for something somebody did: this goes back to whoever pressed, so
 * the screen they pressed on can say what happened, a failure included.
 */
export type UpdateCheckResult =
	| { kind: "found"; version: string }
	| { kind: "up-to-date" }
	/** A check or a download was already running, so this one asked nothing. */
	| { kind: "busy" }
	/**
	 * The feed could not be read. What went wrong stays in the log: the error
	 * carries the url it was made against, and a url can carry a credential.
	 */
	| { kind: "failed" }
