export interface VlcRawStatus {
	state: string
	time?: number
	length?: number
	position?: number
	currentplid?: number
	rate?: number
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

/** One entry of `information.category`, whose keys VLC translates to its own language. */
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

/** The tags VLC read out of the file, under `information.category.meta`. */
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
	// Custom fields naming a cover this app uploaded, written back into the file.
	"X-COVER-URL"?: string
	"X-APP-VERSION"?: string
	"X-PROCESSED-BY"?: string
	"X-EXPIRY-DATE"?: string
	[key: string]: string | undefined
}

export interface VlcPlaylistResponse {
	ro: string
	type: string
	name: string
	id: string
	children?: VlcPlaylistItem[]
}

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
