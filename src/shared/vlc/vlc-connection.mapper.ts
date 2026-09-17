import type { VlcConnectionReason } from "./vlc.types"

/**
 * How loudly a reason deserves to be reported. Severity belongs to the cause,
 * not to "did the request come back": a media player that is not open yet is
 * the resting state of this app, and painting that red taught the user to
 * ignore the one colour that should mean something is broken.
 */
export type VlcConnectionSeverity = "ok" | "warning" | "error"

/**
 * What the app can do about it on the user's behalf. A tag rather than a bag of
 * optional fields: advice like restarting VLC is carried by the copy, while
 * these two are buttons that have to be wired to something.
 */
export type VlcConnectionRemedy =
	| { kind: "none" }
	| { kind: "enable-http"; label: string }
	| { kind: "open-settings"; label: string }

export interface VlcConnectionAdvice {
	severity: VlcConnectionSeverity
	/** Two or three words beside the dot, so state is never only a colour. */
	state: string
	/** What happened, in the user's terms. Never the error the app caught. */
	headline: string
	/** What fixes it, when the app knows. */
	detail: string
	remedy: VlcConnectionRemedy
}

const OPEN_SETTINGS: VlcConnectionRemedy = { kind: "open-settings", label: "Open VLC settings" }

/**
 * A Record over the union, so a reason added later cannot compile until someone
 * has decided how loud it is and what to tell the user.
 */
const ADVICE: Record<VlcConnectionReason, VlcConnectionAdvice> = {
	// Nothing is wrong, so there is nothing to raise.
	running: {
		severity: "ok",
		state: "connected",
		headline: "VLC is connected",
		detail: "Your Discord status follows whatever VLC plays.",
		remedy: { kind: "none" },
	},

	// A setup step nobody has taken yet, and the app can take it in one click.
	// Worth attention, but nothing has failed.
	"not-configured": {
		severity: "warning",
		state: "not set up",
		headline: "VLC is not set up yet",
		detail:
			"The app reads what is playing through VLC's web interface, and it is switched off. Turn it on here, then restart VLC.",
		remedy: { kind: "enable-http", label: "Turn on VLC's web interface" },
	},

	// The commonest state of all. Somebody who has not opened VLC is not having
	// a problem, so this is a nudge and never an alarm.
	"not-running": {
		severity: "warning",
		state: "not open",
		headline: "VLC is not open",
		detail: "Open VLC and play something. The app connects on its own.",
		remedy: { kind: "none" },
	},

	// VLC is there and refused us. Nothing works until someone reconciles the
	// two passwords, and the app cannot guess which one is right.
	"auth-failed": {
		severity: "error",
		state: "wrong password",
		headline: "VLC did not accept the password",
		detail:
			"The password saved here is not the one VLC expects. Make them match in settings, then restart VLC.",
		remedy: OPEN_SETTINGS,
	},

	// Something is on that port and it is not VLC, so the app is talking to a
	// stranger. Genuinely broken, and only the user knows which port is right.
	"misconfigured-endpoint": {
		severity: "error",
		state: "wrong port",
		headline: "Something answered, but it was not VLC",
		detail:
			"Another program may have taken the port VLC uses. Check the port in settings, then restart VLC.",
		remedy: OPEN_SETTINGS,
	},

	// VLC answered in a way this app has never seen. Rare enough that the
	// honest thing is to admit it rather than guess a cause.
	"unexpected-status": {
		severity: "error",
		state: "unexpected reply",
		headline: "VLC gave an answer the app cannot read",
		detail: "Restart VLC and check again. If it keeps happening, restart the app too.",
		remedy: { kind: "none" },
	},

	// Usually a machine under load or a VLC still starting up. It clears itself
	// far more often than it means anything, so it stays a warning.
	timeout: {
		severity: "warning",
		state: "no answer yet",
		headline: "VLC did not answer in time",
		detail: "VLC may be busy or still starting. This usually clears on its own.",
		remedy: { kind: "none" },
	},

	// The app failed to classify it, which is exactly when to be loud: there is
	// no safe assumption left to make.
	"unknown-error": {
		severity: "error",
		state: "cannot connect",
		headline: "The app cannot reach VLC",
		detail: "Check that VLC is open and that its web interface is on, then restart VLC.",
		remedy: OPEN_SETTINGS,
	},
}

export function describeVlcConnection(reason: VlcConnectionReason): VlcConnectionAdvice {
	// The Record makes this total at compile time, but the value arrives over IPC
	// and a renderer can outlive the main process it was built against. An
	// unmapped string would otherwise destructure to undefined and take the whole
	// window down, which is a worse answer than saying it does not know.
	return ADVICE[reason] ?? ADVICE["unknown-error"]
}
