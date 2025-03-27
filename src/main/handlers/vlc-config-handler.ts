import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { configService } from "@main/services/config"
import { logger } from "@main/services/logger"
import { vlcStatusService } from "@main/services/vlc-status"
import { VLC_CONFIG_PATHS } from "@shared/constants"
import { IpcChannels, IpcEvents, type VlcConfig } from "@shared/types"
import { ipcMain } from "electron"

/**
 * Handler for VLC configuration operations
 */
export class VlcConfigHandler {
	private vlcConfigPath: string | null = null

	constructor() {
		this.determineVlcConfigPath()
		this.registerIpcHandlers()
		// Synchronize VLC config at startup
		this.synchronizeConfig()
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

	/**
	 * Register IPC handlers for VLC config operations
	 */
	private registerIpcHandlers(): void {
		ipcMain.handle(`${IpcChannels.VLC}:${IpcEvents.VLC_CONFIG_GET}`, async () => {
			return await this.getVlcConfig()
		})

		ipcMain.handle(
			`${IpcChannels.VLC}:${IpcEvents.VLC_CONFIG_SET}`,
			async (_, config: VlcConfig) => {
				return await this.setupVlcConfig(config)
			},
		)
	}

	/**
	 * Get the current VLC configuration
	 */
	public async getVlcConfig(): Promise<VlcConfig> {
		if (!this.vlcConfigPath) {
			logger.error("VLC config path not determined")
			return configService.get<VlcConfig>("vlc")
		}

		try {
			// Check if VLC config file exists
			try {
				await fs.access(this.vlcConfigPath)
			} catch (error) {
				logger.warn(`VLC config file not found at: ${this.vlcConfigPath}`)
				logger.warn("Please run VLC at least once to create the config file")
				return configService.get<VlcConfig>("vlc")
			}

			// Read VLC config file
			const content = await fs.readFile(this.vlcConfigPath, "utf-8")
			logger.info(`VLC config file content length: ${content.length} bytes`)

			// Try different patterns to detect settings
			// Here we'll use more patterns to detect HTTP settings, some VLC versions use different formats

			// HTTP password pattern - try multiple formats
			const httpPasswordPatterns = [
				/\[lua\][\s\S]*?(?:#)?http-password\s*=\s*([^\r\n]+)/i,
				/(?:#)?http-password\s*=\s*([^\r\n]+)/i,
				/\[http\][\s\S]*?(?:#)?password\s*=\s*([^\r\n]+)/i,
			]

			let httpPassword: string | null = null
			for (const pattern of httpPasswordPatterns) {
				const match = content.match(pattern)
				if (match) {
					httpPassword = match[1].trim()
					logger.info(
						`Found HTTP password using pattern: ${pattern.toString().substring(0, 30)}...`,
					)
					break
				}
			}

			// HTTP port pattern - try multiple formats
			const httpPortPatterns = [
				/\[core\][\s\S]*?(?:#)?http-port\s*=\s*(\d+)/i,
				/(?:#)?http-port\s*=\s*(\d+)/i,
				/\[http\][\s\S]*?(?:#)?port\s*=\s*(\d+)/i,
			]

			let httpPort = 8080 // Default VLC HTTP port
			for (const pattern of httpPortPatterns) {
				const match = content.match(pattern)
				if (match) {
					httpPort = Number.parseInt(match[1].trim(), 10)
					logger.info(
						`Found HTTP port: ${httpPort} using pattern: ${pattern.toString().substring(0, 30)}...`,
					)
					break
				}
			}

			// HTTP interface enabled patterns - check for multiple indicators
			let httpEnabled = false

			// Check for extraintf
			const extraIntfPattern = /(?:#)?extraintf\s*=\s*([^\r\n]+)/i
			const extraIntfMatch = content.match(extraIntfPattern)
			if (extraIntfMatch && !extraIntfMatch[0].trim().startsWith("#")) {
				const extraIntfValues = extraIntfMatch[1].split(",").map((v) => v.trim())
				if (extraIntfValues.includes("http")) {
					httpEnabled = true
					logger.info("HTTP interface is enabled via extraintf setting")
				}
			}

			// Check for main interface
			const mainIntfPattern = /(?:#)?intf\s*=\s*([^\r\n]+)/i
			const mainIntfMatch = content.match(mainIntfPattern)
			if (mainIntfMatch && !mainIntfMatch[0].trim().startsWith("#")) {
				const mainIntf = mainIntfMatch[1].trim()
				if (mainIntf === "http") {
					httpEnabled = true
					logger.info("HTTP is enabled as main interface")
				}
			}

			// Check for http interface specific settings
			if (content.includes("[http]") && !content.includes("[#http]")) {
				httpEnabled = true
				logger.info("HTTP section present and not commented")
			}

			// If we found a port but no indication that HTTP is enabled,
			// let's assume it's enabled - VLC can be inconsistent in how it stores this setting
			if (!httpEnabled && (httpPort !== 8080 || httpPassword)) {
				httpEnabled = true
				logger.info("Assuming HTTP is enabled based on port/password settings")
			}

			// Create and return final VLC config object
			const vlcConfig: VlcConfig = {
				httpPort,
				httpPassword: httpPassword || configService.get<VlcConfig>("vlc").httpPassword,
				httpEnabled,
			}

			// Update config service with current values
			configService.set("vlc", vlcConfig)

			// Force update connection info in the VLC status service
			vlcStatusService.updateConnectionInfo()

			logger.info("VLC configuration retrieved", {
				port: httpPort,
				enabled: httpEnabled,
				hasPassword: httpPassword !== null,
			})

			return vlcConfig
		} catch (error) {
			logger.error(`Error parsing VLC config: ${error}`)
			return configService.get<VlcConfig>("vlc")
		}
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
			// Create directory if it doesn't exist
			await fs.mkdir(path.dirname(this.vlcConfigPath), { recursive: true })

			// Generate random password if httpEnabled and no password
			if (config.httpEnabled && !config.httpPassword) {
				config.httpPassword = this.generateRandomPassword(12)
				logger.info("Generated random HTTP password for VLC")
			}

			let configContent: string[] = []
			let configModified = false

			// Check if config file exists
			try {
				const content = await fs.readFile(this.vlcConfigPath, "utf-8")
				configContent = content.split("\n")

				// Track sections for proper positioning of settings
				let luaSectionIndex = -1
				let coreSectionIndex = -1
				let portLineIndex = -1
				let commentedPortLineIndex = -1
				let passwordLineIndex = -1
				let commentedPasswordLineIndex = -1
				let extraIntfLineIndex = -1
				let commentedExtraIntfLineIndex = -1

				// Find sections and existing config lines
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

				// Create sections if they don't exist
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

				// Update port in [core] section
				if (portLineIndex >= 0) {
					// Port line exists uncommented, just update it
					configContent[portLineIndex] = `http-port=${config.httpPort}`
					configModified = true
				} else if (commentedPortLineIndex >= 0) {
					// Port line exists but is commented out, uncomment and update it
					configContent[commentedPortLineIndex] = `http-port=${config.httpPort}`
					configModified = true
				} else {
					// Add after [core] section
					if (coreSectionIndex >= 0) {
						configContent.splice(coreSectionIndex + 1, 0, `http-port=${config.httpPort}`)
						configModified = true
					}
				}

				// Update password in [lua] section
				if (config.httpPassword) {
					if (passwordLineIndex >= 0) {
						// Password line exists uncommented, just update it
						configContent[passwordLineIndex] = `http-password=${config.httpPassword}`
						configModified = true
					} else if (commentedPasswordLineIndex >= 0) {
						// Password line exists but is commented out, uncomment and update it
						configContent[commentedPasswordLineIndex] = `http-password=${config.httpPassword}`
						configModified = true
					} else {
						// Add after [lua] section
						if (luaSectionIndex >= 0) {
							configContent.splice(luaSectionIndex + 1, 0, `http-password=${config.httpPassword}`)
							configModified = true
						}
					}
				}

				// Update extraintf in [core] section if HTTP is enabled
				if (config.httpEnabled) {
					if (extraIntfLineIndex >= 0) {
						// extraintf line exists uncommented
						const extraIntf = configContent[extraIntfLineIndex]
						if (!extraIntf.includes("http")) {
							// Add http to existing extraintf value
							const parts = extraIntf.split("=")
							configContent[extraIntfLineIndex] =
								`${parts[0]}=${parts[1] ? `${parts[1]},` : ""}http`
							configModified = true
						}
					} else if (commentedExtraIntfLineIndex >= 0) {
						// extraintf line exists but is commented out, uncomment and add http
						const commentedExtraIntf = configContent[commentedExtraIntfLineIndex]
						const extraIntfValue = commentedExtraIntf.replace(/^#extraintf=/, "")
						configContent[commentedExtraIntfLineIndex] =
							`extraintf=${extraIntfValue ? `${extraIntfValue},` : ""}http`
						configModified = true
					} else {
						// Add after [core] section or http-port line
						if (coreSectionIndex >= 0) {
							// Add after port setting or right after [core]
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
					// If HTTP is disabled but extraintf is set with http, remove http (but leave other interfaces)
					if (extraIntfLineIndex >= 0) {
						const extraIntf = configContent[extraIntfLineIndex]
						if (extraIntf.includes("http")) {
							const parts = extraIntf.split("=")
							const interfaces = parts[1].split(",").filter((intf) => intf.trim() !== "http")
							if (interfaces.length > 0) {
								configContent[extraIntfLineIndex] = `${parts[0]}=${interfaces.join(",")}`
							} else {
								// If no other interfaces, comment out the line
								configContent[extraIntfLineIndex] = `#${extraIntf}`
							}
							configModified = true
						}
					}
				}
			} catch (error) {
				// Create new config if file doesn't exist
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

			// Write config if modified
			if (configModified) {
				await fs.writeFile(this.vlcConfigPath, configContent.join("\n"), "utf-8")
			}

			// Update config service
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
	public async synchronizeConfig(): Promise<void> {
		try {
			logger.info("Synchronizing VLC configuration at startup")

			// Get VLC config from file
			const fileConfig = await this.getVlcConfig()

			// Get current app config
			const appConfig = configService.get<VlcConfig>("vlc")

			// Check if configs are different
			const isDifferent =
				fileConfig.httpPort !== appConfig.httpPort ||
				fileConfig.httpPassword !== appConfig.httpPassword ||
				fileConfig.httpEnabled !== appConfig.httpEnabled

			if (isDifferent) {
				logger.info("VLC configuration has changed, updating app configuration")

				// Update app config with values from file
				configService.set("vlc", fileConfig)

				// Update VLC status service connection info
				vlcStatusService.updateConnectionInfo()

				logger.info("VLC configuration synchronized successfully", {
					port: fileConfig.httpPort,
					enabled: fileConfig.httpEnabled,
					hasPassword: !!fileConfig.httpPassword,
				})
			} else {
				logger.info("VLC configuration is already in sync")
			}
		} catch (error) {
			logger.error(`Error synchronizing VLC configuration: ${error}`)
		}
	}
}
