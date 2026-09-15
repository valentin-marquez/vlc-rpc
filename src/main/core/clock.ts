/**
 * Anything that depends on "now" takes this instead of calling Date.now()
 * directly, so tests can inject a fake clock and become deterministic.
 */
export interface Clock {
	now(): number
}

export class SystemClock implements Clock {
	now(): number {
		return Date.now()
	}
}
