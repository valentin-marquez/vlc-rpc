"""
Manages different media states for VLC Discord Rich Presence.
This module defines how different playback states (playing, paused, stopped)
are represented in Discord. It processes media information and updates the Discord
presence accordingly with proper formatting of titles, artists, timestamps,
and cover art.
"""

import time
from abc import ABC, abstractmethod

from pypresence import ActivityType

from audio import CoverArt
from config import Config


class MediaState(ABC):
	def __init__(self, discord_client, config: Config):
		self.discord_client = discord_client
		self.config = config

	@abstractmethod
	def update_presence(self, media_info):
		pass

	def format_text(self, text, max_length=128):
		if len(text) > max_length:
			return text[: max_length - 3] + "..."
		return text


class StoppedState(MediaState):
	def update_presence(self, media_info):
		if self.discord_client.clear():
			self.config.logger.info("Cleared presence (VLC stopped)")
			return True
		return False


class NoStatusState(MediaState):
	def update_presence(self, media_info):
		if self.discord_client.clear():
			self.config.logger.info("Cleared presence (no status data)")
			return True
		return False


class PlayingState(MediaState):
	def update_presence(self, media_info):
		"""Update Discord presence with detailed media info based on content type"""
		if not media_info:
			return False

		current_time = int(time.time())
		media = media_info.get("media", {})
		media_type = media_info.get("media_type", "unknown")
		content_type = media_info.get("content_type", "")
		content_metadata = media_info.get("content_metadata", {})

		activity_type = ActivityType.LISTENING if media_type == "audio" else ActivityType.WATCHING

		if content_type == "tv_show" and content_metadata.get("show_name"):
			show_name = content_metadata["show_name"]
			season = content_metadata.get("season", 0)
			episode = content_metadata.get("episode", 0)

			if season > 0 and episode > 0:
				details = f"{show_name} S{season:02d}E{episode:02d}"
			else:
				details = show_name

			state = "Now watching"

		elif content_type == "movie" and content_metadata.get("movie_name"):
			movie_name = content_metadata["movie_name"]
			year = content_metadata.get("year", "")

			if year:
				details = f"{movie_name} ({year})"
			else:
				details = movie_name

			state = "Now watching"

		elif content_type == "anime" and content_metadata.get("anime_name"):
			anime_name = content_metadata["anime_name"]
			episode = content_metadata.get("episode", 0)

			if episode > 0:
				details = f"{anime_name} - Episode {episode}"
			else:
				details = anime_name

			state = "Now watching anime"

		else:
			details = media.get("title", "Unknown")

			if media_type == "audio":
				state = f"by {media.get('artist', 'Unknown Artist')}"
			else:
				state = "Now watching"

		details = self.format_text(details)
		state = self.format_text(state)

		start_timestamp = None
		end_timestamp = None

		playback = media_info.get("playback", {})

		if playback:
			current_time = int(time.time())
			duration = playback.get("duration", 0)
			position = playback.get("time", 0)

			if position >= 0 and duration > 0 and duration < 86400:
				start_timestamp = current_time - position
				end_timestamp = current_time + (duration - position)
			else:
				start_timestamp = current_time
				end_timestamp = None

		small_text = self.config.PLAYING_IMAGE
		large_image = self.config.LARGE_IMAGE
		large_text = "VLC Media Player"

		content_image = media_info.get("content_image_url")
		if content_image:
			large_image = content_image

		if content_type == "tv_show":
			large_text = "Watching TV Show"
		elif content_type == "movie":
			large_text = "Watching a Movie"
		elif content_type == "anime":
			large_text = "Watching Anime"

		video_info = media_info.get("video_info", {})
		if media_type == "video" and video_info and video_info.get("width") and video_info.get("height"):
			resolution = f"{video_info.get('width')}x{video_info.get('height')}"
			small_text += f" • {resolution}"

		if not content_image and media:
			fetcher = CoverArt()
			cover_art_url = fetcher.fetch(media)
			if cover_art_url:
				large_image = cover_art_url

		success = self.discord_client.update(
			details=details,
			state=state,
			large_image=large_image,
			large_text=large_text,
			small_image=self.config.PLAYING_IMAGE,
			small_text=small_text,
			start=start_timestamp,
			end=end_timestamp,
			activity_type=activity_type,
		)

		if success:
			activity_name = "Watching" if media_type == "video" else "Listening to"
			self.config.logger.info(f"Updated presence: {activity_name} {details} - {state}")

		return success


class PausedState(MediaState):
	def update_presence(self, media_info):
		"""Update Discord presence for paused media with enhanced content info"""
		if not media_info:
			return False

		media = media_info.get("media", {})
		media_type = media_info.get("media_type", "unknown")
		content_type = media_info.get("content_type", "")
		content_metadata = media_info.get("content_metadata", {})

		activity_type = ActivityType.LISTENING if media_type == "audio" else ActivityType.WATCHING

		if content_type == "tv_show" and content_metadata.get("show_name"):
			show_name = content_metadata["show_name"]
			season = content_metadata.get("season", 0)
			episode = content_metadata.get("episode", 0)

			if season > 0 and episode > 0:
				details = f"{show_name} S{season:02d}E{episode:02d}"
			else:
				details = show_name

			state = "Paused"

		elif content_type == "movie" and content_metadata.get("movie_name"):
			movie_name = content_metadata["movie_name"]
			year = content_metadata.get("year", "")

			if year:
				details = f"{movie_name} ({year})"
			else:
				details = movie_name

			state = "Paused"

		elif content_type == "anime" and content_metadata.get("anime_name"):
			anime_name = content_metadata["anime_name"]
			episode = content_metadata.get("episode", 0)

			if episode > 0:
				details = f"{anime_name} - Episode {episode}"
			else:
				details = anime_name

			state = "Paused"

		else:
			details = media.get("title", "Unknown")

			if media_type == "audio":
				state = f"by {media.get('artist', 'Unknown Artist')}"
			else:
				state = "Paused"

		details = self.format_text(details)
		state = self.format_text(state)

		small_text = "Paused"
		large_image = self.config.LARGE_IMAGE
		large_text = "VLC Media Player (Paused)"

		content_image = media_info.get("content_image_url")
		if content_image:
			large_image = content_image

		video_info = media_info.get("video_info", {})
		if media_type == "video" and video_info and video_info.get("width") and video_info.get("height"):
			resolution = f"{video_info.get('width')}x{video_info.get('height')}"
			small_text += f" • {resolution}"

		if not content_image and media:
			fetcher = CoverArt()
			cover_art_url = fetcher.fetch(media)
			if cover_art_url:
				large_image = cover_art_url

		success = self.discord_client.update(
			details=details,
			state=state,
			large_image=large_image,
			large_text=large_text,
			small_image=self.config.PAUSED_IMAGE,
			small_text=small_text,
			activity_type=activity_type,
		)

		if success:
			activity_name = "Watching" if media_type == "video" else "Listening to"
			self.config.logger.info(f"Updated presence: {activity_name} {details} - {state}")

		return success
