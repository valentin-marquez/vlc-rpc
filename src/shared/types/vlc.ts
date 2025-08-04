/**
 * Raw VLC status response from the HTTP API
 */
export interface VlcRawStatus {
	state: string
	time?: number
	length?: number
	position?: number
	currentplid?: number
	volume?: number
	random?: boolean
	loop?: boolean
	repeat?: boolean
	version?: string
	apiversion?: number
	fullscreen?: boolean | number
	stats?: {
		inputbitrate?: number
		averagedemuxbitrate?: number
		readpackets?: number
		demuxreadpackets?: number
		lostpictures?: number
		displayedpictures?: number
		demuxreadbytes?: number
		demuxbitrate?: number
		playedabuffers?: number
		demuxdiscontinuity?: number
		decodedaudio?: number
		decodedvideo?: number
		readbytes?: number
		demuxcorrupted?: number
		sentbytes?: number
		sentpackets?: number
		sendbitrate?: number
		averageinputbitrate?: number
		lostabuffers?: number
	}
	information?: {
		chapter?: number
		chapters?: number[]
		title?: number
		titles?: number[]
		category?: Record<string, VlcStreamInfo | VlcMetadata | Record<string, unknown>>
	}
}

/**
 * VLC stream information from category
 */
export interface VlcStreamInfo {
	Type?: string
	Video_resolution?: string
	Codec?: string
	Channels?: string
	Language?: string
	Description?: string
	Bitrate?: string
	Sample_rate?: string
	Bits_per_sample?: string
	Frame_rate?: string
	Buffer_dimensions?: string
	Orientation?: string
	Chroma_location?: string
	Decoded_format?: string
	[key: string]: string | undefined
}

/**
 * VLC metadata information from category.meta
 */
export interface VlcMetadata {
	title?: string
	filename?: string
	artist?: string
	album?: string
	artwork_url?: string
	track_total?: string
	copyright?: string
	publisher?: string
	language?: string
	showName?: string
	seasonNumber?: string
	episodeNumber?: string
	movie_name?: string
	year?: string
	anime_name?: string
	// Campos personalizados para URLs de imágenes subidas
	"X-COVER-URL"?: string
	"X-APP-VERSION"?: string
	"X-PROCESSED-BY"?: string
	"X-EXPIRY-DATE"?: string
	[key: string]: string | undefined
}

/**
 * VLC playlist response from the HTTP API
 */
export interface VlcPlaylistResponse {
	ro: string
	type: string
	name: string
	id: string
	children?: VlcPlaylistItem[]
}

/**
 * VLC playlist item
 */
export interface VlcPlaylistItem {
	ro: string
	type: string
	name: string
	id: string
	duration?: number
	uri?: string
	current?: string
	children?: VlcPlaylistItem[]
}

/**
 * Processed VLC status for our application
 */
export interface VlcStatus {
	active: boolean
	status: string
	timestamp: number
	playback: {
		position: number
		time: number
		duration: number
	}
	mediaType: "video" | "audio"
	media: {
		title?: string
		artist?: string
		album?: string
		artworkUrl?: string
	}
	videoInfo?: {
		width: number
		height: number
	}
}

/**
 * VLC connection check result
 */
export interface VlcConnectionStatus {
	isRunning: boolean
	message: string
}
