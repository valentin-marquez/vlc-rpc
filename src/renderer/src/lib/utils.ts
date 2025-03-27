import { type ClassValue, clsx } from "clsx"
import logger from "electron-winston/renderer"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class values into a single className string.
 * Uses clsx for conditional classes and tailwind-merge for proper Tailwind CSS class merging.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

export { logger }
