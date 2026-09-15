import type { Clock } from "@main/core/clock"
import type { VlcStatus } from "@shared/vlc/vlc.types"

export interface TimelineWindow {
	start?: number
	end?: number
}

function computeWindow(
	nowMs: number,
	position: number,
	duration: number,
	rate: number,
): TimelineWindow {
	const nowSeconds = Math.floor(nowMs / 1000)
	const safeRate = rate > 0 ? rate : 1
	const start = nowSeconds - Math.floor(position / safeRate)

	if (!(duration > 0) || duration >= 86_400) {
		return { start }
	}

	const end = nowSeconds + Math.floor((duration - position) / safeRate)
	return { start, end }
}

const SEEK_THRESHOLD_SECONDS = 3

export class Timeline {
	private epoch = 0
	private window: TimelineWindow = {}
	private lastPlid: number | null = null
	private lastPlaying = false
	private lastRate = 1
	private lastPosition = 0
	private lastPolledAtMs = 0

	constructor(private readonly clock: Clock) {}

	public get currentEpoch(): number {
		return this.epoch
	}

	/**
	 * Feed the latest playback snapshot. Recomputes the window, and bumps the
	 * epoch, only when something that should reset Discord's progress bar
	 * actually happened: a new track, resuming from pause, a seek detected by
	 * drift against the wall clock, or a change in playback rate. Otherwise
	 * this returns the same window as last time, so the caller is free to
	 * poll far more often than the timeline needs to change.
	 */
	public update(status: VlcStatus): TimelineWindow {
		const now = this.clock.now()
		const isPlaying = status.status === "playing"
		const { plid } = status
		const { position, duration, rate } = status.playback

		const trackChanged = plid !== this.lastPlid
		const resumed = isPlaying && !this.lastPlaying
		const rateChanged = rate !== this.lastRate
		const seeked = this.driftedBeyondThreshold(now, position, isPlaying, trackChanged)

		if (!isPlaying) {
			this.window = {}
		} else if (trackChanged || resumed || rateChanged || seeked) {
			this.epoch++
			this.window = computeWindow(now, position, duration, rate)
		}

		this.lastPlid = plid
		this.lastPlaying = isPlaying
		this.lastRate = rate
		this.lastPosition = position
		this.lastPolledAtMs = now

		return this.window
	}

	private driftedBeyondThreshold(
		now: number,
		position: number,
		isPlaying: boolean,
		trackChanged: boolean,
	): boolean {
		if (trackChanged || !isPlaying || !this.lastPlaying) {
			return false
		}

		const elapsedSeconds = (now - this.lastPolledAtMs) / 1000
		const expected = this.lastPosition + elapsedSeconds * this.lastRate
		return Math.abs(position - expected) > SEEK_THRESHOLD_SECONDS
	}
}
