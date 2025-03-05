from pypresence import ActivityType, Presence

from config import Config


class DiscordRPCClient:
    def __init__(self):
        self.config = Config()
        self.client_id = self.config.CLIENT_ID
        self.rpc = None
        self.connected = False

    def connect(self):
        """Connect to Discord RPC"""
        try:
            self.rpc = Presence(self.client_id)
            self.rpc.connect()
            self.connected = True
            self.config.logger.info("Connected to Discord")
            return True
        except Exception as e:
            self.config.logger.error(f"Failed to connect to Discord: {e}")
            self.connected = False
            return False

    def update(
        self,
        details,
        state,
        large_image=None,
        large_text=None,
        small_image=None,
        small_text=None,
        start=None,
        end=None,
        activity_type=ActivityType.PLAYING,
    ):
        """Update Discord Rich Presence"""
        if not self.connected and not self.connect():
            return False

        try:
            self.rpc.update(
                details=details,
                state=state,
                large_image=large_image or self.config.LARGE_IMAGE,
                large_text=large_text or "VLC Media Player",
                small_image=small_image,
                small_text=small_text,
                start=start,
                end=end,
                activity_type=activity_type,
            )
            return True
        except Exception as e:
            self.config.logger.error(f"Error updating presence: {e}")
            self.connected = False
            return False

    def clear(self):
        """Clear Discord Rich Presence"""
        if not self.connected:
            return False

        try:
            self.rpc.clear()
            return True
        except Exception as e:
            self.config.logger.error(f"Error clearing presence: {e}")
            self.connected = False
            return False

    def close(self):
        """Close the connection to Discord"""
        if self.connected:
            try:
                self.rpc.close()
                self.connected = False
            except Exception as e:
                self.config.logger.error(f"Error closing Discord connection: {e}")
