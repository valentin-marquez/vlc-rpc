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
