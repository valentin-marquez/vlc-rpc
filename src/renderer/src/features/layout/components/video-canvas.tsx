import { useStore } from "@nanostores/react"
import type { MediaState } from "@renderer/features/media"
import { mediaStore, useLastPresence } from "@renderer/features/media"
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import {
	DEFAULT_VIDEO_LAYOUT,
	VIDEO_PIECES,
	type VideoFacts,
	fromVideoLines,
	resolveVideoLayout,
	toVideoLines,
	videoChoiceFor,
	videoVariables,
} from "@shared/presence/layout"
import { inspectLayout } from "@shared/presence/layout-builder"

import type { PreviewSample } from "../layout.constants"
import { SAMPLE_EPISODE, SAMPLE_FILM, VIDEO_SLOTS } from "../layout.constants"
import { useLayoutDraft } from "../use-layout-draft"
import { LayoutCanvas } from "./layout-canvas"

/**
 * The point of a video arrangement is how differently it reads for an episode and for a
 * film, so both are always on screen, whatever is playing.
 */
const FIXTURES: readonly PreviewSample[] = [
	{
		id: "series",
		label: "A TV show",
		inSentence: "a TV show",
		isLive: false,
		variables: videoVariables(SAMPLE_EPISODE),
	},
	{
		id: "film",
		label: "A film",
		inSentence: "a film",
		isLive: false,
		variables: videoVariables(SAMPLE_FILM),
	},
]

export function VideoCanvas({ config }: { config: AppConfig }): JSX.Element {
	const media = useStore(mediaStore)
	const lastPresence = useLastPresence()

	const stored = toVideoLines(resolveVideoLayout(config.videoLayoutPreset))
	const draft = useLayoutDraft(stored, async (lines) => {
		const choice = videoChoiceFor(fromVideoLines(lines))
		await saveConfig("videoLayoutPreset", choice)
		logger.info(`Video layout saved as: ${choice.kind}`)
	})

	// What is playing goes first, so the card can be held beside the real Discord window.
	const playing = liveFacts(media)
	const samples: readonly PreviewSample[] =
		playing === null
			? FIXTURES
			: [
					{
						id: "playing",
						label: "What is playing",
						inSentence: "what is playing",
						isLive: true,
						variables: videoVariables(playing),
					},
					...FIXTURES,
				]

	const report = inspectLayout(
		draft.cleaned.map((line, index) => ({
			id: `line-${index}`,
			label: VIDEO_SLOTS[index]?.label ?? "",
			line,
		})),
		samples,
	)

	return (
		<LayoutCanvas
			draft={draft}
			slots={VIDEO_SLOTS}
			pieces={VIDEO_PIECES}
			samples={samples}
			report={report}
			verb="Watching"
			presence={lastPresence}
			pausedImage={config.pausedImage}
			icon="video"
			onReset={() => draft.replaceAll(toVideoLines(DEFAULT_VIDEO_LAYOUT))}
		/>
	)
}

/**
 * The file on screen right now, read from the same store Home reads, which holds the title
 * the catalog resolved rather than the file name. Null whenever what plays is not a video.
 */
function liveFacts(media: MediaState): VideoFacts | null {
	if (media.mediaType !== "video" || media.title === null || media.title === "") return null

	return {
		title: media.title,
		season: media.season ?? undefined,
		episode: media.episode ?? undefined,
		year: media.year ?? undefined,
	}
}
