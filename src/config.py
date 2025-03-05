import logging
import os
import sys


class Config:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Config, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        # Discord settings
        self.CLIENT_ID = "1345358480671772683"
        self.LARGE_IMAGE = "logo"
        self.PAUSED_IMAGE = "paused"
        self.PLAYING_IMAGE = "playing"

        # Update intervals
        self.PRESENCE_UPDATE_INTERVAL = 15
        self.FAST_CHECK_INTERVAL = 1
        self.STATUS_TIMEOUT = 5

        # Logging
        self.setup_logging()

        # Paths
        self.find_status_file()

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler("vlc_discord_rp.log"),
            ],
        )
        self.logger = logging.getLogger("VLC-Discord-RP")

    def find_status_file(self):
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
                self.logger.info(f"Found status file at: {path}")
                self.STATUS_FILE_PATH = path
                return

        self.logger.warning("Status file not found. Using default location.")
        self.STATUS_FILE_PATH = possible_paths[0]

    def resource_path(self, relative_path):
        """Get absolute path to resource, works for dev and PyInstaller"""
        base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_path, relative_path)
