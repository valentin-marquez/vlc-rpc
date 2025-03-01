import ctypes
import os
import shutil
import subprocess
import sys
import tkinter as tk
import winreg
from tkinter import filedialog, messagebox, ttk


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


class InstallerGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("VLC Discord Rich Presence Installer")
        self.root.geometry("600x500")
        self.root.resizable(False, False)

        try:
            icon_path = resource_path(os.path.join("assets", "icon.ico"))
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception as e:
            print(f"Error setting icon: {e}")

        self.style = ttk.Style()
        self.style.configure("TButton", padding=6, relief="flat", font=("Segoe UI", 10))
        self.style.configure("TLabel", font=("Segoe UI", 10))
        self.style.configure("Header.TLabel", font=("Segoe UI", 14, "bold"))

        self.style.configure(
            "Action.TButton", padding=10, font=("Segoe UI", 10, "bold")
        )

        self.create_widgets()

        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

        self.root.update_idletasks()

    def create_widgets(self):
        """Create GUI widgets"""

        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill="both", expand=True)

        header_frame = ttk.Frame(main_frame, padding="20 20 20 10")
        header_frame.pack(fill="x")

        ttk.Label(
            header_frame, text="VLC Discord Rich Presence", style="Header.TLabel"
        ).pack(side="left")

        ttk.Label(
            header_frame,
            text="This wizard will install VLC Discord Rich Presence on your computer.",
            wraplength=550,
        ).pack(side="top", anchor="w", pady=(25, 0))

        dir_frame = ttk.LabelFrame(
            main_frame, text="Installation Directory", padding="20 10"
        )
        dir_frame.pack(fill="x", padx=20)

        self.install_dir = tk.StringVar()
        self.install_dir.set(
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "VLC Discord RP")
        )

        dir_entry = ttk.Entry(dir_frame, textvariable=self.install_dir, width=50)
        dir_entry.pack(side="left", padx=(0, 10), fill="x", expand=True)

        dir_btn = ttk.Button(
            dir_frame, text="Browse...", command=self.browse_install_dir
        )
        dir_btn.pack(side="right")

        vlc_frame = ttk.LabelFrame(main_frame, text="VLC Installation", padding="20 10")
        vlc_frame.pack(fill="x", padx=20, pady=(20, 0))

        self.vlc_dir = tk.StringVar()
        vlc_path = find_vlc_path()
        if vlc_path:
            self.vlc_dir.set(vlc_path)

        vlc_entry = ttk.Entry(vlc_frame, textvariable=self.vlc_dir, width=50)
        vlc_entry.pack(side="left", padx=(0, 10), fill="x", expand=True)

        vlc_btn = ttk.Button(vlc_frame, text="Browse...", command=self.browse_vlc_dir)
        vlc_btn.pack(side="right")

        options_frame = ttk.LabelFrame(main_frame, text="Options", padding="20 10")
        options_frame.pack(fill="x", padx=20, pady=(20, 0))

        startup_frame = ttk.Frame(options_frame)
        startup_frame.pack(fill="x", anchor="w")

        self.add_startup = tk.BooleanVar(value=True)
        startup_cb = ttk.Checkbutton(
            startup_frame, text="Add to Windows startup", variable=self.add_startup
        )
        startup_cb.pack(side="left")

        ttk.Label(
            startup_frame,
            text="(Recommended - Required for automatic start with VLC)",
            foreground="#0066CC",
            font=("Segoe UI", 9, "italic"),
        ).pack(side="left", padx=(5, 0))

        self.create_shortcut = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            options_frame, text="Create desktop shortcut", variable=self.create_shortcut
        ).pack(anchor="w")

        self.status_var = tk.StringVar()
        self.status_var.set("Ready to install")

        status_frame = ttk.Frame(main_frame, padding="20 10")
        status_frame.pack(fill="x", padx=20, pady=(20, 0))

        ttk.Label(status_frame, textvariable=self.status_var, foreground="gray").pack(
            anchor="w"
        )

        self.progress = ttk.Progressbar(main_frame, length=560, mode="determinate")
        self.progress.pack(pady=(10, 0), padx=20)

        btn_frame = ttk.Frame(main_frame, padding="20")
        btn_frame.pack(fill="x", side="bottom", pady=(20, 0))

        install_btn = ttk.Button(
            btn_frame, text="Install Now", command=self.install, style="Action.TButton"
        )
        install_btn.pack(side="right")

        ttk.Button(btn_frame, text="Cancel", command=self.root.destroy).pack(
            side="right", padx=10
        )

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

    def update_progress(self, value, message):
        self.progress["value"] = value
        self.status_var.set(message)
        self.root.update_idletasks()

    def install(self):

        install_dir = self.install_dir.get()
        vlc_dir = self.vlc_dir.get()

        if not os.path.exists(vlc_dir):
            messagebox.showerror("Error", "VLC installation directory not found.")
            return

        try:

            self.update_progress(10, "Creating installation directory...")
            os.makedirs(install_dir, exist_ok=True)

            self.update_progress(20, "Installing main application...")
            exe_path = os.path.join(install_dir, "VLC Discord Presence.exe")

            bundled_exe = resource_path("VLC Discord Presence.exe")
            if os.path.exists(bundled_exe):

                shutil.copy2(bundled_exe, exe_path)
            else:

                shutil.copy2(sys.executable, exe_path)

            self.update_progress(30, "Installing assets...")
            assets_dir = os.path.join(install_dir, "assets")
            os.makedirs(assets_dir, exist_ok=True)

            assets_source = resource_path("assets")
            if os.path.isdir(assets_source):
                for file in os.listdir(assets_source):
                    src_file = os.path.join(assets_source, file)
                    dst_file = os.path.join(assets_dir, file)
                    if os.path.isfile(src_file):
                        shutil.copy2(src_file, dst_file)

            self.update_progress(50, "Installing VLC extension...")
            extension_dir = get_extension_dir()
            lua_source = resource_path(os.path.join("lua", "discord-rp.lua"))
            extension_path = os.path.join(extension_dir, "discord-rp.lua")

            shutil.copy2(lua_source, extension_path)

            if self.add_startup.get():
                self.update_progress(70, "Adding to startup...")
                if not add_to_startup(exe_path):
                    messagebox.showwarning(
                        "Warning",
                        "Could not add to startup. You may need to do this manually.",
                    )

            if self.create_shortcut.get():
                self.update_progress(80, "Creating desktop shortcut...")

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
                        shortcut_path = os.path.join(
                            desktop_path, "VLC Discord Presence.lnk"
                        )

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
                            raise Exception(
                                f"Failed to create shortcut: {result.stderr}"
                            )
                    else:
                        raise Exception(f"Invalid desktop path: {desktop_path}")

                except Exception as e:

                    print(f"Error creating desktop shortcut: {e}")
                    messagebox.showwarning(
                        "Warning",
                        "Could not create desktop shortcut. You may need to do this manually.",
                    )

            self.update_progress(90, "Creating uninstaller...")
            create_uninstaller(install_dir, extension_path)

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
    app = InstallerGUI()
    app.run()
