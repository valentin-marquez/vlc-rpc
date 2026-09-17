import type { PresenceBadge, PresenceProgress } from "@renderer/components/presence-card"
import { presenceBadge, presenceProgress } from "@renderer/features/media"
import type { LastSentPresence } from "@shared/presence/presence.types"

import type { PreviewSample } from "./layout.constants"

/**
 * Everything the card draws that is not one of the arranged lines: the cover, the small
 * image over its corner and the times under the text. The card drawing the live file reads
 * all three off the presence that was actually sent, the same reading Home does, so the
 * builder cannot draw a profile something the loop never handed to Discord.
 */
export interface CardDressing {
	badge?: PresenceBadge | undefined
	/** What the presence named its artwork, which is an address only sometimes. */
	largeImage?: string | undefined
	progress?: PresenceProgress | undefined
}

/**
 * A presence is only ever on a profile while a file is open, so an example carries the
 * playing image. It says nothing about hover text: Discord writes the resolution in there
 * for video, and an example has no resolution to write.
 */
export const EXAMPLE_BADGE: PresenceBadge = { kind: "playing" }

/** An example has no cover to draw and no clock to run. */
const EXAMPLE: CardDressing = { badge: EXAMPLE_BADGE }

export function cardDressing(
	sample: PreviewSample | undefined,
	presence: LastSentPresence,
	pausedImage: string,
): CardDressing {
	if (sample?.isLive !== true || presence.kind !== "sent") {
		return EXAMPLE
	}

	const sent = presence.presence
	const badge = presenceBadge(sent, pausedImage)
	const progress = presenceProgress(sent)

	return {
		badge: badge ?? undefined,
		largeImage: sent.large_image,
		progress: progress ?? undefined,
	}
}
