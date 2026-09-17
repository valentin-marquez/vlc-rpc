import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"
import { logger } from "@main/core/logger"
import { app } from "electron"
import type { AudioFingerprinter, FingerprintOutcome } from "./music.types"

const run = promisify(execFile)

/** Measured at 0.26 s on a four minute mp3, so this is a hung process, not a slow one. */
const TIMEOUT_MS = 10_000

/** The fingerprint of that same file was 3.7 KB. This is room for a pathological file. */
const MAX_OUTPUT_BYTES = 256 * 1024

export interface FpcalcLocation {
	packaged: boolean
	resourcesPath: string
	appPath: string
	platform: string
	arch: string
}

/**
 * Where the binary is, which differs between the two ways this app runs.
 * Packaged, electron-builder copies `resources` beside the app through
 * extraResources and asarUnpack keeps it a real file rather than an archive
 * entry, which is what makes it executable. In development it sits where
 * scripts/fetch-fpcalc.mjs puts it, inside the repository.
 */
export function fpcalcPath(location: FpcalcLocation): string {
	const root = location.packaged
		? join(location.resourcesPath, "resources")
		: join(location.appPath, "resources")
	const binary = location.platform === "win32" ? "fpcalc.exe" : "fpcalc"
	return join(root, "bin", `${location.platform}-${location.arch}`, binary)
}

function installedPath(): string {
	return fpcalcPath({
		packaged: app.isPackaged,
		resourcesPath: process.resourcesPath,
		appPath: app.getAppPath(),
		platform: process.platform,
		arch: process.arch,
	})
}

/**
 * `failed` rather than a throw for every shape of bad output, including output
 * that is not json at all: the caller is a poll loop, and a file this binary
 * cannot read is an ordinary fact about a library.
 */
export function parseFpcalc(stdout: string): FingerprintOutcome {
	try {
		const parsed = JSON.parse(stdout) as { fingerprint?: unknown; duration?: unknown }
		const { fingerprint, duration } = parsed
		if (typeof fingerprint !== "string" || fingerprint.length === 0) {
			return { kind: "failed" }
		}
		if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
			return { kind: "failed" }
		}
		return { kind: "fingerprinted", fingerprint, duration }
	} catch {
		return { kind: "failed" }
	}
}

/**
 * Chromaprint's fpcalc, run over the file VLC is playing. It is a third party
 * binary fetched per build, not a dependency, so the honest answer on an
 * install that does not have it is that this step is absent.
 */
export class Fpcalc implements AudioFingerprinter {
	public readonly available: boolean
	private readonly binary: string

	constructor(binary: string = installedPath()) {
		this.binary = binary
		this.available = existsSync(binary)
		if (!this.available) {
			// Once, at startup. A platform with no published build, or an install
			// whose postinstall never downloaded it.
			logger.info("Audio fingerprinting is off: fpcalc is not installed for this platform")
		}
	}

	public async fingerprint(filePath: string): Promise<FingerprintOutcome> {
		if (!this.available) {
			return { kind: "absent" }
		}

		try {
			// Arguments as a list and no shell, because the path comes from the
			// user's playlist and a command string would let a filename become
			// part of the command. The timeout and the buffer cap are what keep a
			// file that decodes forever from holding the poll loop.
			const { stdout } = await run(this.binary, ["-json", filePath], {
				timeout: TIMEOUT_MS,
				maxBuffer: MAX_OUTPUT_BYTES,
				windowsHide: true,
				shell: false,
			})
			return parseFpcalc(stdout)
		} catch (error) {
			// The error carries the whole command line, the user's own path
			// included, so only its name is recorded.
			logger.warn(
				`fpcalc could not read the file: ${error instanceof Error ? error.name : "unknown error"}`,
			)
			return { kind: "failed" }
		}
	}
}
