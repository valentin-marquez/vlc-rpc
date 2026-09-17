import type { Resolver as CatalogResolver, CatalogResult } from "@main/features/catalog"
import type { CoverOutcome } from "@main/features/cover"
import type { MusicResult } from "@main/features/music"
import type { CorrectedTags } from "@main/features/overrides"
import type { AppConfig } from "@shared/config/app-config"
import { textPiece, valuePiece } from "@shared/presence/layout"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@main/core/logger", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

vi.mock("@main/core/ipc", () => ({ registerHandler: () => {} }))

const BASE_CONFIG = { largeImage: "vlc_logo", playingImage: "playing", pausedImage: "paused" }

const config = vi.hoisted(() => ({
	current: { largeImage: "vlc_logo", playingImage: "playing", pausedImage: "paused" } as Record<
		string,
		unknown
	>,
}))

vi.mock("@main/core/config", () => ({
	configService: {
		get: () => config.current,
		set: () => {},
		delete: () => {},
	},
}))

beforeEach(() => {
	config.current = { ...BASE_CONFIG }
})

function withPresets(presets: Pick<AppConfig, "layoutPreset" | "videoLayoutPreset">): void {
	config.current = { ...BASE_CONFIG, ...presets }
}

// The catalog barrel, reached from presence.state for the video branch, opens
// its own Conf store on import.
vi.mock("electron-conf/main", () => ({
	Conf: class {
		get(): Record<string, never> {
			return {}
		}
		set(): void {}
	},
}))

import { Resolver as ArtworkResolver } from "@main/features/artwork"
import { Service } from "./presence.state"

const LOCAL_ARTWORK = "file:///C:/music/track.jpg"
const PUBLISHED_COVER = "https://uploads.example/local.jpg"
const CATALOG_COVER = "https://catalog.example/cover.jpg"
const OVERRIDE_COVER = "https://corrected.example/right.jpg"

function status(state: "playing" | "paused", artworkUrl?: string): VlcStatus {
	return {
		active: true,
		status: state,
		timestamp: 0,
		plid: 1,
		playback: { position: 30, time: 30, duration: 210, rate: 1 },
		mediaType: "audio",
		media: {
			title: "Probablemente",
			artist: "Christina Aguilera",
			album: "Mi Reflejo",
			artworkUrl,
		},
	}
}

const catalogHit: MusicResult = { cover: CATALOG_COVER, provider: "itunes", id: "42" }
const timeline = { start: 1000, end: 1180 }

/** The measured file: an ID3 tag whose every field is an empty string. */
function untaggedStatus(state: "playing" | "paused"): VlcStatus {
	return {
		...status(state),
		media: { title: "Jose Arnero", artist: "", album: "" },
	}
}

