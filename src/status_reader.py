"""
StatusReader module handles the reading and processing of VLC media status.
It connects to VLC's HTTP interface to fetch real-time playback information,
parses the JSON response, and converts it to a format compatible with the application.
"""

import base64
import hashlib
import json
import time
from urllib.parse import urljoin

import requests

from config import Config


class StatusReader:
    def __init__(self):
        self.config = Config()
        self.last_status = {}
        self.last_status_hash = ""
        self.base_url = f"http://localhost:{self.config.HTTP_PORT}/requests/"
        self.auth_header = self._create_auth_header()

    def _create_auth_header(self):
        """Create the HTTP Basic Auth header for VLC"""
        if not self.config.HTTP_PASSWORD:
            return {}

        auth_string = f":{self.config.HTTP_PASSWORD}"
        auth_bytes = auth_string.encode("ascii")
        base64_bytes = base64.b64encode(auth_bytes)
        base64_auth = base64_bytes.decode("ascii")

        return {"Authorization": f"Basic {base64_auth}"}

    def read_status(self, force_update=False):
        """
        Read VLC status through HTTP interface

        Args:
            force_update: Whether to force an update even if hash hasn't changed

        Returns:
            dict: Parsed status information or None if unavailable
        """
        if not self.config.HTTP_ENABLED:
            self.config.logger.warning("VLC HTTP interface is not enabled")
            return None

        try:
            # Make the HTTP request
            status_url = urljoin(self.base_url, "status.json")
            response = requests.get(
                status_url,
                headers=self.auth_header,
                timeout=2,
            )

            if response.status_code != 200:
                if response.status_code == 404:
                    self.config.logger.debug(
                        "VLC is not running or HTTP interface is misconfigured"
                    )
                elif response.status_code == 401:
                    self.config.logger.error(
                        "Authentication failed. Check your HTTP password."
                    )
                else:
                    self.config.logger.error(
                        f"Failed to get VLC status: HTTP {response.status_code}"
                    )
                return None

            content = response.content.decode("utf-8", errors="replace")
            content_hash = hashlib.md5(content.encode()).hexdigest()

            # Skip processing if content hasn't changed
            if content_hash == self.last_status_hash and not force_update:
                return self.last_status

            self.last_status_hash = content_hash
            vlc_status = json.loads(content)

            # Convert VLC HTTP API format to our internal format
            status = self._convert_vlc_status(vlc_status)
            self.last_status = status
            return status

        except requests.exceptions.ConnectionError:
            self.config.logger.debug(
                "VLC is not running or HTTP interface is not accessible"
            )
            return None
        except requests.exceptions.Timeout:
            self.config.logger.debug("Connection to VLC timed out")
            return None
        except json.JSONDecodeError:
            self.config.logger.error("Invalid JSON in VLC response")
            return None
        except Exception as e:
            self.config.logger.error(f"Error reading VLC status: {e}")
            return None

    def _convert_vlc_status(self, vlc_status):
        """Convert VLC HTTP API status format to our internal format"""
        state = vlc_status.get("state", "stopped")

        # Get reliable playback values
        time_value = int(vlc_status.get("time", 0))
        length_value = int(vlc_status.get("length", 0))
        position_value = vlc_status.get("position", 0)

        media_info = {
            "active": state != "stopped",
            "status": state,
            "timestamp": int(time.time()),
            "playback": {
                "position": position_value,
                "time": time_value,
                "duration": length_value,
            },
            "media": {},
        }

        # Set media type based on available streams
        information = vlc_status.get("information", {})
        category = information.get("category", {})

        if any(
            stream.get("Type") == "Video"
            for stream_name, stream in category.items()
            if stream_name != "meta"
        ):
            media_info["media_type"] = "video"
        else:
            media_info["media_type"] = "audio"

        # Get metadata
        meta = category.get("meta", {})
        if meta:
            media_info["media"]["title"] = meta.get(
                "title", meta.get("filename", "Unknown")
            )
            media_info["media"]["artist"] = meta.get("artist", "")
            media_info["media"]["album"] = meta.get("album", "")

            # Store artwork URL if available
            artwork_url = meta.get("artwork_url", "")
            if artwork_url:
                media_info["media"]["artwork_url"] = artwork_url

        # Get video information if available
        for stream_name, stream in category.items():
            if stream_name != "meta" and stream.get("Type") == "Video":
                resolution = stream.get("Video_resolution", "")
                if resolution:
                    media_info["video_info"] = {
                        "width": (
                            int(resolution.split("x")[0]) if "x" in resolution else 0
                        ),
                        "height": (
                            int(resolution.split("x")[1]) if "x" in resolution else 0
                        ),
                    }
                break

        return media_info

    def check_vlc_status(self):
        """
        Check VLC status and return diagnostic information

        Returns:
            tuple: (is_running, message)
        """
        if not self.config.HTTP_ENABLED:
            return False, "VLC HTTP interface is not enabled in configuration"

        try:
            status_url = urljoin(self.base_url, "status.json")
            response = requests.get(status_url, headers=self.auth_header, timeout=2)

            if response.status_code == 200:
                return True, "VLC is running and HTTP interface is accessible"
            elif response.status_code == 401:
                return (
                    False,
                    "VLC is running but authentication failed (incorrect password)",
                )
            elif response.status_code == 404:
                return (
                    False,
                    "VLC is running but the HTTP interface is not properly configured",
                )
            else:
                return (
                    False,
                    f"VLC returned unexpected status code: {response.status_code}",
                )

        except requests.exceptions.ConnectionError:
            return False, "VLC is not running or HTTP interface is not enabled"
        except requests.exceptions.Timeout:
            return False, "Connection to VLC timed out"
        except Exception as e:
            return False, f"Error checking VLC status: {str(e)}"


if __name__ == "__main__":
    reader = StatusReader()
    status = reader.read_status()
    print(status)
