#!/usr/bin/env python3
"""
VLC Discord Rich Presence Handler
A companion for the VLC Discord RP Lua script
"""

import json
import logging
import os
import sys
import time

import pypresence
from pypresence import ActivityType

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("vlc_discord_rp.log")],
)
logger = logging.getLogger("VLC-Discord-RP")

CLIENT_ID = "1345358480671772683"

LARGE_IMAGE = "logo"
PLAYING_IMAGE = "playing"
PAUSED_IMAGE = "paused"


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and PyInstaller"""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


icon_path = resource_path(os.path.join("assets", "icon.ico"))


class VLCDiscordRP:
    def __init__(self):
        self.rpc = None
        self.status_file = self._find_status_file()
        self.last_status = {}
        self.connected = False
        self.last_file_mod_time = 0
        self.last_check_time = 0
        self.simulated_position = 0
        self.last_position_update = 0

    def _find_status_file(self):
        """Find the status file created by the VLC Lua script"""

        possible_paths = [
            os.path.join(
                os.environ.get("APPDATA", ""), "vlc", "vlc_discord_status.json"
            ),
            os.path.expanduser(
                "~/Library/Application Support/org.videolan.vlc/vlc_discord_status.json"
            ),
            os.path.expanduser("~/.local/share/vlc/vlc_discord_status.json"),
            os.path.expanduser("~/.config/vlc/vlc_discord_status.json"),
            "/tmp/vlc_discord_status.json",
        ]

        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found status file at: {path}")
                return path

        logger.warning("Status file not found. Using default location.")
        return possible_paths[0]

    def connect(self):
        """Connect to Discord"""
        try:
            self.rpc = pypresence.Presence(CLIENT_ID)
            self.rpc.connect()
            self.connected = True
            logger.info("Connected to Discord")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Discord: {e}")
            self.connected = False
            return False

    def read_status(self):
        """Read the status file"""
        try:
            if not os.path.exists(self.status_file):
                return None

            mod_time = os.path.getmtime(self.status_file)
            if mod_time <= self.last_file_mod_time:
                return None

            self.last_file_mod_time = mod_time

            with open(self.status_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in status file")
            return None
        except Exception as e:
            logger.error(f"Error reading status file: {e}")
            return None

    def update_presence(self):
        """Update Discord Rich Presence based on VLC status"""
        status = self.read_status()
        current_time = int(time.time())

        if not status and self.last_status and self.last_status.get("active", False):
            elapsed = current_time - self.last_check_time
            self.last_check_time = current_time

            if self.last_status.get("status") == "playing":

                playback = self.last_status.get("playback", {})
                if playback.get("position") is not None:
                    self.simulated_position = playback.get("position", 0) + elapsed

                    if self.simulated_position > playback.get("duration", 0):
                        self.simulated_position = playback.get("duration", 0)

                    playback["position"] = self.simulated_position
                    playback["remaining"] = max(
                        0, playback.get("duration", 0) - self.simulated_position
                    )
                    self.last_status["playback"] = playback

                    status = self.last_status

        if not status:
            return False

        self.last_check_time = current_time

        if status != self.last_status:
            self.last_status = status

            playback = status.get("playback", {})
            if playback.get("position") is not None:
                self.simulated_position = playback.get("position", 0)
                self.last_position_update = current_time

        if not status.get("active", False) or status.get("status") == "idle":
            if self.connected:
                try:
                    self.rpc.clear()
                    logger.info("Cleared presence (VLC inactive or idle)")
                except Exception as e:
                    logger.error(f"Error clearing presence: {e}")
                    self.connected = False
            return True

        media = status.get("media", {})
        playback = status.get("playback", {})
        current_status = status.get("status", "idle")

        details = media.get("title", "Unknown")
        if len(details) > 128:
            details = details[:125] + "..."

        is_likely_audio = bool(media.get("artist") or media.get("album"))

        activity_type = (
            ActivityType.LISTENING if is_likely_audio else ActivityType.WATCHING
        )

        if media.get("artist"):
            state = f"by {media['artist']}"
            if media.get("album"):
                state += f" • {media['album']}"
        elif media.get("album"):
            state = f"from {media['album']}"

        else:

            if activity_type == ActivityType.WATCHING:
                state = "Now playing" if current_status == "playing" else "Paused"
            else:
                state = "Now playing" if current_status == "playing" else "Paused"
        if len(state) > 128:
            state = state[:125] + "..."

        start_timestamp = None
        end_timestamp = None

        if playback.get("position") is not None and playback.get("duration", 0) > 0:
            position = playback.get("position", 0)
            duration = playback.get("duration", 0)

            if current_status == "playing":

                start_timestamp = current_time - position

                if 0 < duration < 86400:  # Max 24 hours
                    end_timestamp = start_timestamp + duration
            else:

                pass

        try:
            if not self.connected and not self.connect():
                return False

            small_image = PAUSED_IMAGE if current_status == "paused" else None
            small_text = "Paused" if current_status == "paused" else "Playing"

            self.rpc.update(
                details=details,
                state=state,
                large_image=LARGE_IMAGE,
                large_text="VLC Media Player",
                small_image=small_image,
                small_text=small_text,
                start=start_timestamp if current_status == "playing" else None,
                end=end_timestamp if current_status == "playing" else None,
                activity_type=activity_type,
            )

            activity_name = (
                "Listening to"
                if activity_type == ActivityType.LISTENING
                else "Watching"
            )
            logger.info(f"Updated presence: {activity_name} {details} - {state}")
            return True
        except Exception as e:
            logger.error(f"Error updating presence: {e}")
            self.connected = False
            return False

    def run(self):
        """Main loop"""
        logger.info("Starting VLC Discord Rich Presence Handler")
        self.last_check_time = int(time.time())

        while True:
            try:
                self.update_presence()
                time.sleep(1)
            except KeyboardInterrupt:
                logger.info("Exiting due to user interrupt")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                time.sleep(5)

        if self.connected:
            try:
                self.rpc.clear()
                self.rpc.close()
            except Exception as e:
                logger.error(f"Error during cleanup: {e}")

        logger.info("Handler stopped")


if __name__ == "__main__":
    handler = VLCDiscordRP()
    handler.run()
