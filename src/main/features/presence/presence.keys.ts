import type { VlcStatus } from "@shared/vlc/vlc.types"

/**
 * Identity of what gets sent to Discord. Two calls returning the same key
 * mean nothing worth updating changed: advancing playback position alone
 * does not change it, since Discord animates the progress bar on its own
 * from start_timestamp/end_timestamp without needing a resend.
 *
 * epoch is the caller's timeline epoch (see Timeline): bumping it forces a
 * resend even when nothing else here changed, because the timestamps
 * themselves were recomputed.
 */
export function presenceKey(status: VlcStatus, epoch: number): string {
	const { plid, status: playbackState, media, playback } = status

	return [
		plid ?? "none",
		playbackState,
		media.title ?? "",
		media.artist ?? "",
		media.album ?? "",
		playback.rate,
		epoch,
	].join("|")
}
