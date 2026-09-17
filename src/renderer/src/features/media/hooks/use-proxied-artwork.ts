import { useStore } from "@nanostores/react"
import { useEffect, useState } from "react"
import { getProxiedImage } from "../media.actions"
import { mediaStore } from "../media.store"

/** The resolved cover wins over VLC's own, which is the coarser of the two. */
export function useProxiedArtwork(): string | null {
	const media = useStore(mediaStore)
	const [proxiedUrl, setProxiedUrl] = useState<string | null>(null)

	useEffect(() => {
		const artworkUrl = media.contentImageUrl || media.artwork
		if (artworkUrl) {
			getProxiedImage(artworkUrl).then(setProxiedUrl)
		} else {
			setProxiedUrl(null)
		}
	}, [media.contentImageUrl, media.artwork])

	return proxiedUrl
}
