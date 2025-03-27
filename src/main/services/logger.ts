import { Logger as ElectronWinston } from "electron-winston/main"

/**
 * Logger service for the application
 */
class LoggerService {
	private static instance: LoggerService | null = null
	private logger: ElectronWinston

	private constructor() {
		this.logger = new ElectronWinston({
			fileLogLevel: "info",
			consoleLogLevel: "info",
			handleExceptions: true,
			handleRejections: true,
		})

		this.logger.registerRendererListener()
	}

	public static getInstance(): LoggerService {
		if (!LoggerService.instance) {
			LoggerService.instance = new LoggerService()
		}
		return LoggerService.instance
	}

	public error(message: string, ...args: unknown[]): void {
		this.logger.error(`${message} ${args.length ? JSON.stringify(args) : ""}`)
	}

	public warn(message: string, ...args: unknown[]): void {
		this.logger.warn(`${message} ${args.length ? JSON.stringify(args) : ""}`)
	}

	public info(message: string, ...args: unknown[]): void {
		this.logger.info(`${message} ${args.length ? JSON.stringify(args) : ""}`)
	}
}

export const logger = LoggerService.getInstance()
