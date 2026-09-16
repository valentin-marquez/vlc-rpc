import { logger } from "@main/core/logger"
import { splitCollaboration } from "./music.credit"
import type { CandidateRelease, MusicProvider, RecordingCandidate, TrackQuery } from "./music.types"

const ENDPOINT = "https://itunes.apple.com/search"
const LIMIT = 5
// The informal ceiling is around 20 calls a minute, so one every three seconds
// stays under it even while a user skips through a playlist.
const MIN_INTERVAL_MS = 3000
const REQUEST_TIMEOUT_MS = 5000

/** The rest of the URL is opaque, so only the trailing size segment is rewritten. */
const ARTWORK_SIZE = /100x100bb\.jpg$/
const DISCORD_ARTWORK_SIZE = "600x600bb.jpg"

interface ITunesTrack {
	trackId: number
	trackName: string
	artistName: string
	collectionName?: string
	releaseDate?: string
	artworkUrl100?: string
}

interface ITunesSearchResponse {
	resultCount: number
	results: ITunesTrack[]
}

export class ITunesProvider implements MusicProvider {
	private lastRequestAt = 0
	// Turns queue on this chain. Without it, concurrent searches all read the
	// same lastRequestAt, compute the same wait and then fire together, which is
	// the exact case the throttle exists for (a user skipping through a playlist).
	private queue: Promise<void> = Promise.resolve()

	// Empty list means iTunes answered and has nothing. Throwing means the search
	// never happened, and the resolver caches those two for different lengths.
	public async search(query: TrackQuery): Promise<RecordingCandidate[]> {
		await this.throttle()

		const params = new URLSearchParams({
			term: [...query.artists, query.title].join(" "),
			entity: "song",
			limit: String(LIMIT),
		})

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
				signal: controller.signal,
			})
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`)
			}

			const body = (await response.json()) as ITunesSearchResponse
			if (body.resultCount === 0) {
				return []
			}

			return body.results.map((track, index) => this.normalize(track, index))
		} catch (error) {
			logger.warn(`iTunes search failed: ${error}`)
			throw error
		} finally {
			clearTimeout(timeoutId)
		}
	}

	private throttle(): Promise<void> {
		const turn = this.queue.then(async () => {
			const wait = MIN_INTERVAL_MS - (Date.now() - this.lastRequestAt)
			if (wait > 0) {
				await new Promise((resolve) => setTimeout(resolve, wait))
			}
			this.lastRequestAt = Date.now()
		})
		this.queue = turn
		return turn
	}

	private normalize(track: ITunesTrack, index: number): RecordingCandidate {
		const { title, collaborators } = splitCollaboration(track.trackName)

		const release: CandidateRelease = {
			title: track.collectionName ?? title,
			date: track.releaseDate,
			coverUrl: track.artworkUrl100
				? track.artworkUrl100.replace(ARTWORK_SIZE, DISCORD_ARTWORK_SIZE)
				: undefined,
		}

		return {
			provider: "itunes",
			id: String(track.trackId),
			title,
			artists: [track.artistName, ...collaborators],
			releases: [release],
			rank: index,
		}
	}
}
