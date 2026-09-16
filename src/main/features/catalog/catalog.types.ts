export interface ParsedVideo {
	title: string
	season?: number | undefined
	episode?: number | undefined
	year?: number | undefined
	signal: "fansub" | "western" | "ambiguous"
}

export interface Candidate {
	provider: "tmdb" | "anilist"
	id: string
	title: string
	aliases: string[]
	year?: number | undefined
	mediaKind: "movie" | "tv"
	posterUrl: string | null
}

export interface CatalogProvider {
	search(query: string): Promise<Candidate[]>
}

export interface CatalogResult {
	title: string
	poster: string | null
	mediaKind: "movie" | "tv"
	season?: number | undefined
	episode?: number | undefined
}

export interface CachedWork {
	title: string
	poster: string | null
	mediaKind: "movie" | "tv"
}

export type CacheEntry =
	| { status: "resolved"; version: number; work: CachedWork; lastAccessedAt: number }
	| { status: "unresolved"; version: number; expiresAt: number; lastAccessedAt: number }

export type UnresolvedReason =
	| "no-results"
	| "no-match"
	| "provider-error"
	| "timeout"
	| "parse-invalid"
