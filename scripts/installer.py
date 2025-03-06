import ctypes
import logging
import os
import platform
import random
import re
import shutil
import string
import subprocess
import sys
from pathlib import Path
from tkinter import filedialog, messagebox

import customtkinter as ctk

# Discord color palette
DISCORD_DARK = "#36393F"  # Main background
DISCORD_DARKER = "#2F3136"  # Secondary background
DISCORD_BLURPLE = "#5865F2"  # Primary accent color
DISCORD_GREEN = "#57F287"  # Success color
DISCORD_TEXT = "#FFFFFF"  # Primary text
DISCORD_TEXT_MUTED = "#B9BBBE"  # Secondary text


def is_admin():
    """Check if the script is running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


def resource_path(relative_path):
    """Get absolute path to resource, works for dev and PyInstaller"""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


def get_vlc_config_path():
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
        return None


def setup_vlc_config(port=9080, enable_http=True, password=None, logger=None):
    """
    Configure VLC for Discord Rich Presence with proper TOML section handling

    Args:
        port: HTTP port to set (defaults to 9080)
        enable_http: Whether to enable HTTP interface
        password: HTTP password to set (generates random if None)
        logger: Logger to use (creates a new one if None)

    Returns:
        tuple: (success, port, password)

    Raises:
        FileNotFoundError: When VLC config file doesn't exist and can't be created
    """
    # Set up logging if not provided
    if logger is None:
        logger = logging.getLogger("VLC-Discord-RP")
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        logger.addHandler(handler)

    vlcrc_path = get_vlc_config_path()

    if not vlcrc_path:
        logger.error("Could not determine VLC config path")
        raise FileNotFoundError("Could not determine VLC config path for this OS")

    # Create directory if it doesn't exist
    try:
        os.makedirs(os.path.dirname(vlcrc_path), exist_ok=True)
    except Exception as e:
        logger.error(f"Failed to create directory for VLC config: {str(e)}")
        raise FileNotFoundError(
            f"Failed to create VLC configuration directory: {str(e)}"
        )

    # Generate random password if not provided
    if password is None and enable_http:
        # Generate a random 12 character password
        password = "".join(random.choices(string.ascii_letters + string.digits, k=12))
        logger.info("Generated random HTTP password for VLC")

    try:
        # Parse the VLC config file (TOML format)
        sections = {}
        current_section = None

        if os.path.exists(vlcrc_path):
            with open(vlcrc_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            # Parse file into sections
            for line in lines:
                stripped = line.strip()

                # Skip empty lines and comments-only lines
                if (
                    not stripped
                    or stripped.startswith("#")
                    and not stripped.startswith("#[")
                ):
                    if current_section is not None:
                        sections[current_section].append(line)
                    else:
                        sections.setdefault("top", []).append(line)
                    continue

                # Check for section headers
                section_match = re.match(r"^\s*\[([^\]]+)\]\s*", stripped)
                if section_match:
                    current_section = section_match.group(1)
                    sections.setdefault(current_section, []).append(line)
                else:
                    if current_section is not None:
                        sections[current_section].append(line)
                    else:
                        sections.setdefault("top", []).append(line)

            # Ensure required sections exist
            sections.setdefault("core", ["[core]\n"])
            sections.setdefault("lua", ["[lua]\n"])

            # Update settings in their correct sections

            # Handle extraintf in [core] section
            if enable_http:
                extraintf_updated = False
                for i, line in enumerate(sections["core"]):
                    if re.match(r"^extraintf=", line.strip()):
                        # Update existing line
                        current_value = re.search(
                            r"extraintf=(.*)", line.strip()
                        ).group(1)
                        if "http" not in current_value:
                            if current_value:
                                new_value = f"{current_value},http"
                            else:
                                new_value = "http"
                            sections["core"][i] = f"extraintf={new_value}\n"
                        extraintf_updated = True
                        break
                    elif re.match(r"^#extraintf=", line.strip()):
                        # Uncomment and set value
                        sections["core"][i] = f"extraintf=http\n"
                        extraintf_updated = True
                        break

                # Add extraintf if not found
                if not extraintf_updated:
                    sections["core"].append("extraintf=http\n")

            # Handle http-port in [core] section
            port_updated = False
            for i, line in enumerate(sections["core"]):
                if re.match(r"^http-port=", line.strip()):
                    sections["core"][i] = f"http-port={port}\n"
                    port_updated = True
                    break
                elif re.match(r"^#http-port=", line.strip()):
                    sections["core"][i] = f"http-port={port}\n"
                    port_updated = True
                    break

            if not port_updated:
                sections["core"].append(f"http-port={port}\n")

            # Handle password in [lua] section if provided
            if password:
                password_updated = False
                for i, line in enumerate(sections["lua"]):
                    if re.match(r"^http-password=", line.strip()):
                        sections["lua"][i] = f"http-password={password}\n"
                        password_updated = True
                        break
                    elif re.match(r"^#http-password=", line.strip()):
                        sections["lua"][i] = f"http-password={password}\n"
                        password_updated = True
                        break

                if not password_updated:
                    sections["lua"].append(f"http-password={password}\n")

            # Rebuild the file content
            content = []
            if "top" in sections:
                content.extend(sections["top"])
                del sections["top"]

            # Add remaining sections
            for section_name, section_lines in sections.items():
                content.extend(section_lines)

            # Write back to the file
            with open(vlcrc_path, "w", encoding="utf-8") as f:
                f.writelines(content)

        else:
            # Create a new minimal config file
            with open(vlcrc_path, "w", encoding="utf-8") as f:
                f.write("[core]\n")
                f.write(f"http-port={port}\n")
                if enable_http:
                    f.write("extraintf=http\n")
                f.write("\n")
                f.write("[lua]\n")
                if password:
                    f.write(f"http-password={password}\n")

        logger.info(f"Successfully configured VLC with HTTP port {port}")
        logger.info(f"HTTP interface enabled: {enable_http}")
        if password:
            logger.info("HTTP password configured")

        return True, port, password

    except Exception as e:
        logger.error(f"Error configuring VLC: {str(e)}")
        raise RuntimeError(f"Failed to configure VLC: {str(e)}")


def add_to_startup(exe_path):
    """Add to Windows startup"""
    startup_folder = os.path.join(
        os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup"
    )

    shortcut_path = os.path.join(startup_folder, "VLC Discord Presence.lnk")

    ps_script = f"""
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
    $Shortcut.TargetPath = "{exe_path}"
    $Shortcut.WorkingDirectory = "{os.path.dirname(exe_path)}"
    $Shortcut.Description = "VLC Discord Rich Presence"
    $Shortcut.IconLocation = "{exe_path},0"
    $Shortcut.Save()
    """

    subprocess.run(
        ["powershell", "-Command", ps_script], capture_output=True, text=True
    )

    return os.path.exists(shortcut_path)


def create_uninstaller(install_dir, exe_name="VLC Discord Presence.exe"):
    """Create an uninstaller batch file"""
    uninstall_script = os.path.join(install_dir, "uninstall.bat")
    startup_shortcut = os.path.join(
        os.environ["APPDATA"],
        r"Microsoft\Windows\Start Menu\Programs\Startup",
        "VLC Discord Presence.lnk",
    )

    with open(uninstall_script, "w") as f:
        f.write("@echo off\n")
        f.write("echo Uninstalling VLC Discord Rich Presence...\n")
        f.write('taskkill /f /im "%s" >nul 2>&1\n' % exe_name)
        f.write("timeout /t 1 /nobreak >nul\n")
        f.write('del "%s" >nul 2>&1\n' % startup_shortcut)
        f.write('rmdir /s /q "%s" >nul 2>&1\n' % install_dir)
        f.write("echo Uninstallation complete\n")
        f.write("pause\n")
        f.write('(goto) 2>nul & del "%~f0"\n')

    return uninstall_script


class InstallerGUI(ctk.CTk):
    def __init__(self):
        # Set appearance mode and default color theme
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.root = ctk.CTk()
        self.root.title("VLC Discord Rich Presence Installer")
        self.root.geometry("650x550")  # Increased height for VLC configuration section
        self.root.resizable(False, False)
        self.root.configure(fg_color=DISCORD_DARK)

        # Set up logging
        self.logger = logging.getLogger("VLC-Discord-RP")
        self.logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        self.logger.addHandler(handler)

        try:
            icon_path = resource_path(os.path.join("assets", "icon.ico"))
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception as e:
            self.logger.error(f"Error setting icon: {e}")

        self.create_widgets()

        # Center window
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def create_widgets(self):
        """Create GUI widgets with CustomTkinter"""
        main_frame = ctk.CTkFrame(self.root, fg_color=DISCORD_DARK)
        main_frame.pack(fill="both", expand=True, padx=25, pady=25)

        # Header with icon and text
        header_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
        header_frame.pack(fill="x", pady=(0, 20))

        # Try to load and display app icon
        try:
            icon_path = resource_path(os.path.join("assets", "vlc_ios.png"))
            if os.path.exists(icon_path):
                icon_img = ctk.CTkImage(
                    light_image=ctk.Image.open(icon_path),
                    dark_image=ctk.Image.open(icon_path),
                    size=(64, 64),
                )
                icon_label = ctk.CTkLabel(header_frame, image=icon_img, text="")
                icon_label.pack(side="left", padx=(0, 15))
        except Exception as e:
            self.logger.error(f"Error loading icon image: {e}")

        title_frame = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_frame.pack(side="left", fill="y")

        ctk.CTkLabel(
            title_frame, text="VLC Discord Rich Presence", font=("Segoe UI", 20, "bold")
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_frame,
            text="Share what you're watching or listening to with your Discord friends",
            font=("Segoe UI", 12),
            text_color=DISCORD_TEXT_MUTED,
        ).pack(anchor="w")

        # Divider
        divider = ctk.CTkFrame(main_frame, height=1, fg_color=DISCORD_DARKER)
        divider.pack(fill="x", pady=15)

        # Installation directory
        dir_frame = ctk.CTkFrame(main_frame, fg_color=DISCORD_DARKER)
        dir_frame.pack(fill="x", pady=(0, 15), padx=5, ipady=5)

        ctk.CTkLabel(
            dir_frame, text="Installation Directory", font=("Segoe UI", 12, "bold")
        ).pack(anchor="w", padx=10, pady=(10, 5))

        dir_input_frame = ctk.CTkFrame(dir_frame, fg_color="transparent")
        dir_input_frame.pack(fill="x", padx=10, pady=(0, 10))

        self.install_dir = ctk.StringVar()
        self.install_dir.set(
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "VLC Discord RP")
        )

        dir_entry = ctk.CTkEntry(
            dir_input_frame, textvariable=self.install_dir, width=520, height=32
        )
        dir_entry.pack(side="left", padx=(0, 10), fill="x", expand=True)

        dir_btn = ctk.CTkButton(
            dir_input_frame,
            text="Browse...",
            command=self.browse_install_dir,
            width=80,
            height=32,
            fg_color="#4f545c",
            hover_color="#686d73",
        )
        dir_btn.pack(side="right")

        # VLC Configuration Section
        vlc_frame = ctk.CTkFrame(main_frame, fg_color=DISCORD_DARKER)
        vlc_frame.pack(fill="x", pady=(0, 15), padx=5, ipady=5)

        ctk.CTkLabel(
            vlc_frame, text="VLC Configuration", font=("Segoe UI", 12, "bold")
        ).pack(anchor="w", padx=10, pady=(10, 5))

        vlc_port_frame = ctk.CTkFrame(vlc_frame, fg_color="transparent")
        vlc_port_frame.pack(fill="x", padx=10, pady=(0, 5))

        ctk.CTkLabel(
            vlc_port_frame, text="HTTP Interface Port:", width=150, anchor="w"
        ).pack(side="left")

        self.vlc_port = ctk.StringVar(value="9080")
        port_entry = ctk.CTkEntry(vlc_port_frame, textvariable=self.vlc_port, width=100)
        port_entry.pack(side="left", padx=5)

        self.configure_vlc = ctk.BooleanVar(value=True)
        vlc_auto_config_cb = ctk.CTkCheckBox(
            vlc_frame,
            text="Configure VLC automatically",
            variable=self.configure_vlc,
            border_color=DISCORD_BLURPLE,
            hover_color=DISCORD_BLURPLE,
            fg_color=DISCORD_BLURPLE,
            command=self.toggle_vlc_manual_config,
        )
        vlc_auto_config_cb.pack(anchor="w", padx=10, pady=5)

        vlc_note = ctk.CTkLabel(
            vlc_frame,
            text="Note: This will modify your VLC configuration to enable the HTTP interface, \n"
            "which is required for Discord Rich Presence to work.",
            font=("Segoe UI", 10),
            text_color=DISCORD_TEXT_MUTED,
        )
        vlc_note.pack(anchor="w", padx=10, pady=(0, 10))

        # Manual configuration frame - initially hidden
        self.manual_config_frame = ctk.CTkFrame(vlc_frame, fg_color="transparent")

        # Password field
        vlc_password_frame = ctk.CTkFrame(
            self.manual_config_frame, fg_color="transparent"
        )
        vlc_password_frame.pack(fill="x", pady=(0, 5))

        ctk.CTkLabel(
            vlc_password_frame, text="HTTP Password:", width=150, anchor="w"
        ).pack(side="left")

        self.vlc_password = ctk.StringVar(value="")
        password_entry = ctk.CTkEntry(
            vlc_password_frame, textvariable=self.vlc_password, width=200, show="•"
        )
        password_entry.pack(side="left", padx=5)

        ctk.CTkLabel(
            vlc_password_frame,
            text="(Optional)",
            font=("Segoe UI", 10),
            text_color=DISCORD_TEXT_MUTED,
        ).pack(side="left", padx=(5, 0))

        # Manual configuration instructions
        manual_config_instructions = ctk.CTkLabel(
            self.manual_config_frame,
            text="To configure VLC manually:\n"
            "1. Open VLC and go to Tools > Preferences\n"
            "2. Set Show settings to 'All' at the bottom left\n"
            "3. Go to Interface > Main interfaces and check 'Web'\n"
            "4. Go to Interface > Main interfaces > Lua and set the password\n"
            "5. Set the HTTP port to match the one specified above",
            font=("Segoe UI", 10),
            text_color=DISCORD_TEXT_MUTED,
            justify="left",
        )
        manual_config_instructions.pack(anchor="w", padx=10, pady=(5, 10))

        # Options
        options_frame = ctk.CTkFrame(main_frame, fg_color=DISCORD_DARKER)
        options_frame.pack(fill="x", pady=(0, 15), padx=5, ipady=5)

        ctk.CTkLabel(options_frame, text="Options", font=("Segoe UI", 12, "bold")).pack(
            anchor="w", padx=10, pady=(10, 5)
        )

        startup_option = ctk.CTkFrame(options_frame, fg_color="transparent")
        startup_option.pack(fill="x", padx=10, pady=(0, 5))

        self.add_startup = ctk.BooleanVar(value=True)
        startup_cb = ctk.CTkCheckBox(
            startup_option,
            text="Add to Windows startup",
            variable=self.add_startup,
            border_color=DISCORD_BLURPLE,
            hover_color=DISCORD_BLURPLE,
            fg_color=DISCORD_BLURPLE,
        )
        startup_cb.pack(side="left")

        ctk.CTkLabel(
            startup_option,
            text="(Recommended - Required for automatic start with VLC)",
            font=("Segoe UI", 10),
            text_color=DISCORD_TEXT_MUTED,
        ).pack(side="left", padx=(5, 0))

        # Desktop shortcut option
        self.create_shortcut = ctk.BooleanVar(value=True)
        ctk.CTkCheckBox(
            options_frame,
            text="Create desktop shortcut",
            variable=self.create_shortcut,
            border_color=DISCORD_BLURPLE,
            hover_color=DISCORD_BLURPLE,
            fg_color=DISCORD_BLURPLE,
        ).pack(anchor="w", padx=10, pady=(0, 10))

        # Status and progress
        status_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
        status_frame.pack(fill="x", pady=(15, 10))

        self.status_var = ctk.StringVar()
        self.status_var.set("Ready to install")

        ctk.CTkLabel(
            status_frame,
            textvariable=self.status_var,
            font=("Segoe UI", 10),
            text_color=DISCORD_TEXT_MUTED,
        ).pack(anchor="w")

        self.progress = ctk.CTkProgressBar(
            main_frame,
            width=600,
            height=10,
            fg_color=DISCORD_DARKER,
            progress_color=DISCORD_BLURPLE,
        )
        self.progress.pack(fill="x", pady=(0, 20))
        self.progress.set(0)

        # Action buttons
        btn_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
        btn_frame.pack(fill="x", side="bottom")

        # Button width adjustment for consistent size
        button_width = 120

        cancel_btn = ctk.CTkButton(
            btn_frame,
            text="Cancel",
            command=self.root.destroy,
            width=button_width,
            height=36,
            fg_color="#4f545c",
            hover_color="#686d73",
        )
        cancel_btn.pack(side="right", padx=(10, 0))

        install_btn = ctk.CTkButton(
            btn_frame,
            text="Install Now",
            command=self.install,
            width=button_width,
            height=36,
            fg_color=DISCORD_BLURPLE,
            hover_color="#4752C4",
            font=("Segoe UI", 12, "bold"),
        )
        install_btn.pack(side="right")

    def toggle_vlc_manual_config(self):
        """Show or hide manual VLC configuration options based on checkbox state"""
        if self.configure_vlc.get():
            self.manual_config_frame.pack_forget()
        else:
            self.manual_config_frame.pack(fill="x", padx=10, pady=(5, 10))

    def browse_install_dir(self):
        """Browse for installation directory"""
        directory = filedialog.askdirectory(
            initialdir=self.install_dir.get(), title="Select Installation Directory"
        )
        if directory:
            self.install_dir.set(directory)

    def create_desktop_shortcut(self, exe_path, install_dir):
        """Create desktop shortcut using PowerShell"""
        # Use Windows shell special folders to reliably get desktop path
        # This works with OneDrive redirection and localized folder names
        ps_get_desktop = """
        [Environment]::GetFolderPath("Desktop")
        """

        try:
            desktop_result = subprocess.run(
                ["powershell", "-Command", ps_get_desktop],
                capture_output=True,
                text=True,
                check=True,
            )

            desktop_path = desktop_result.stdout.strip()

            if desktop_path and os.path.exists(desktop_path):
                shortcut_path = os.path.join(desktop_path, "VLC Discord Presence.lnk")

                ps_script = f"""
                $WshShell = New-Object -ComObject WScript.Shell
                $Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
                $Shortcut.TargetPath = "{exe_path}"
                $Shortcut.WorkingDirectory = "{install_dir}"
                $Shortcut.Description = "VLC Discord Rich Presence"
                $Shortcut.IconLocation = "{exe_path},0"
                $Shortcut.Save()
                """

                result = subprocess.run(
                    ["powershell", "-Command", ps_script],
                    capture_output=True,
                    text=True,
                )

                if not os.path.exists(shortcut_path):
                    raise Exception(f"Failed to create shortcut: {result.stderr}")
            else:
                raise Exception(f"Invalid desktop path: {desktop_path}")

        except Exception as e:
            self.logger.error(f"Error creating desktop shortcut: {e}")
            messagebox.showwarning(
                "Warning",
                "Could not create desktop shortcut. You may need to do this manually.",
            )

    def update_progress(self, value, message):
        """Update progress bar and status message"""
        self.progress.set(value / 100)  # CustomTkinter uses 0-1 range
        self.status_var.set(message)
        self.root.update_idletasks()

    def install(self):
        """Main installation procedure"""
        install_dir = self.install_dir.get()

        try:
            # Validate port number
            try:
                port = int(self.vlc_port.get())
                if port < 1 or port > 65535:
                    raise ValueError("Port must be between 1 and 65535")
            except ValueError as e:
                messagebox.showerror("Error", f"Invalid port number: {str(e)}")
                return

            self.update_progress(10, "Creating installation directory...")
            os.makedirs(install_dir, exist_ok=True)

            self.update_progress(30, "Installing main application...")
            exe_path = os.path.join(install_dir, "VLC Discord Presence.exe")

            bundled_exe = resource_path("VLC Discord Presence.exe")
            if os.path.exists(bundled_exe):
                shutil.copy2(bundled_exe, exe_path)
            else:
                shutil.copy2(sys.executable, exe_path)

            # Copy assets in one operation
            self.update_progress(40, "Installing assets...")
            assets_source = resource_path("assets")
            assets_dir = os.path.join(install_dir, "assets")
            if os.path.isdir(assets_source):
                if os.path.exists(assets_dir):
                    shutil.rmtree(assets_dir)
                shutil.copytree(assets_source, assets_dir)

            # Configure VLC if requested
            if self.configure_vlc.get():
                self.update_progress(50, "Configuring VLC...")
                try:
                    success, port, password = setup_vlc_config(
                        port=port, enable_http=True, logger=self.logger
                    )
                    if success:
                        self.status_var.set(f"VLC configured with HTTP port {port}")
                        messagebox.showinfo(
                            "VLC Configuration",
                            f"VLC has been configured with HTTP interface on port {port}.\n"
                            f"If a password was set, please remember it for the application.",
                        )
                except Exception as e:
                    self.logger.error(f"Failed to configure VLC: {str(e)}")
                    messagebox.showwarning(
                        "Warning",
                        f"Could not configure VLC automatically: {str(e)}\n"
                        "You may need to configure the HTTP interface manually.",
                    )
            else:
                # Manual configuration - just show a reminder
                self.update_progress(50, "Using manual VLC configuration...")
                messagebox.showinfo(
                    "Manual VLC Configuration",
                    f"Please configure VLC manually with the HTTP interface on port {port}.\n"
                    "Remember to enable the web interface in VLC preferences.",
                )

            # Create shortcuts if requested
            if self.add_startup.get():
                self.update_progress(75, "Adding to startup...")
                add_to_startup(exe_path)

            if self.create_shortcut.get():
                self.update_progress(85, "Creating desktop shortcut...")
                self.create_desktop_shortcut(exe_path, install_dir)

            # Create uninstaller
            self.update_progress(90, "Creating uninstaller...")
            create_uninstaller(install_dir=install_dir)

            # Start the application
            self.update_progress(95, "Starting application...")
            subprocess.Popen([exe_path], cwd=install_dir)

            self.update_progress(100, "Installation complete!")
            messagebox.showinfo(
                "Installation Complete",
                "VLC Discord Rich Presence has been installed successfully!\n\n"
                "The application is now running in the background.",
            )

            self.root.destroy()

        except Exception as e:
            self.logger.error(f"Installation error: {str(e)}")
            messagebox.showerror(
                "Error", f"An error occurred during installation:\n\n{str(e)}"
            )
            self.update_progress(0, "Installation failed.")

    def run(self):
        """Run the application"""
        self.root.update_idletasks()

        required_height = self.root.winfo_reqheight()
        if required_height > self.root.winfo_height():
            new_height = required_height + 20
            self.root.geometry(f"{self.root.winfo_width()}x{new_height}")

        self.root.mainloop()


if __name__ == "__main__":
    # First, ensure customtkinter is installed
    try:
        import customtkinter
    except ImportError:
        print("CustomTkinter is required. Install with: pip install customtkinter")
        sys.exit(1)

    app = InstallerGUI()
    app.run()
