import { useEffect, useState } from "react"
import { getProxiedImage } from "../media.actions"

/**
 * The image Discord was actually handed, not the one this screen would have
 * picked. Block A exists to expose a mismatch, so drawing the locally resolved
 * cover there would hide exactly the case it is meant to reveal: right after a
 * correction is saved, the two differ.
 *
 * `large_image` is either an address or one of the Discord application's own
 * asset keys. An asset key is not something the renderer can fetch, and the
 * page's CSP blocks remote images anyway, so an address goes through the proxy
 * and anything else falls back to the card's placeholder.
 */
export function usePresenceArtwork(largeImage: string | undefined): string | null {
	const [proxiedUrl, setProxiedUrl] = useState<string | null>(null)

	useEffect(() => {
		if (!largeImage || !/^https?:\/\//i.test(largeImage)) {
			setProxiedUrl(null)
			return
		}

		let current = true
		getProxiedImage(largeImage).then((url) => {
			if (current) {
				setProxiedUrl(url)
			}
		})
		return () => {
			current = false
		}
	}, [largeImage])

	return proxiedUrl
}
