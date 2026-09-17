/**
 * Build time values electron-vite inlines into the main process. Its default
 * envPrefix there is MAIN_VITE_, so nothing else in .env reaches this bundle.
 */
interface ImportMetaEnv {
	/** Empty in a clone with no .env, which turns the fingerprint step off. */
	readonly MAIN_VITE_ACOUSTID_KEY?: string
}
