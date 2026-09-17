/**
 * Renders the NSIS installer bitmaps from the app's own icon and palette, so the
 * setup a person runs looks like the app they just downloaded.
 *
 * NSIS reads BMP and nothing else, at two exact sizes, so the art is composed in
 * an offscreen page and written out as 24 bit BI_RGB. The BMPs are committed:
 * packaging must not depend on this script having been run.
 *
 * Run with `bun run generate:installer-art`, which runs it under Electron for
 * nativeImage.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserWindow, app, nativeImage } from "electron"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Mirrors the tokens in src/renderer/src/styles/globals.css. */
const SURFACE_INSET = "234 14% 12%"
const TEXT_STRONG = "228 14% 96%"
const TEXT_FAINT = "228 7% 50%"

/** The header bitmap sits inside a strip NSIS paints white and titles in black. */
const HEADER_BACKGROUND = "#ffffff"

/** Composing above the target size and downsampling is what antialiases the text. */
const SUPERSAMPLE = 3

// Forcing the scale factor instead of sizing the window up keeps the output
// identical on a scaled display, where the window would be measured in the
// screen's units and clipped to fit it.
app.commandLine.appendSwitch("force-device-scale-factor", String(SUPERSAMPLE))

const OUTPUTS = [
	{ file: "installerSidebar.bmp", width: 164, height: 314, page: sidebar },
	{ file: "installerHeader.bmp", width: 150, height: 57, page: header },
]

function head(width, height, font, body) {
	return `<!doctype html>
<meta charset="utf-8">
<style>
@font-face {
	font-family: "Inter";
	font-weight: 100 900;
	src: url(data:font/woff2;base64,${font}) format("woff2");
}
* { margin: 0; padding: 0; box-sizing: border-box }
html, body { width: ${width}px; height: ${height}px; overflow: hidden }
body {
	font-family: "Inter", sans-serif;
	font-optical-sizing: auto;
	-webkit-font-smoothing: antialiased;
}
img { display: block }
${body}
</style>`
}

function sidebar(width, height, font, cone) {
	return `${head(
		width,
		height,
		font,
		`body {
	background: hsl(${SURFACE_INSET});
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}
.name {
	margin-top: 22px;
	font-size: 15px;
	font-weight: 600;
	letter-spacing: -0.01em;
	color: hsl(${TEXT_STRONG});
}
.tag {
	margin-top: 7px;
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: hsl(${TEXT_FAINT});
}`,
	)}
<img src="${cone}" width="76" height="76" alt="">
<p class="name">VLC Discord RP</p>
<p class="tag">Rich Presence</p>`
}

function header(width, height, font, cone) {
	return `${head(
		width,
		height,
		font,
		`body {
	background: ${HEADER_BACKGROUND};
	display: flex;
	align-items: center;
	justify-content: flex-end;
	padding-right: 14px;
}
/* The cone's bands are white, so on the white strip it needs the app's own
   surface behind it or it breaks into four disconnected shapes. */
.tile {
	width: 40px;
	height: 40px;
	border-radius: 10px;
	background: hsl(${SURFACE_INSET});
	display: flex;
	align-items: center;
	justify-content: center;
}`,
	)}
<div class="tile"><img src="${cone}" width="32" height="32" alt=""></div>`
}

/** 24 bit BI_RGB, rows bottom up and padded to a multiple of four, as NSIS expects. */
function encodeBmp(bgra, width, height) {
	const stride = (width * 3 + 3) & ~3
	const pixels = stride * height
	const bmp = Buffer.alloc(54 + pixels)

	bmp.write("BM", 0, "ascii")
	bmp.writeUInt32LE(bmp.length, 2)
	bmp.writeUInt32LE(54, 10)
	bmp.writeUInt32LE(40, 14)
	bmp.writeInt32LE(width, 18)
	bmp.writeInt32LE(height, 22)
	bmp.writeUInt16LE(1, 26)
	bmp.writeUInt16LE(24, 28)
	bmp.writeUInt32LE(pixels, 34)

	for (let y = 0; y < height; y++) {
		let out = 54 + (height - 1 - y) * stride
		let src = y * width * 4
		for (let x = 0; x < width; x++) {
			bmp[out++] = bgra[src]
			bmp[out++] = bgra[src + 1]
			bmp[out++] = bgra[src + 2]
			src += 4
		}
	}
	return bmp
}

async function paint(html, width, height) {
	const work = await mkdtemp(join(tmpdir(), "installer-art-"))
	const page = join(work, "page.html")
	await writeFile(page, html, "utf8")

	const win = new BrowserWindow({
		width,
		height,
		useContentSize: true,
		frame: false,
		show: false,
		webPreferences: { offscreen: true },
	})

	try {
		await win.loadFile(page)
		// Capturing before the web font lands catches the page mid swap, with the
		// text laid out and invisible. Two frames after it settles, it is drawn.
		await win.webContents.executeJavaScript(`Promise.all([
			document.fonts.ready,
			...[...document.images].map((image) => image.decode()),
		]).then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))`)

		return await win.webContents.capturePage()
	} finally {
		win.destroy()
		await rm(work, { recursive: true, force: true })
	}
}

async function main() {
	const font = await readFile(
		join(ROOT, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
	)
	// The 256 source downsamples; the 128 would be upscaled at three times size.
	const icon = await readFile(join(ROOT, "resources/icons/256x256.png"))
	const cone = `data:image/png;base64,${icon.toString("base64")}`
	const encodedFont = font.toString("base64")

	for (const { file, width, height, page } of OUTPUTS) {
		const frame = await paint(page(width, height, encodedFont, cone), width, height)

		// Round tripping through PNG drops the capture's scale factor, without which
		// resize would read the target as screen units and hand back a larger bitmap.
		const flat = nativeImage.createFromBuffer(frame.toPNG())
		const bgra = flat.resize({ width, height, quality: "best" }).getBitmap()
		if (bgra.length !== width * height * 4) {
			throw new Error(`${file}: captured ${bgra.length} bytes for a ${width}x${height} frame`)
		}

		const out = join(ROOT, "build", file)
		await writeFile(out, encodeBmp(bgra, width, height))
		console.log(`installer art: wrote build/${file} (${width}x${height})`)
	}
}

// Destroying the first window would otherwise quit the app, mid render, with the
// default window-all-closed handler.
app.on("window-all-closed", () => {})

app.whenReady().then(() =>
	main()
		.catch((error) => {
			console.error(error.message)
			process.exitCode = 1
		})
		.finally(() => app.quit()),
)
