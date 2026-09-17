import { logger } from "@renderer/lib/utils"
import { type UpdateOffer, describeUpdateOffer } from "@shared/updates/update-offer.mapper"
import type { UpdateAvailability, UpdateInstallKind } from "@shared/updates/update.types"
import { useCallback, useEffect, useState } from "react"

export interface UpdateOfferState {
	offer: UpdateOffer
	/** Takes the offer up. A no-op for the offers that are not actions. */
	accept: () => void
}

/**
 * The push event alone is not enough. A release is found three seconds after
 * the app starts, which is before this window has loaded, and it is announced
 * once per version rather than on every check, so a renderer that mounts late
 * would never hear about an update that is already standing. It asks for the
 * current state on mount and listens for what comes after.
 */
export function useUpdateOffer(): UpdateOfferState {
	const [availability, setAvailability] = useState<UpdateAvailability>({ kind: "none" })
	const [install, setInstall] = useState<UpdateInstallKind | null>(null)

	useEffect(() => {
		// The snapshot was taken before any push that lands while it is in flight, so
		// writing it afterwards would put the window back on a state the updater has
		// already moved off, until the next event happens to correct it.
		let pushed = false

		const stopListening = window.api.update.onAvailability((next) => {
			pushed = true
			setAvailability(next)
		})

		Promise.all([window.api.update.getInstallationType(), window.api.update.getCurrent()])
			.then(([kind, current]) => {
				setInstall(kind)
				if (!pushed) setAvailability(current)
			})
			.catch((error) => {
				logger.error(`Failed to read the update state: ${error}`)
			})

		return stopListening
	}, [])

	const offer = describeUpdateOffer(install, availability)

	const accept = useCallback(() => {
		switch (offer.kind) {
			case "install":
				window.api.update.download().catch((error) => {
					logger.error(`Failed to start the update: ${error}`)
				})
				return
			case "release-page":
				window.api.update.openReleasePage().catch((error) => {
					logger.error(`Failed to open the release page: ${error}`)
				})
				return
			// Already under way, or nothing to take up.
			case "working":
			case "none":
				return
		}
	}, [offer.kind])

	return { offer, accept }
}
