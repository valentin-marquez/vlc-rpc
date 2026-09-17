import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { VlcStatus } from "@shared/vlc/vlc.types"
import type { AudioFileIdentity } from "./music.types"

/** What VLC is playing, narrowed to the one question this step asks of it. */
export interface PlayingFile {
	getCurrentFileUri(): Promise<string | null>
}

/**
 * `fileURLToPath` rather than trimming the scheme by hand: it is the one place
 * that already knows drive letters, percent decoding and UNC shares. The cover
 * feature carries its own copy of this, on a store that also writes metadata,
 * and music has no business depending on that.
 */
function filePathOf(uri: string): string | null {
	// A stream has no bytes on disk, so there is nothing here to name.
	if (!uri.startsWith("file:")) {
		return null
	}

	try {
		return fileURLToPath(uri)
	} catch {
		return null
	}
}

/**
 * What has to stay the same for a located file to still be that file. Null when
 * VLC reports no playlist item, which is when nothing is worth remembering.
 */
function memoToken(status: VlcStatus): string | null {
	if (status.plid === null) {
		return null
	}
	return [status.plid, status.media.title ?? "", status.playback.duration].join("|")
}

/**
 * Which file on disk VLC is playing, asked once per playlist item.
 *
 * It sits apart from the fingerprint step because two callers now need the
 * answer and only one of them is optional. Identification needs it to hash the
 * audio, and is off entirely on an install with no fpcalc binary. A correction
 * needs it to have something to be filed under when the tags name nothing, and
 * a correction that only worked on installs carrying an optional binary would
 * be missing exactly where it is needed most.
 */
export class Locator {
	/**
	 * The playlist item this file was located for. The presence loop resolves
	 * every 1.5 seconds and reading the playlist is an http round trip, so the
	 * same question about the same item is asked once.
	 *
	 * The id alone is not enough to say "still the same file". VLC numbers
	 * playlist items per process, so quitting and reopening it hands a fresh
	 * file the same low id, and the memo would answer with the previous one:
	 * the wrong cover, on a path where no tag exists to contradict it. The
	 * title and the duration come free in the same status and separate two
	 * files that happen to share an id.
	 */
	private located: { token: string; file: AudioFileIdentity | null } | null = null

	constructor(private readonly playing: PlayingFile) {}

	public async fileFor(status: VlcStatus): Promise<AudioFileIdentity | null> {
		const token = memoToken(status)
		const memo = this.located
		if (token !== null && memo !== null && memo.token === token) {
			return memo.file
		}

		const file = await this.locate()
		if (token !== null) {
			this.located = { token, file }
		}
		return file
	}

	private async locate(): Promise<AudioFileIdentity | null> {
		try {
			const uri = await this.playing.getCurrentFileUri()
			if (uri === null) {
				return null
			}

			const path = filePathOf(uri)
			if (path === null) {
				return null
			}

			const stats = await stat(path)
			return stats.isFile() ? { path, size: stats.size, modifiedAt: stats.mtimeMs } : null
		} catch {
			// A file that moved between the playlist read and this one. Both callers
			// treat a missing answer as "nothing to do here", so it is never news.
			return null
		}
	}
}