function build(
	outcome: CoverOutcome,
	result: MusicResult | null = catalogHit,
	override: string | null = null,
	corrected: CorrectedTags | null = null,
) {
	const calls = { fetch: 0, resolve: 0 }
	const artwork = new ArtworkResolver(
		{
			fetch: async () => {
				calls.fetch++
				return outcome
			},
		},
		{
			resolve: async () => {
				calls.resolve++
				return result
			},
			overrideCoverFor: async () => override,
		},
	)
	const catalog = {
		resolve: async () => {
			throw new Error("the video catalog must not be consulted for audio")
		},
	} as unknown as CatalogResolver

	return {
		service: new Service(artwork, catalog, { correctedTagsFor: async () => corrected }),
		calls,
	}
}

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence audio artwork while $state",
	({ state }) => {
		it("shows the published artwork and consults no catalog", async () => {
			const { service, calls } = build({ kind: "published", url: PUBLISHED_COVER })

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(presence?.large_image).toBe(PUBLISHED_COVER)
			expect(calls.resolve).toBe(0)
		})

		it("shows a catalog cover when the file carries no artwork", async () => {
			const { service, calls } = build({ kind: "no-artwork" })

			const presence = await service.getDiscordPresence(status(state), timeline)

			expect(presence?.large_image).toBe(CATALOG_COVER)
			expect(calls.resolve).toBe(1)
		})

		it("shows the correction the user typed over the artwork the file carries", async () => {
			const { service, calls } = build(
				{ kind: "published", url: PUBLISHED_COVER },
				catalogHit,
				OVERRIDE_COVER,
			)

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(presence?.large_image).toBe(OVERRIDE_COVER)
			expect(calls.fetch).toBe(0)
			expect(calls.resolve).toBe(0)
		})

		it("consults no catalog when the file has artwork that failed to publish", async () => {
			const { service, calls } = build({ kind: "publish-failed" })

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(calls.resolve).toBe(0)
			expect(presence?.large_image).not.toBe(CATALOG_COVER)
		})

		it("keeps the fallback rather than a path Discord cannot read when the upload failed", async () => {
			const { service } = build({ kind: "publish-failed" })

			const presence = await service.getDiscordPresence(status(state, LOCAL_ARTWORK), timeline)

			expect(presence?.large_image).not.toContain("file://")
			expect(presence?.large_image).toBe(BASE_CONFIG.largeImage)
		})
	},
)

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence audio text while $state",
	({ state }) => {
		it("reads the tags the user typed for a file that carries none", async () => {
			// Without this the text is built from a file name, which is what the
			// mapper falls back to, and Discord reads "Jose Arnero" with no artist.
			const { service } = build({ kind: "no-artwork" }, catalogHit, null, {
				title: "José Arnero",
				artist: "El Baucha",
				source: "correction",
			})

			const presence = await service.getDiscordPresence(untaggedStatus(state), timeline)

			expect(presence?.details).toBe("José Arnero")
			expect(presence?.state).toBe("by El Baucha")
		})

		it("keeps the file's own tags when nothing was corrected", async () => {
			const { service } = build({ kind: "no-artwork" })

			const presence = await service.getDiscordPresence(status(state), timeline)

			expect(presence?.details).toBe("Probablemente")
			expect(presence?.state).toBe("by Christina Aguilera")
			expect(presence?.large_text).toBe("Mi Reflejo")
		})
	},
)

/**
 * The file the whole model was measured against: identified by its sound, so it has a
 * title and an artist and no album anywhere. What Discord drew from these exact fields
 * was "Escuchando Probablemente" on the header, "by Christian Nodal" in bold and
 * "Listening to Music" under that, which is the app's own words on somebody's profile.
 */
describe("Presence for the measured file", () => {
	function nodal(): VlcStatus {
		return {
			active: true,
			status: "playing",
			timestamp: 0,
			plid: 1,
			playback: { position: 84, time: 84, duration: 233, rate: 1 },
			mediaType: "audio",
			media: { title: "Probablemente", artist: "Christian Nodal" },
		}
	}

	it("sends the song in bold, the artist under it, and nothing else", async () => {
		const { service } = build({ kind: "no-artwork" }, null)

		const presence = await service.getDiscordPresence(nodal(), timeline)

		expect(presence).toEqual({
			details: "Probablemente",
			state: "by Christian Nodal",
			large_image: "vlc_logo",
			small_image: "playing",
			small_text: "Playing",
			start_timestamp: 1000,
			end_timestamp: 1180,
			activity_type: 2,
		})
	})
})

const SERIES: CatalogResult = {
	title: "Breaking Bad",
	poster: null,
	mediaKind: "tv",
	season: 2,
	episode: 5,
}
const FILM: CatalogResult = { title: "The Matrix", poster: null, mediaKind: "movie" }

function videoStatus(
	title: string,
	state: "playing" | "paused" = "playing",
	artworkUrl?: string,
): VlcStatus {
	return {
		active: true,
		status: state,
		timestamp: 0,
		plid: 1,
		playback: { position: 30, time: 30, duration: 210, rate: 1 },
		mediaType: "video",
		media: { title, artworkUrl },
	}
}

