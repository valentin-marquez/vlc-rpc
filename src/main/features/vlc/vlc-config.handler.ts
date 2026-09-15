import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { configService } from "@main/core/config"
import { registerHandler } from "@main/core/ipc"
import { logger } from "@main/core/logger"
import type { VlcConfig } from "@shared/config/app-config"
import { VLC_CONFIG_PATHS } from "@shared/config/defaults"

import { parseVlcConfig } from "./vlc-config.mapper"
import type { VlcConfigRead } from "./vlc-config.types"
import { vlcStatusService } from "./vlc.client"

/**
 * Handler for VLC configuration operations
 */
export class VlcConfigHandler {
	private vlcConfigPath: string | null = null

	/**
	 * Resolves once the startup synchronization the constructor kicks off has
	 * finished. The constructor cannot await it itself; this is here so a
	 * caller (tests, or startup code that cares) can know when the app's
	 * config has settled instead of racing it.
	 */
	public readonly ready: Promise<void>

	constructor() {
		this.determineVlcConfigPath()
		this.registerHandlers()
		this.ready = this.synchronizeConfig()
	}

	/**
	 * Determine the VLC configuration file path based on the current OS
	 */
	private determineVlcConfigPath(): void {
		const platform = process.platform
		let configPath: string

		if (platform === "win32") {
			configPath = VLC_CONFIG_PATHS.win32.replace("%APPDATA%", process.env.APPDATA || "")
		} else if (platform === "darwin") {
			configPath = VLC_CONFIG_PATHS.darwin.replace("~", os.homedir())
		} else if (platform === "linux") {
			configPath = VLC_CONFIG_PATHS.linux.replace("~", os.homedir())
		} else {
			logger.error(`Unsupported operating system: ${platform}`)
			return
		}

		this.vlcConfigPath = path.normalize(configPath)
		logger.info(`VLC config path: ${this.vlcConfigPath}`)
	}

	private registerHandlers(): void {
		registerHandler("vlc:config:get", async () => {
			return await this.getVlcConfig()
		})

		registerHandler("vlc:config:set", async (config) => {
			return await this.setupVlcConfig(config)
		})
	}

	/**
	 * Read vlcrc and report whether it was actually read.
	 *
	 * The app's stored config is never returned here disguised as a file read:
	 * synchronizeConfig needs to tell "vlcrc says X" from "could not read vlcrc,
	 * assuming X" apart, or it ends up comparing the app's belief to itself and
	 * reporting sync on a file that does not exist.
	 */
	private async readVlcConfigFile(): Promise<VlcConfigRead> {
		if (!this.vlcConfigPath) {
			logger.error("VLC config path not determined")
			return { found: false, reason: "unresolved-path" }
		}

		try {
			await fs.access(this.vlcConfigPath)
		} catch {
			logger.warn(`VLC config file not found at: ${this.vlcConfigPath}`)
			return { found: false, reason: "not-found" }
		}

		try {
			const content = await fs.readFile(this.vlcConfigPath, "utf-8")
			const parsed = parseVlcConfig(content)

			logger.info("VLC configuration read from vlcrc", {
				port: parsed.httpPort,
				enabled: parsed.httpEnabled,
				hasPassword: parsed.httpPassword !== null,
			})

			return {
				found: true,
				config: {
					httpPort: parsed.httpPort,
					httpPassword: parsed.httpPassword ?? configService.get("vlc").httpPassword,
					httpEnabled: parsed.httpEnabled,
				},
			}
		} catch (error) {
			logger.error(`Error reading VLC config file: ${error}`)
			return { found: false, reason: "read-error" }
		}
	}

	/**
	 * Get the current VLC configuration.
	 *
	 * Falls back to the app's own stored config when vlcrc cannot be read.
	 * Callers that need to tell a real read from that fallback apart should use
	 * readVlcConfigFile instead: synchronizeConfig does exactly that.
	 */
	public async getVlcConfig(): Promise<VlcConfig> {
		const result = await this.readVlcConfigFile()
		if (!result.found) {
			return configService.get("vlc")
		}

		configService.set("vlc", result.config)
		vlcStatusService.updateConnectionInfo()
		return result.config
	}

