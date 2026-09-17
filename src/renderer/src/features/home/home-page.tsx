import { NowPlaying } from "@renderer/features/media/components/now-playing"
import { SourcePanel } from "@renderer/features/media/components/source-panel"

/**
 * Two blocks: what Discord shows, then what VLC reports. Connection state is not
 * one of them, it lives in the header chips on every screen, where it can say
 * what is wrong and offer the fix without a banner shoving the page down.
 */
export function HomePage(): JSX.Element {
	return (
		<div className="flex flex-col gap-6">
			<h1 className="sr-only">Home</h1>

			<NowPlaying />
			<SourcePanel />
		</div>
	)
}
