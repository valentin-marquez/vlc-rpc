/**
 * The update feed, the release assets and any error raised against them carry
 * urls, and an error object carries whatever fields the library hung on it.
 * Everything this feature logs goes through here first.
 */

export interface LoggableError {
	name: string
	code?: string
}

export interface LogSink {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
}

export interface UpdaterLogger {
	info(message?: unknown): void
	warn(message?: unknown): void
	error(message?: unknown): void
}

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi

export function describeError(error: unknown): LoggableError {
	if (!(error instanceof Error)) {
		return { name: "unknown" }
	}

	const code = "code" in error && typeof error.code === "string" ? error.code : undefined

	return code === undefined ? { name: error.name } : { name: error.name, code }
}

/**
 * The host says which server answered, which is the diagnosable half. The path
 * and the query are the half that can hold a credential.
 */
export function redactUrls(text: string): string {
	return text.replace(URL_PATTERN, (match) => {
		try {
			const { origin } = new URL(match)
			return origin === "null" ? "[redacted]" : `${origin}/[redacted]`
		} catch {
			return "[redacted]"
		}
	})
}

export function createUpdaterLogger(sink: LogSink): UpdaterLogger {
	const format = (message: unknown): string | null => {
		if (message === undefined || message === null) return null
		if (message instanceof Error) return `[updater] ${JSON.stringify(describeError(message))}`
		return `[updater] ${redactUrls(String(message))}`
	}

	return {
		info(message?: unknown): void {
			const line = format(message)
			if (line !== null) sink.info(line)
		},
		warn(message?: unknown): void {
			const line = format(message)
			if (line !== null) sink.warn(line)
		},
		error(message?: unknown): void {
			const line = format(message)
			if (line !== null) sink.error(line)
		},
	}
}
