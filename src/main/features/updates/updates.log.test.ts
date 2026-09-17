import { describe, expect, it } from "vitest"
import { createUpdaterLogger, describeError, redactUrls } from "./updates.log"

describe("describeError", () => {
	it("keeps the name and drops everything else", () => {
		const error = new Error("connect ETIMEDOUT https://github.com/owner/repo/latest.yml")

		expect(describeError(error)).toEqual({ name: "Error" })
	})

	it("keeps the code electron-updater tags its errors with", () => {
		const error = Object.assign(new Error("boom"), { code: "ERR_UPDATER_INVALID_UPDATE_INFO" })

		expect(describeError(error)).toEqual({
			name: "Error",
			code: "ERR_UPDATER_INVALID_UPDATE_INFO",
		})
	})

	it("survives something that is not an error at all", () => {
		expect(describeError("nope")).toEqual({ name: "unknown" })
		expect(describeError(undefined)).toEqual({ name: "unknown" })
	})

	it("never carries a field holding a url", () => {
		const error = Object.assign(new TypeError("bad"), {
			url: "https://github.com/owner/repo/releases/download/v5.0.0/app-setup.exe",
			description: "<html>404</html>",
		})

		expect(JSON.stringify(describeError(error))).not.toContain("github.com")
		expect(describeError(error).name).toBe("TypeError")
	})
})

describe("redactUrls", () => {
	it("keeps the host and drops the path", () => {
		expect(
			redactUrls(
				"Downloading update from https://github.com/owner/repo/releases/download/v5.0.0/app-setup.exe",
			),
		).toBe("Downloading update from https://github.com/[redacted]")
	})

	it("drops a query string, which is where a credential would sit", () => {
		expect(redactUrls("GET http://127.0.0.1:8080/requests/status.json?password=hunter2")).toBe(
			"GET http://127.0.0.1:8080/[redacted]",
		)
	})

	it("drops credentials written into the url itself", () => {
		const redacted = redactUrls("fetching https://user:hunter2@example.com/feed")

		expect(redacted).not.toContain("hunter2")
		expect(redacted).toBe("fetching https://example.com/[redacted]")
	})

	it("redacts every url in one line", () => {
		expect(redactUrls('old: "https://a.test/one.blockmap", new: https://b.test/two.blockmap')).toBe(
			'old: "https://a.test/[redacted]", new: https://b.test/[redacted]',
		)
	})

	it("leaves a line with no url alone", () => {
		expect(redactUrls("Checking for update")).toBe("Checking for update")
	})
})

describe("createUpdaterLogger", () => {
	it("redacts what electron-updater writes to our log", () => {
		const lines: string[] = []
		const log = createUpdaterLogger({
			info: (message) => lines.push(`info ${message}`),
			warn: (message) => lines.push(`warn ${message}`),
			error: (message) => lines.push(`error ${message}`),
		})

		log.info("Found version 5.0.0 (url: https://github.com/owner/repo/app-setup.exe)")
		log.warn("Cannot parse blockmap https://github.com/owner/repo/app.blockmap")

		expect(lines).toEqual([
			"info [updater] Found version 5.0.0 (url: https://github.com/[redacted])",
			"warn [updater] Cannot parse blockmap https://github.com/[redacted]",
		])
	})

	it("reduces an error it is handed to its name", () => {
		const lines: string[] = []
		const log = createUpdaterLogger({
			info: () => {},
			warn: () => {},
			error: (message) => lines.push(message),
		})

		log.error(new Error("connect ECONNREFUSED https://github.com/owner/repo/latest.yml"))

		expect(lines).toEqual(['[updater] {"name":"Error"}'])
	})

	it("says nothing when electron-updater logs nothing", () => {
		const lines: string[] = []
		const log = createUpdaterLogger({
			info: (message) => lines.push(message),
			warn: () => {},
			error: () => {},
		})

		log.info()

		expect(lines).toEqual([])
	})
})
