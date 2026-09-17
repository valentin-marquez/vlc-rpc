import { useStore } from "@nanostores/react"
import { mediaStore } from "@renderer/features/media"
import { logger } from "@renderer/lib/utils"
import { saveConfig } from "@renderer/stores/config.store"
import type { AppConfig } from "@shared/config/app-config"
import {
	DEFAULT_MUSIC_LAYOUT,
	MUSIC_PIECES,
	fromMusicLines,
	musicChoiceFor,
	resolveMusicLayout,
	toMusicLines,
} from "@shared/presence/layout"
import { inspectLayout } from "@shared/presence/layout-builder"

import type { PreviewSample } from "../layout.constants"
import { MUSIC_SLOTS, SAMPLE_TRACK, UNTAGGED_TRACK } from "../layout.constants"
import { useLayoutDraft } from "../use-layout-draft"
import { LayoutCanvas } from "./layout-canvas"

export function MusicCanvas({ config }: { config: AppConfig }): JSX.Element {
	const media = useStore(mediaStore)

	const stored = toMusicLines(resolveMusicLayout(config.layoutPreset))
	const draft = useLayoutDraft(stored, async (lines) => {
		const choice = musicChoiceFor(fromMusicLines(lines))
		await saveConfig("layoutPreset", choice)
		logger.info(`Music layout saved as: ${choice.kind}`)
	})

	const isLive = media.mediaType === "audio" && media.title !== null && media.title !== ""
	const samples: PreviewSample[] = [
		{
			id: "track",
			label: isLive ? "What is playing" : "An example track",
			inSentence: isLive ? "what is playing" : "the example track",
			variables: isLive
				? { title: media.title ?? "", artist: media.artist ?? "", album: media.album ?? "" }
				: SAMPLE_TRACK,
		},
		{
			id: "untagged",
			label: "A file with no tags",
			inSentence: "a file with no tags",
			variables: UNTAGGED_TRACK,
		},
	]

	const report = inspectLayout(
		draft.cleaned.map((line, index) => ({
			id: `line-${index}`,
			label: MUSIC_SLOTS[index]?.label ?? "",
			line,
		})),
		samples,
	)

	return (
		<LayoutCanvas
			draft={draft}
			slots={MUSIC_SLOTS}
			pieces={MUSIC_PIECES}
			samples={samples}
			report={report}
			header="Listening"
			icon="music"
			onReset={() => draft.replaceAll(toMusicLines(DEFAULT_MUSIC_LAYOUT))}
		/>
	)
}
