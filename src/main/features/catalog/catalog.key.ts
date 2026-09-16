import type { ParsedVideo } from "./catalog.types"

export function catalogKey(parsed: ParsedVideo): string {
	if (parsed.season !== undefined) {
		return `tv:${parsed.title}|${parsed.season}`
	}
	if (parsed.year !== undefined) {
		return `movie:${parsed.title}|${parsed.year}`
	}
	return `video:${parsed.title}`
}
