""""
StatusReader module handles the reading and processing of VLC media status.
It checks for changes in the status file created by the VLC Lua script,
tracks modifications using hash comparison to avoid redundant updates,
and determines if the status information is stale based on timestamps.
"""

import hashlib
import json
import os
import time

from config import Config


class StatusReader:
    def __init__(self):
        self.config = Config()
        self.status_file = self.config.STATUS_FILE_PATH
        self.last_status = {}
        self.last_status_hash = ""
        self.last_content = ""

    def read_status(self, force_update=False):
        try:
            if not os.path.exists(self.status_file):
                return None

            with open(self.status_file, "r", encoding="utf-8") as f:
                content = f.read()

            content_hash = hashlib.md5(content.encode()).hexdigest()
            if content_hash == self.last_status_hash and not force_update:
                return self.last_status

            status = json.loads(content)
            self.last_content = content
            self.last_status_hash = content_hash

            status_timestamp = status.get("timestamp", 0)
            current_time = int(time.time())

            if current_time - status_timestamp > self.config.STATUS_TIMEOUT:
                self.config.logger.debug(
                    f"Status is stale (from {status_timestamp}, now {current_time})"
                )

            self.last_status = status
            return status
        except json.JSONDecodeError:
            self.config.logger.error("Invalid JSON in status file")
            return None
        except Exception as e:
            self.config.logger.error(f"Error reading status file: {e}")
            return None
