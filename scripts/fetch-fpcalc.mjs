/**
 * Fetches Chromaprint's fpcalc, which turns an audio file into an acoustic
 * fingerprint. It is a third party binary, so it is downloaded per build rather
 * than committed: updating Chromaprint is then a version bump here instead of a
 * four megabyte blob in the repository's history.
 *
 * Runs on postinstall, and again before packaging. Both are idempotent.
 */
import { execFileSync } from "node:child_process"
import { createWriteStream } from "node:fs"
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const VERSION = "1.6.1"
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The published asset per platform, and where the binary lands for us. */
const TARGETS = {
	"win32-x64": { asset: "windows-x86_64.zip", binary: "fpcalc.exe" },
	"darwin-x64": { asset: "macos-x86_64.tar.gz", binary: "fpcalc" },
	"darwin-arm64": { asset: "macos-arm64.tar.gz", binary: "fpcalc" },
	"linux-x64": { asset: "linux-x86_64.tar.gz", binary: "fpcalc" },
	"linux-arm64": { asset: "linux-arm64.tar.gz", binary: "fpcalc" },
}

async function exists(path) {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function findBinary(dir, name) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			const found = await findBinary(full, name)
			if (found) return found
		} else if (entry.name === name) {
			return full
		}
	}
	return null
}

async function main() {
	const key = `${process.platform}-${process.arch}`
	const target = TARGETS[key]
	if (!target) {
		console.log(`fpcalc: no published build for ${key}, skipping`)
		return
	}

	const destDir = join(ROOT, "resources", "bin", key)
	const dest = join(destDir, target.binary)
	if (await exists(dest)) {
		console.log(`fpcalc: already present at resources/bin/${key}/${target.binary}`)
		return
	}

	const url = `https://github.com/acoustid/chromaprint/releases/download/v${VERSION}/chromaprint-fpcalc-${VERSION}-${target.asset}`
	console.log(`fpcalc: downloading ${VERSION} for ${key}`)

	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`fpcalc: download failed with ${response.status} for ${url}`)
	}

	const work = await mkdtemp(join(tmpdir(), "fpcalc-"))
	try {
		const archive = join(work, target.asset.endsWith(".zip") ? "fpcalc.zip" : "fpcalc.tar.gz")
		await pipeline(response.body, createWriteStream(archive))

		if (archive.endsWith(".zip")) {
			execFileSync(
				"powershell",
				[
					"-NoProfile",
					"-Command",
					`Expand-Archive -Path '${archive}' -DestinationPath '${work}' -Force`,
				],
				{ stdio: "inherit" },
			)
		} else {
			execFileSync("tar", ["-xzf", archive, "-C", work], { stdio: "inherit" })
		}

		const found = await findBinary(work, target.binary)
		if (!found) {
			throw new Error(`fpcalc: ${target.binary} was not in the archive`)
		}

		await mkdir(destDir, { recursive: true })
		// Copy rather than rename: the extraction lands in the OS temp directory,
		// and a CI runner commonly puts that on a different volume from the
		// workspace, where a rename fails with EXDEV. The temp tree is removed
		// below either way.
		await copyFile(found, dest)
		if (process.platform !== "win32") {
			await chmod(dest, 0o755)
		}
		console.log(`fpcalc: installed at resources/bin/${key}/${target.binary}`)
	} finally {
		await rm(work, { recursive: true, force: true })
	}
}

// Two callers want opposite things from a failure. On postinstall the binary is
// optional, the app degrades to skipping one identification step, and taking the
// whole install down over a network blip would block every contributor and every
// CI run. Before packaging a release it is not optional: shipping without it
// means that step is dead in the build, silently, so there it has to stop.
const soft = process.argv.includes("--soft")

main().catch((error) => {
	console.error(error.message)
	if (soft) {
		console.error("fpcalc: continuing without it, audio fingerprinting will be skipped")
		return
	}
	// Not process.exit: the fetch may still hold an open handle, and tearing that
	// down mid flight turns a clear 404 into a libuv assertion.
	process.exitCode = 1
})
