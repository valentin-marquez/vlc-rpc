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


class MediaState(ABC):
    def __init__(self, discord_client, config):
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
        media = media_info.get("media", {})
        playback = media_info.get("playback", {})
        media_type = media_info.get("media_type", "unknown")

        activity_type = (
            ActivityType.LISTENING if media_type == "audio" else ActivityType.WATCHING
        )

        details = self.format_text(media.get("title", "Unknown"))

        if media.get("artist"):
            state = f"by {media['artist']}"
            if media.get("album"):
                state += f" • {media['album']}"
        elif media.get("album"):
            state = f"from {media['album']}"
        else:
            state = (
                "Now watching"
                if activity_type == ActivityType.WATCHING
                else "Now listening"
            )

        state = self.format_text(state)

        current_time = int(time.time())
        start_timestamp = None
        end_timestamp = None

        if playback.get("position") is not None and playback.get("duration", 0) > 0:
            position = playback.get("position", 0)
            duration = playback.get("duration", 0)

            start_timestamp = current_time - position

            if 0 < duration < 86400:
                end_timestamp = start_timestamp + duration

        small_text = "Playing"
        video_info = media_info.get("video_info", {})
        if (
            media_type == "video"
            and video_info
            and video_info.get("width")
            and video_info.get("height")
        ):
            resolution = f"{video_info.get('width')}x{video_info.get('height')}"
            small_text += f" • {resolution}"

        cover_art_url = None
        if media:
            fetcher = CoverArt()
            cover_art_url = fetcher.fetch(media)

        large_image = cover_art_url if cover_art_url else self.config.LARGE_IMAGE

        success = self.discord_client.update(
            details=details,
            state=state,
            large_image=large_image,
            small_image=self.config.PLAYING_IMAGE,
            small_text=small_text,
            start=start_timestamp,
            end=end_timestamp,
            activity_type=activity_type,
        )

        if success:
            activity_name = (
                "Listening to"
                if activity_type == ActivityType.LISTENING
                else "Watching"
            )
            self.config.logger.info(
                f"Updated presence: {activity_name} {details} - {state}"
            )

        return success


class PausedState(MediaState):
    def update_presence(self, media_info):
        media = media_info.get("media", {})
        media_type = media_info.get("media_type", "unknown")

        activity_type = (
            ActivityType.LISTENING if media_type == "audio" else ActivityType.WATCHING
        )

        details = self.format_text(media.get("title", "Unknown"))

        if media.get("artist"):
            state = f"by {media['artist']}"
            if media.get("album"):
                state += f" • {media['album']}"
        elif media.get("album"):
            state = f"from {media['album']}"
        else:
            state = "Paused"

        state = self.format_text(state)

        small_text = "Paused"
        video_info = media_info.get("video_info", {})
        if (
            media_type == "video"
            and video_info
            and video_info.get("width")
            and video_info.get("height")
        ):
            resolution = f"{video_info.get('width')}x{video_info.get('height')}"
            small_text += f" • {resolution}"

        success = self.discord_client.update(
            details=details,
            state=state,
            small_image=self.config.PAUSED_IMAGE,
            small_text=small_text,
            activity_type=activity_type,
        )

        if success:
            activity_name = (
                "Listening to"
                if activity_type == ActivityType.LISTENING
                else "Watching"
            )
            self.config.logger.info(
                f"Updated presence: {activity_name} {details} - {state}"
            )

        return success