function videoService(result: CatalogResult | null): Service {
	const artwork = new ArtworkResolver(
		{
			fetch: async () => {
				throw new Error("a video never publishes local audio artwork")
			},
		},
		{
			resolve: async () => {
				throw new Error("the music catalog must not be consulted for video")
			},
			overrideCoverFor: async () => null,
		},
	)
	const catalog = { resolve: async () => result } as unknown as CatalogResolver

	return new Service(artwork, catalog, {
		correctedTagsFor: async () => {
			throw new Error("the audio corrections must not be consulted for video")
		},
	})
}

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence video layout while $state",
	({ state }) => {
		it("shows the title with the episode below it by default", async () => {
			const presence = await videoService(SERIES).getDiscordPresence(
				videoStatus("Breaking.Bad.S02E05.mkv", state),
				timeline,
			)

			expect(presence?.details).toBe("Breaking Bad")
			expect(presence?.state).toBe("S2E5")
		})

		it("shows the year below the title for a film", async () => {
			const presence = await videoService(FILM).getDiscordPresence(
				videoStatus("The Matrix (1999).mkv", state),
				timeline,
			)

			expect(presence?.details).toBe("The Matrix")
			expect(presence?.state).toBe("1999")
		})

		it("folds the episode into the title line when that is how it was arranged", async () => {
			withPresets({
				videoLayoutPreset: {
					kind: "custom",
					layout: { details: [valuePiece("title"), valuePiece("episodeInfo")], state: [] },
				},
			})

			const presence = await videoService(SERIES).getDiscordPresence(
				videoStatus("Breaking.Bad.S02E05.mkv", state),
				timeline,
			)

			expect(presence?.details).toBe("Breaking Bad S2E5")
			expect(presence?.state).toBe("")
		})

		it("hides the episode when the title is the only piece on the card", async () => {
			withPresets({
				videoLayoutPreset: {
					kind: "custom",
					layout: { details: [valuePiece("title")], state: [] },
				},
			})

			const presence = await videoService(SERIES).getDiscordPresence(
				videoStatus("Breaking.Bad.S02E05.mkv", state),
				timeline,
			)

			expect(presence?.details).toBe("Breaking Bad")
			expect(presence?.state).toBe("")
		})

		it("leaves the second line empty rather than writing Unknown", async () => {
			const presence = await videoService(null).getDiscordPresence(
				videoStatus("holiday-clip.mkv", state),
				timeline,
			)

			expect(presence?.details).not.toContain("Unknown")
			expect(presence?.state).toBe("")
		})

		it("ignores the video choice when the music choice is the one that changed", async () => {
			withPresets({
				layoutPreset: {
					kind: "custom",
					layout: {
						activityName: [valuePiece("album")],
						details: [valuePiece("album")],
						state: [],
						largeText: [],
					},
				},
			})

			const presence = await videoService(SERIES).getDiscordPresence(
				videoStatus("Breaking.Bad.S02E05.mkv", state),
				timeline,
			)

			expect(presence?.details).toBe("Breaking Bad")
			expect(presence?.state).toBe("S2E5")
		})
	},
)

const LOCAL_VIDEO_ARTWORK = "file:///C:/movies/The%20Matrix/folder.jpg"
const POSTER = "https://catalog.example/poster.jpg"
const STREAM_ARTWORK = "https://stream.example/art.jpg"

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence video artwork while $state",
	({ state }) => {
		it("keeps the fallback rather than a path Discord cannot read", async () => {
			const presence = await videoService(FILM).getDiscordPresence(
				videoStatus("The Matrix (1999).mkv", state, LOCAL_VIDEO_ARTWORK),
				timeline,
			)

			expect(presence?.large_image).not.toContain("file://")
			expect(presence?.large_image).toBe(BASE_CONFIG.largeImage)
		})

		it("prefers the catalog poster over the artwork VLC found on disk", async () => {
			const presence = await videoService({ ...FILM, poster: POSTER }).getDiscordPresence(
				videoStatus("The Matrix (1999).mkv", state, LOCAL_VIDEO_ARTWORK),
				timeline,
			)

			expect(presence?.large_image).toBe(POSTER)
		})

		it("sends artwork VLC reports as a url, which a stream can carry", async () => {
			const presence = await videoService(null).getDiscordPresence(
				videoStatus("holiday-clip.mkv", state, STREAM_ARTWORK),
				timeline,
			)

			expect(presence?.large_image).toBe(STREAM_ARTWORK)
		})
	},
)

