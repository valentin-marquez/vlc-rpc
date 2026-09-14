import type { ContentType } from "@shared/media/media.types"
const CONTENT_TYPE_LABELS: Record<string, string> = {
	tv_show: "TV Show",
	movie: "Movie",
	anime: "Anime",
	audio: "Audio",
	video: "Video",
	music_video: "Music Video",
	documentary: "Documentary",
}

interface ContentTypeBadgeProps {
	contentType: ContentType
}

export function ContentTypeBadge({ contentType }: ContentTypeBadgeProps): JSX.Element | null {
	const label = CONTENT_TYPE_LABELS[contentType]
	if (!label) return null

	return (
		<span className="ml-2 px-2 py-0.5 bg-secondary/20 text-secondary text-xs rounded-full">
			{label}
		</span>
	)
}
