export interface ParsedVlcHttpConfig {
	httpPort: number
	httpPassword: string | null
	httpEnabled: boolean
}

const DEFAULT_HTTP_PORT = 8080

interface VlcrcSetting {
	section: string
	key: string
	value: string
}

/**
 * Parse a vlcrc file into its active key=value settings, scoped by section.
 *
 * A commented line (anything starting with #, once trimmed) is not an active
 * setting and is skipped entirely. This is stricter than the regex based
 * parser it replaces, which matched key=value across an optional leading #
 * and let \s* cross line boundaries: an empty commented value like
 * "#http-password=" made the pattern skip the blank line after it and
 * capture the next non-blank line, from any section, as the password.
 */
function parseSettings(content: string): VlcrcSetting[] {
	let section = ""
	const settings: VlcrcSetting[] = []

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (line.length === 0 || line.startsWith("#")) {
			continue
		}

		const sectionMatch = line.match(/^\[([^\]]+)\]/)
		if (sectionMatch) {
			section = sectionMatch[1]
			continue
		}

		const separator = line.indexOf("=")
		if (separator === -1) {
			continue
		}

		settings.push({
			section,
			key: line.slice(0, separator).trim(),
			value: line.slice(separator + 1).trim(),
		})
	}

	return settings
}

function find(settings: VlcrcSetting[], section: string, key: string): string | null {
	const setting = settings.find((s) => s.section === section && s.key === key)
	return setting && setting.value.length > 0 ? setting.value : null
}

/**
 * Parse the HTTP interface settings VLC writes to vlcrc.
 *
 * httpEnabled requires an explicit active interface setting (extraintf=http
 * or intf=http). A port or password being present is not evidence the
 * interface is on: VLC writes both, commented out, to a fresh vlcrc.
 */
export function parseVlcConfig(content: string): ParsedVlcHttpConfig {
	const settings = parseSettings(content)

	const portValue = find(settings, "core", "http-port") ?? find(settings, "http", "port")
	const httpPort =
		portValue !== null && /^\d+$/.test(portValue)
			? Number.parseInt(portValue, 10)
			: DEFAULT_HTTP_PORT

	const httpPassword = find(settings, "lua", "http-password") ?? find(settings, "http", "password")

	const extraIntf = find(settings, "core", "extraintf")
	const mainIntf = find(settings, "core", "intf")
	const httpEnabled =
		(extraIntf
			?.split(",")
			.map((v) => v.trim())
			.includes("http") ??
			false) ||
		mainIntf === "http"

	return { httpPort, httpPassword, httpEnabled }
}
