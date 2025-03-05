import ctypes
import os
import shutil
import subprocess
import sys
import winreg
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


def find_vlc_path():
    """Find VLC installation path from registry"""
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\VideoLAN\VLC") as key:
            return winreg.QueryValueEx(key, "InstallDir")[0]
    except WindowsError:
        # Try 32-bit registry view on 64-bit Windows
        try:
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\VideoLAN\VLC"
            ) as key:
                return winreg.QueryValueEx(key, "InstallDir")[0]
        except WindowsError:
            pass

    # Try common paths
    common_paths = [
        r"C:\Program Files\VideoLAN\VLC",
        r"C:\Program Files (x86)\VideoLAN\VLC",
    ]

    for path in common_paths:
        if os.path.exists(path):
            return path

    return None


def get_extension_dir():
    """Get VLC extension directory"""
    appdata_path = os.path.join(
        os.environ.get("APPDATA", ""), "vlc", "lua", "extensions"
    )

    if not os.path.exists(appdata_path):
        os.makedirs(appdata_path, exist_ok=True)

    return appdata_path


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


def create_uninstaller(
    install_dir, extension_path, exe_name="VLC Discord Presence.exe"
):
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
        f.write('del "%s" >nul 2>&1\n' % extension_path)
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
        self.root.geometry(
            "650x450"
        )  # Reduced height since we removed VLC directory section
        self.root.resizable(False, False)
        self.root.configure(fg_color=DISCORD_DARK)

        try:
            icon_path = resource_path(os.path.join("assets", "icon.ico"))
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception as e:
            print(f"Error setting icon: {e}")

        self.create_widgets()

        # Center window
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def create_widgets(self):
        """Create GUI widgets with CustomTkinter - simplified version"""
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
            print(f"Error loading icon image: {e}")

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

    def browse_install_dir(self):
        directory = filedialog.askdirectory(
            initialdir=self.install_dir.get(), title="Select Installation Directory"
        )
        if directory:
            self.install_dir.set(directory)

    def browse_vlc_dir(self):
        directory = filedialog.askdirectory(
            initialdir=self.vlc_dir.get() if self.vlc_dir.get() else "/",
            title="Select VLC Installation Directory",
        )
        if directory:
            self.vlc_dir.set(directory)

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
            print(f"Error creating desktop shortcut: {e}")
            messagebox.showwarning(
                "Warning",
                "Could not create desktop shortcut. You may need to do this manually.",
            )

    def update_progress(self, value, message):
        self.progress.set(value / 100)  # CustomTkinter uses 0-1 range
        self.status_var.set(message)
        self.root.update_idletasks()

    def install(self):
        install_dir = self.install_dir.get()

        try:
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

            # Install VLC extension directly to AppData
            self.update_progress(60, "Installing VLC extension...")
            extension_dir = get_extension_dir()
            lua_source = resource_path(os.path.join("lua", "discord-rp.lua"))
            extension_path = os.path.join(extension_dir, "discord-rp.lua")
            shutil.copy2(lua_source, extension_path)

            # Create shortcuts if requested
            if self.add_startup.get():
                self.update_progress(75, "Adding to startup...")
                add_to_startup(exe_path)

            if self.create_shortcut.get():
                self.update_progress(85, "Creating desktop shortcut...")
                self.create_desktop_shortcut(exe_path, install_dir)

            # Create uninstaller
            self.update_progress(90, "Creating uninstaller...")
            create_uninstaller(install_dir, extension_path)

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
            messagebox.showerror(
                "Error", f"An error occurred during installation:\n\n{str(e)}"
            )
            self.update_progress(0, "Installation failed.")

    def run(self):
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
