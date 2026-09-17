import { type ClassValue, clsx } from "clsx"
import logger from "electron-winston/renderer"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

export { logger }