	/**
	 * Set up VLC configuration for Discord Rich Presence
	 */
	public async setupVlcConfig(config: VlcConfig): Promise<boolean> {
		if (!this.vlcConfigPath) {
			logger.error("VLC config path not determined")
			return false
		}

		try {
			await fs.mkdir(path.dirname(this.vlcConfigPath), { recursive: true })

			if (config.httpEnabled && !config.httpPassword) {
				config.httpPassword = this.generateRandomPassword(12)
				logger.info("Generated random HTTP password for VLC")
			}

			let configContent: string[] = []
			let configModified = false

			try {
				const content = await fs.readFile(this.vlcConfigPath, "utf-8")
				configContent = content.split("\n")

				let luaSectionIndex = -1
				let coreSectionIndex = -1
				let portLineIndex = -1
				let commentedPortLineIndex = -1
				let passwordLineIndex = -1
				let commentedPasswordLineIndex = -1
				let extraIntfLineIndex = -1
				let commentedExtraIntfLineIndex = -1

				configContent.forEach((line, index) => {
					if (line.trim() === "[lua]") {
						luaSectionIndex = index
					} else if (line.trim() === "[core]") {
						coreSectionIndex = index
					} else if (line.match(/^http-port=/)) {
						portLineIndex = index
					} else if (line.match(/^#http-port=/)) {
						commentedPortLineIndex = index
					} else if (line.match(/^http-password=/)) {
						passwordLineIndex = index
					} else if (line.match(/^#http-password=/)) {
						commentedPasswordLineIndex = index
					} else if (line.match(/^extraintf=/)) {
						extraIntfLineIndex = index
					} else if (line.match(/^#extraintf=/)) {
						commentedExtraIntfLineIndex = index
					}
				})

				if (luaSectionIndex === -1) {
					configContent.push("[lua]")
					luaSectionIndex = configContent.length - 1
					configModified = true
				}

				if (coreSectionIndex === -1) {
					configContent.push("[core]")
					coreSectionIndex = configContent.length - 1
					configModified = true
				}

				if (portLineIndex >= 0) {
					configContent[portLineIndex] = `http-port=${config.httpPort}`
					configModified = true
				} else if (commentedPortLineIndex >= 0) {
					configContent[commentedPortLineIndex] = `http-port=${config.httpPort}`
					configModified = true
				} else {
					if (coreSectionIndex >= 0) {
						configContent.splice(coreSectionIndex + 1, 0, `http-port=${config.httpPort}`)
						configModified = true
					}
				}

				if (config.httpPassword) {
					if (passwordLineIndex >= 0) {
						configContent[passwordLineIndex] = `http-password=${config.httpPassword}`
						configModified = true
					} else if (commentedPasswordLineIndex >= 0) {
						configContent[commentedPasswordLineIndex] = `http-password=${config.httpPassword}`
						configModified = true
					} else {
						if (luaSectionIndex >= 0) {
							configContent.splice(luaSectionIndex + 1, 0, `http-password=${config.httpPassword}`)
							configModified = true
						}
					}
				}

				if (config.httpEnabled) {
					if (extraIntfLineIndex >= 0) {
						const extraIntf = configContent[extraIntfLineIndex] ?? ""
						if (!extraIntf.includes("http")) {
							const parts = extraIntf.split("=")
							configContent[extraIntfLineIndex] =
								`${parts[0]}=${parts[1] ? `${parts[1]},` : ""}http`
							configModified = true
						}
					} else if (commentedExtraIntfLineIndex >= 0) {
						const commentedExtraIntf = configContent[commentedExtraIntfLineIndex] ?? ""
						const extraIntfValue = commentedExtraIntf.replace(/^#extraintf=/, "")
						configContent[commentedExtraIntfLineIndex] =
							`extraintf=${extraIntfValue ? `${extraIntfValue},` : ""}http`
						configModified = true
					} else {
						if (coreSectionIndex >= 0) {
							const portIndex =
								portLineIndex >= 0
									? portLineIndex
									: commentedPortLineIndex >= 0
										? commentedPortLineIndex
										: -1

							if (portIndex > coreSectionIndex) {
								configContent.splice(portIndex + 1, 0, "extraintf=http")
							} else {
								configContent.splice(coreSectionIndex + 1, 0, "extraintf=http")
							}
							configModified = true
						}
					}
				} else {
					if (extraIntfLineIndex >= 0) {
						const extraIntf = configContent[extraIntfLineIndex] ?? ""
						if (extraIntf.includes("http")) {
							const parts = extraIntf.split("=")
							const interfaces = (parts[1] ?? "")
								.split(",")
								.filter((intf) => intf.trim() !== "http")
							if (interfaces.length > 0) {
								configContent[extraIntfLineIndex] = `${parts[0]}=${interfaces.join(",")}`
							} else {
								configContent[extraIntfLineIndex] = `#${extraIntf}`
							}
							configModified = true
						}
					}
				}
			} catch (error) {
				configContent = [
					"# VLC Configuration File",
					"# Configured by VLC Discord Rich Presence",
					"",
					"[core]",
					`http-port=${config.httpPort}`,
				]

				if (config.httpEnabled) {
					configContent.push("extraintf=http")
				}

				configContent.push("", "[lua]")
				if (config.httpPassword) {
					configContent.push(`http-password=${config.httpPassword}`)
				}

				configModified = true
			}

			if (configModified) {
				await fs.writeFile(this.vlcConfigPath, configContent.join("\n"), "utf-8")
			}

			configService.set("vlc", config)

			logger.info("VLC configuration updated successfully", config)
			return true
		} catch (error) {
			logger.error(`Error configuring VLC: ${error}`)
			return false
		}
	}

	/**
	 * Generate a random password
	 */
	private generateRandomPassword(length: number): string {
		const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
		let result = ""
		const charactersLength = characters.length

		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength))
		}

		return result
	}

	/**
	 * Synchronize the app's VLC configuration with the actual VLC config file
	 * This ensures that changes made outside the app are reflected in the app's config
	 */
	/**
	 * Reconcile the app's stored config with what vlcrc actually says.
	 *
	 * Reads the file directly rather than through getVlcConfig, so a missing
	 * or unreadable vlcrc is reported honestly instead of comparing the app's
	 * stored config to itself and calling that "already in sync".
	 */
	public async synchronizeConfig(): Promise<void> {
		logger.info("Synchronizing VLC configuration at startup")

		const result = await this.readVlcConfigFile()

		if (!result.found) {
			logger.warn(`Could not synchronize VLC configuration: ${result.reason}`)
			return
		}

		const appConfig = configService.get("vlc")
		const isDifferent =
			result.config.httpPort !== appConfig.httpPort ||
			result.config.httpPassword !== appConfig.httpPassword ||
			result.config.httpEnabled !== appConfig.httpEnabled

		if (!isDifferent) {
			logger.info("VLC configuration is already in sync")
			return
		}

		logger.info("VLC configuration has changed, updating app configuration", {
			port: result.config.httpPort,
			enabled: result.config.httpEnabled,
			hasPassword: !!result.config.httpPassword,
		})

		configService.set("vlc", result.config)
		vlcStatusService.updateConnectionInfo()
	}
}
