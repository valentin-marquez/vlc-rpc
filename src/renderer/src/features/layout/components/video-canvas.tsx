import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import {
	DEFAULT_VIDEO_LAYOUT,
	VIDEO_PIECES,
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
 * Both examples are fixtures, never what is playing. The point of a video arrangement is
 * how differently it reads for an episode and for a film, and that only shows on a pair.
 */
const SAMPLES: readonly PreviewSample[] = [
	{
		id: "series",
		label: "A TV show",
		inSentence: "a TV show",
		variables: videoVariables(SAMPLE_EPISODE),
	},
	{ id: "film", label: "A film", inSentence: "a film", variables: videoVariables(SAMPLE_FILM) },
]

export function VideoCanvas({ config }: { config: AppConfig }): JSX.Element {
	const stored = toVideoLines(resolveVideoLayout(config.videoLayoutPreset))
	const draft = useLayoutDraft(stored, async (lines) => {
		const choice = videoChoiceFor(fromVideoLines(lines))
		await saveConfig("videoLayoutPreset", choice)
		logger.info(`Video layout saved as: ${choice.kind}`)
	})

	const report = inspectLayout(
		draft.cleaned.map((line, index) => ({
			id: `line-${index}`,
			label: VIDEO_SLOTS[index]?.label ?? "",
			line,
		})),
		SAMPLES,
	)

	return (
		<LayoutCanvas
			draft={draft}
			slots={VIDEO_SLOTS}
			pieces={VIDEO_PIECES}
			samples={SAMPLES}
			report={report}
			header="Watching"
			icon="video"
			onReset={() => draft.replaceAll(toVideoLines(DEFAULT_VIDEO_LAYOUT))}
		/>
	)
}
