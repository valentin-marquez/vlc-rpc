import { join } from "node:path"

/**
 * How this copy of the app got onto the machine, which decides whether an
 * update can install itself.
 */
export type InstallKind =
	| { kind: "installed" }
	| { kind: "portable"; reason: "portable-launcher" | "no-uninstaller" }

export interface InstallProbe {
	portableLauncher: boolean
	uninstallerPresent: boolean
}

/** electron-builder names it after the product, next to the executable. */
const UNINSTALLER_FILENAME = "Uninstall VLC Discord RP.exe"

export function uninstallerPath(resourcesPath: string): string {
	return join(resourcesPath, "..", UNINSTALLER_FILENAME)
}

/**
 * Both signals are facts the build produces, not guesses about the path: the
 * portable stub exports PORTABLE_EXECUTABLE_FILE before it starts us, and the
 * NSIS installer writes the uninstaller into the directory it installed to.
 */
export function probeInstall(
	env: Readonly<Record<string, string | undefined>>,
	resourcesPath: string,
	exists: (path: string) => boolean,
): InstallProbe {
	const launcher = env.PORTABLE_EXECUTABLE_FILE

	return {
		portableLauncher: launcher !== undefined && launcher.length > 0,
		uninstallerPresent: exists(uninstallerPath(resourcesPath)),
	}
}

/**
 * Portable is the safe answer when neither signal is present: offering a
 * manual update to someone who could have had an automatic one is a smaller
 * harm than silently running an installer over a copy that was never installed.
 */
export function detectInstallKind(probe: InstallProbe): InstallKind {
	if (probe.portableLauncher) {
		return { kind: "portable", reason: "portable-launcher" }
	}

	if (probe.uninstallerPresent) {
		return { kind: "installed" }
	}

	return { kind: "portable", reason: "no-uninstaller" }
}
