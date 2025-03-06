import logging
import os
import platform
import re
import sys
from pathlib import Path


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
        self.PRESENCE_UPDATE_INTERVAL = 1
        self.FAST_CHECK_INTERVAL = 1
        self.STATUS_TIMEOUT = 5

        # VLC HTTP Interface defaults
        self.HTTP_PORT = 9080  # New default port related to Discord RP
        self.HTTP_PASSWORD = ""
        self.HTTP_ENABLED = False

        # Logging
        self.setup_logging()

        # Parse VLC config
        self.parse_vlc_config()

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

    def get_vlc_config_path(self):
        """Get the VLC config file path based on OS"""
        system = platform.system()

        if system == "Windows":
            return os.path.join(os.environ.get("APPDATA", ""), "vlc", "vlcrc")
        elif system == "Darwin":  # macOS
            return os.path.join(
                Path.home(), "Library", "Preferences", "org.videolan.vlc", "vlcrc"
            )
        elif system == "Linux":
            return os.path.join(Path.home(), ".config", "vlc", "vlcrc")
        else:
            self.logger.warning(f"Unsupported operating system: {system}")
            return None

    def parse_vlc_config(self):
        vlcrc_path = self.get_vlc_config_path()

        if not vlcrc_path:
            self.logger.error("Could not determine VLC config path for this OS")
            return

        if not os.path.exists(vlcrc_path):
            self.logger.warning(f"VLC config file not found at: {vlcrc_path}")
            self.logger.warning(
                "Please run VLC at least once to create the config file"
            )
            return

        self.logger.info(f"Found VLC config file at: {vlcrc_path}")

        try:
            with open(vlcrc_path, "r", encoding="utf-8") as f:
                config_content = f.read()

            # Extract HTTP password
            password_match = re.search(r"http-password=(.+)", config_content)
            if password_match:
                self.HTTP_PASSWORD = password_match.group(1).strip()

            # Extract HTTP port
            port_match = re.search(r"^http-port=(\d+)", config_content, re.MULTILINE)
            if port_match:
                self.HTTP_PORT = int(port_match.group(1).strip())

            # Check if HTTP interface is enabled
            extraintf_match = re.search(r"extraintf=(.+)", config_content)
            if extraintf_match and "http" in extraintf_match.group(1):
                self.HTTP_ENABLED = True

            self.logger.info(f"VLC HTTP interface enabled: {self.HTTP_ENABLED}")
            self.logger.info(f"VLC HTTP port: {self.HTTP_PORT}")

        except Exception as e:
            self.logger.error(f"Error parsing VLC config: {str(e)}")

    def setup_vlc_config(self, port=None, enable_http=True, password=None):
        """
        Configure VLC for Discord Rich Presence

        Args:
            port: HTTP port to set (defaults to self.HTTP_PORT if None)
            enable_http: Whether to enable HTTP interface
            password: HTTP password to set (generates random if None)

        Returns:
            bool: True if successful, False otherwise

        Raises:
            FileNotFoundError: When VLC config file doesn't exist and can't be created
        """
        vlcrc_path = self.get_vlc_config_path()

        if not vlcrc_path:
            self.logger.error("Could not determine VLC config path")
            raise FileNotFoundError("Could not determine VLC config path for this OS")

        # Create directory if it doesn't exist
        try:
            os.makedirs(os.path.dirname(vlcrc_path), exist_ok=True)
        except Exception as e:
            self.logger.error(f"Failed to create directory for VLC config: {str(e)}")
            raise FileNotFoundError(
                f"Failed to create VLC configuration directory: {str(e)}"
            )

        # Set default port if not provided
        port_to_set = port if port is not None else self.HTTP_PORT

        # Generate random password if not provided
        if password is None and enable_http:
            import random
            import string

            # Generate a random 12 character password
            password = "".join(
                random.choices(string.ascii_letters + string.digits, k=12)
            )
            self.logger.info("Generated random HTTP password for VLC")

        try:
            # If file exists, modify it
            if os.path.exists(vlcrc_path):
                with open(vlcrc_path, "r", encoding="utf-8") as f:
                    config_lines = f.readlines()

                # Find the HTTP port line
                port_line_index = -1
                port_section_found = False
                password_line_index = -1
                password_section_found = False
                extraintf_line_index = -1

                for i, line in enumerate(config_lines):
                    # Find the HTTP port line
                    if re.match(r"^http-port=", line):
                        port_line_index = i
                        port_section_found = True

                    # Find the HTTP password line or its commented version
                    if re.match(r"^#?http-password=", line):
                        password_line_index = i
                        password_section_found = True

                    # Find extraintf line
                    if re.match(r"^extraintf=", line):
                        extraintf_line_index = i

                # Update HTTP port
                if port_section_found:
                    config_lines[port_line_index] = f"http-port={port_to_set}\n"
                else:
                    # Try to find where to add the port (look for related HTTP settings)
                    found_position = False
                    for i, line in enumerate(config_lines):
                        if "http-" in line:
                            config_lines.insert(i + 1, f"http-port={port_to_set}\n")
                            found_position = True
                            break

                    if not found_position:
                        # Add at the end if no related section found
                        config_lines.append(f"http-port={port_to_set}\n")

                # Update HTTP password
                if password and password_section_found:
                    config_lines[password_line_index] = f"http-password={password}\n"
                elif password:
                    # Try to find where to add the password (look for http-port or related settings)
                    found_position = False
                    for i, line in enumerate(config_lines):
                        if "http-port" in line:
                            config_lines.insert(i + 1, f"http-password={password}\n")
                            found_position = True
                            break

                    if not found_position:
                        # Add it near other HTTP settings if possible
                        for i, line in enumerate(config_lines):
                            if "http-" in line:
                                config_lines.insert(
                                    i + 1, f"http-password={password}\n"
                                )
                                found_position = True
                                break

                        if not found_position:
                            # Add at the end if no related section found
                            config_lines.append(f"http-password={password}\n")

                # Update extraintf for HTTP
                if enable_http:
                    if extraintf_line_index >= 0:
                        current_extraintf = config_lines[extraintf_line_index].strip()
                        if "http" not in current_extraintf:
                            # Add http to existing extraintf line
                            extraintf_value = current_extraintf.split("=")[1]
                            new_extraintf = f"extraintf={extraintf_value},http\n"
                            config_lines[extraintf_line_index] = new_extraintf
                    else:
                        # Add new extraintf line
                        config_lines.append("extraintf=http\n")

                # Write back to file
                with open(vlcrc_path, "w", encoding="utf-8") as f:
                    f.writelines(config_lines)

            else:
                # Create new config with minimal but properly formatted settings
                config_content = "[main]\n"
                config_content += f"http-port={port_to_set}\n"
                if enable_http:
                    config_content += "extraintf=http\n"
                    if password:
                        config_content += f"http-password={password}\n"

                # Write new file
                with open(vlcrc_path, "w", encoding="utf-8") as f:
                    f.write(config_content)

            self.HTTP_PORT = port_to_set
            self.HTTP_ENABLED = enable_http
            self.HTTP_PASSWORD = password if password else self.HTTP_PASSWORD

            self.logger.info(
                f"Successfully configured VLC with HTTP port {port_to_set}"
            )
            self.logger.info(f"HTTP interface enabled: {enable_http}")
            if password:
                self.logger.info("HTTP password configured")

            return True

        except Exception as e:
            self.logger.error(f"Error configuring VLC: {str(e)}")
            raise RuntimeError(f"Failed to configure VLC: {str(e)}")

    def resource_path(self, relative_path):
        """Get absolute path to resource, works for dev and PyInstaller"""
        base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_path, relative_path)


if __name__ == "__main__":
    config = Config()
    print(f"VLC HTTP Interface enabled: {config.HTTP_ENABLED}")
    print(f"VLC HTTP port: {config.HTTP_PORT}")
    print(f"VLC HTTP password: {'Set (hidden)' if config.HTTP_PASSWORD else 'Not set'}")

    # Example setup command
    if len(sys.argv) > 1 and sys.argv[1] == "setup":
        try:
            port = int(sys.argv[2]) if len(sys.argv) > 2 else None
            password = sys.argv[3] if len(sys.argv) > 3 else None
            result = config.setup_vlc_config(port=port, password=password)
            print("VLC configuration updated successfully!")
            print(f"HTTP Port: {config.HTTP_PORT}")
            print(
                f"HTTP Password: {config.HTTP_PASSWORD if config.HTTP_PASSWORD else 'Not set'}"
            )
        except FileNotFoundError as e:
            print(f"ERROR: {str(e)}")
            print("Please ensure VLC is installed and has been run at least once.")
            sys.exit(1)
        except Exception as e:
            print(f"ERROR: {str(e)}")
            sys.exit(1)
