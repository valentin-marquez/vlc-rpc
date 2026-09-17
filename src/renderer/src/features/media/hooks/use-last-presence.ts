import { useStore } from "@nanostores/react"
import type { LastSentPresence } from "@shared/presence/presence.types"
import { useEffect } from "react"
import { refreshLastPresence } from "../media.actions"
import { lastPresenceStore } from "../media.store"

// The main loop ticks at 1.5s, so this reads a little behind it and never faster.
const POLL_INTERVAL = 2000

/**
 * Polled on its own rather than off the VLC status loop, which stops the moment
 * VLC is unreachable. "Cleared because VLC went away" is one of the answers this
 * reading has to keep delivering, so it cannot depend on VLC being there.
 */
export function useLastPresence(): LastSentPresence {
	useEffect(() => {
		void refreshLastPresence()
		const interval = setInterval(() => {
			void refreshLastPresence()
		}, POLL_INTERVAL)

		return () => clearInterval(interval)
	}, [])

	return useStore(lastPresenceStore)
}