describe("Presence small image", () => {
	it("names the playing indicator in words rather than in its asset key", async () => {
		const { service } = build({ kind: "no-artwork" }, null)

		const presence = await service.getDiscordPresence(status("playing"), timeline)

		expect(presence?.small_image).toBe("playing")
		expect(presence?.small_text).toBe("Playing")
	})

	it("names the paused indicator", async () => {
		const { service } = build({ kind: "no-artwork" }, null)

		const presence = await service.getDiscordPresence(status("paused"), timeline)

		expect(presence?.small_image).toBe("paused")
		expect(presence?.small_text).toBe("Paused")
	})

	it("joins the resolution onto the hover text without a bullet", async () => {
		const withResolution: VlcStatus = {
			...videoStatus("holiday-clip.mkv"),
			videoInfo: { width: 1920, height: 1080 },
		}

		const presence = await videoService(null).getDiscordPresence(withResolution, timeline)

		expect(presence?.small_text).toBe("Playing, 1920x1080")
	})
})

describe.each([{ state: "playing" as const }, { state: "paused" as const }])(
	"Presence music layout while $state",
	({ state }) => {
		function untagged(): VlcStatus {
			return {
				active: true,
				status: state,
				timestamp: 0,
				plid: 1,
				playback: { position: 30, time: 30, duration: 210, rate: 1 },
				mediaType: "audio",
				media: { title: "track01" },
			}
		}

		it("follows the arrangement the user saved", async () => {
			withPresets({
				layoutPreset: {
					kind: "custom",
					layout: {
						activityName: [valuePiece("album")],
						details: [valuePiece("album")],
						state: [valuePiece("title"), textPiece("by"), valuePiece("artist")],
						largeText: [],
					},
				},
			})
			const { service } = build({ kind: "no-artwork" }, null)

			const presence = await service.getDiscordPresence(status(state), timeline)

			expect(presence?.name).toBe("Mi Reflejo")
			expect(presence?.details).toBe("Mi Reflejo")
			expect(presence?.state).toBe("Probablemente by Christina Aguilera")
			expect(presence?.large_text).toBeUndefined()
		})

		it("shows the file name in bold when the file carries no tags", async () => {
			const { service } = build({ kind: "no-artwork" }, null)

			const presence = await service.getDiscordPresence(untagged(), timeline)

			expect(presence?.name).toBeUndefined()
			expect(presence?.details).toBe("track01")
			expect(presence?.state).toBe("")
			expect(presence?.large_text).toBeUndefined()
		})

		it("sends no name at all when the header has nothing to draw, which Discord names itself", async () => {
			withPresets({
				layoutPreset: {
					kind: "custom",
					layout: { activityName: [valuePiece("album")], details: [], state: [], largeText: [] },
				},
			})
			const { service } = build({ kind: "no-artwork" }, null)

			const presence = await service.getDiscordPresence(untagged(), timeline)

			expect(presence?.name).toBeUndefined()
		})

		it("sends the album as the last line and never invents one", async () => {
			const { service } = build({ kind: "no-artwork" }, null)

			const tagged = await service.getDiscordPresence(status(state), timeline)
			expect(tagged?.large_text).toBe("Mi Reflejo")

			const bare = await service.getDiscordPresence(untagged(), timeline)
			expect(bare?.large_text).toBeUndefined()
		})
	},
)
