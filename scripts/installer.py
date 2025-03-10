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

DISCORD_DARK = "#36393F"
DISCORD_DARKER = "#2F3136"
DISCORD_BLURPLE = "#5865F2"
DISCORD_GREEN = "#57F287"
DISCORD_TEXT = "#FFFFFF"
DISCORD_TEXT_MUTED = "#B9BBBE"


def is_admin():
	try:
		return ctypes.windll.shell32.IsUserAnAdmin()
	except Exception:
		return False


def resource_path(relative_path):
	base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
	return os.path.join(base_path, relative_path)


def get_vlc_config_path():
	system = platform.system()

	if system == "Windows":
		return os.path.join(os.environ.get("APPDATA", ""), "vlc", "vlcrc")
	elif system == "Darwin":
		return os.path.join(Path.home(), "Library", "Preferences", "org.videolan.vlc", "vlcrc")
	elif system == "Linux":
		return os.path.join(Path.home(), ".config", "vlc", "vlcrc")
	else:
		return None


def setup_vlc_config(port=9080, enable_http=True, password=None, logger=None):
	if logger is None:
		logger = logging.getLogger("VLC-Discord-RP")
		logger.setLevel(logging.INFO)
		handler = logging.StreamHandler()
		logger.addHandler(handler)

	vlcrc_path = get_vlc_config_path()

	if not vlcrc_path:
		logger.error("Could not determine VLC config path")
		raise FileNotFoundError("Could not determine VLC config path for this OS")

	try:
		os.makedirs(os.path.dirname(vlcrc_path), exist_ok=True)
	except Exception as e:
		logger.error(f"Failed to create directory for VLC config: {str(e)}")
		raise FileNotFoundError(f"Failed to create VLC configuration directory: {str(e)}")

	if password is None and enable_http:
		password = "".join(random.choices(string.ascii_letters + string.digits, k=12))
		logger.info("Generated random HTTP password for VLC")

	try:
		sections = {}
		current_section = None

		if os.path.exists(vlcrc_path):
			with open(vlcrc_path, "r", encoding="utf-8") as f:
				lines = f.readlines()

			for line in lines:
				stripped = line.strip()

				if not stripped or stripped.startswith("#") and not stripped.startswith("#["):
					if current_section is not None:
						sections[current_section].append(line)
					else:
						sections.setdefault("top", []).append(line)
					continue

				section_match = re.match(r"^\s*\[([^\]]+)\]\s*", stripped)
				if section_match:
					current_section = section_match.group(1)
					sections.setdefault(current_section, []).append(line)
				else:
					if current_section is not None:
						sections[current_section].append(line)
					else:
						sections.setdefault("top", []).append(line)

			sections.setdefault("core", ["[core]\n"])
			sections.setdefault("lua", ["[lua]\n"])

			if enable_http:
				extraintf_updated = False
				for i, line in enumerate(sections["core"]):
					if re.match(r"^extraintf=", line.strip()):
						current_value = re.search(r"extraintf=(.*)", line.strip()).group(1)
						if "http" not in current_value:
							if current_value:
								new_value = f"{current_value},http"
							else:
								new_value = "http"
							sections["core"][i] = f"extraintf={new_value}\n"
						extraintf_updated = True
						break
					elif re.match(r"^#extraintf=", line.strip()):
						sections["core"][i] = "extraintf=http\n"
						extraintf_updated = True
						break

				if not extraintf_updated:
					sections["core"].append("extraintf=http\n")

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

			content = []
			if "top" in sections:
				content.extend(sections["top"])
				del sections["top"]

			for section_name, section_lines in sections.items():
				content.extend(section_lines)

			with open(vlcrc_path, "w", encoding="utf-8") as f:
				f.writelines(content)

		else:
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
	startup_folder = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup")

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

	subprocess.run(["powershell", "-Command", ps_script], capture_output=True, text=True)

	return os.path.exists(shortcut_path)


def create_uninstaller(install_dir, exe_name="VLC Discord Presence.exe"):
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
		ctk.set_appearance_mode("dark")
		ctk.set_default_color_theme("blue")

		self.root = ctk.CTk()
		self.root.title("VLC Discord Rich Presence Installer")
		self.root.geometry("780x520")
		self.root.resizable(True, True)
		self.root.minsize(780, 520)
		self.root.configure(fg_color=DISCORD_DARK)

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

	def create_widgets(self):
		main_frame = ctk.CTkFrame(self.root, fg_color=DISCORD_DARK)
		main_frame.pack(fill="both", expand=True, padx=15, pady=10)

		header_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
		header_frame.pack(fill="x", pady=(0, 10))

		try:
			icon_path = resource_path(os.path.join("assets", "vlc_ios.png"))
			if os.path.exists(icon_path):
				icon_img = ctk.CTkImage(
					light_image=ctk.Image.open(icon_path),
					dark_image=ctk.Image.open(icon_path),
					size=(48, 48),
				)
				icon_label = ctk.CTkLabel(header_frame, image=icon_img, text="")
				icon_label.pack(side="left", padx=(0, 10))
		except Exception as e:
			self.logger.error(f"Error loading icon image: {e}")

		title_frame = ctk.CTkFrame(header_frame, fg_color="transparent")
		title_frame.pack(side="left", fill="y")

		ctk.CTkLabel(title_frame, text="VLC Discord Rich Presence", font=("Segoe UI", 16, "bold")).pack(anchor="w")
		ctk.CTkLabel(
			title_frame,
			text="Share what you're watching with Discord",
			font=("Segoe UI", 10),
			text_color=DISCORD_TEXT_MUTED,
		).pack(anchor="w")

		divider = ctk.CTkFrame(main_frame, height=1, fg_color=DISCORD_DARKER)
		divider.pack(fill="x", pady=10)

		config_container = ctk.CTkFrame(main_frame, fg_color="transparent")
		config_container.pack(fill="both", expand=True)

		left_column = ctk.CTkFrame(config_container, fg_color="transparent")
		left_column.pack(side="left", fill="both", expand=True, padx=(0, 5))

		right_column = ctk.CTkFrame(config_container, fg_color="transparent")
		right_column.pack(side="right", fill="both", expand=True, padx=(5, 0))

		dir_frame = ctk.CTkFrame(left_column, fg_color=DISCORD_DARKER)
		dir_frame.pack(fill="x", pady=(0, 10), ipady=2)

		ctk.CTkLabel(dir_frame, text="Installation Directory", font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=8, pady=(5, 2))

		dir_input_frame = ctk.CTkFrame(dir_frame, fg_color="transparent")
		dir_input_frame.pack(fill="x", padx=8, pady=(0, 5))

		self.install_dir = ctk.StringVar()
		self.install_dir.set(os.path.join(os.environ.get("LOCALAPPDATA", ""), "VLC Discord RP"))

		dir_entry = ctk.CTkEntry(dir_input_frame, textvariable=self.install_dir, height=28)
		dir_entry.pack(side="left", padx=(0, 5), fill="x", expand=True)

		dir_btn = ctk.CTkButton(
			dir_input_frame,
			text="Browse...",
			command=self.browse_install_dir,
			width=70,
			height=28,
			fg_color="#4f545c",
			hover_color="#686d73",
		)
		dir_btn.pack(side="right")

		options_frame = ctk.CTkFrame(left_column, fg_color=DISCORD_DARKER)
		options_frame.pack(fill="x", ipady=2)

		ctk.CTkLabel(options_frame, text="Options", font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=8, pady=(5, 2))

		options_container = ctk.CTkFrame(options_frame, fg_color="transparent")
		options_container.pack(fill="x", padx=8, pady=(0, 5))

		startup_row = ctk.CTkFrame(options_container, fg_color="transparent")
		startup_row.pack(fill="x", pady=(0, 2))

		self.add_startup = ctk.BooleanVar(value=True)
		startup_cb = ctk.CTkCheckBox(
			startup_row,
			text="Add to Windows startup",
			variable=self.add_startup,
			border_color=DISCORD_BLURPLE,
			hover_color=DISCORD_BLURPLE,
			fg_color=DISCORD_BLURPLE,
			font=("Segoe UI", 10),
		)
		startup_cb.pack(side="left")

		ctk.CTkLabel(
			startup_row,
			text="(Required for automatic start)",
			font=("Segoe UI", 9),
			text_color=DISCORD_TEXT_MUTED,
		).pack(side="left", padx=(5, 0))

		shortcut_row = ctk.CTkFrame(options_container, fg_color="transparent")
		shortcut_row.pack(fill="x")

		self.create_shortcut = ctk.BooleanVar(value=True)
		ctk.CTkCheckBox(
			shortcut_row,
			text="Create desktop shortcut",
			variable=self.create_shortcut,
			border_color=DISCORD_BLURPLE,
			hover_color=DISCORD_BLURPLE,
			fg_color=DISCORD_BLURPLE,
			font=("Segoe UI", 10),
		).pack(side="left")

		vlc_frame = ctk.CTkFrame(right_column, fg_color=DISCORD_DARKER)
		vlc_frame.pack(fill="both", expand=True, pady=(0, 10), ipady=2)

		ctk.CTkLabel(vlc_frame, text="VLC Configuration", font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=8, pady=(5, 2))

		vlc_config_container = ctk.CTkFrame(vlc_frame, fg_color="transparent")
		vlc_config_container.pack(fill="x", padx=8, pady=(0, 2))

		vlc_port_frame = ctk.CTkFrame(vlc_config_container, fg_color="transparent")
		vlc_port_frame.pack(fill="x")

		ctk.CTkLabel(vlc_port_frame, text="HTTP Port:", width=80, anchor="w", font=("Segoe UI", 10)).pack(side="left")

		self.vlc_port = ctk.StringVar(value="9080")
		port_entry = ctk.CTkEntry(vlc_port_frame, textvariable=self.vlc_port, width=80, height=28)
		port_entry.pack(side="left")

		self.configure_vlc = ctk.BooleanVar(value=True)
		vlc_auto_config_cb = ctk.CTkCheckBox(
			vlc_frame,
			text="Configure VLC automatically",
			variable=self.configure_vlc,
			border_color=DISCORD_BLURPLE,
			hover_color=DISCORD_BLURPLE,
			fg_color=DISCORD_BLURPLE,
			command=self.toggle_vlc_manual_config,
			font=("Segoe UI", 10),
		)
		vlc_auto_config_cb.pack(anchor="w", padx=8, pady=2)

		vlc_note = ctk.CTkLabel(
			vlc_frame,
			text="Modifies VLC config to enable HTTP interface",
			font=("Segoe UI", 9),
			text_color=DISCORD_TEXT_MUTED,
		)
		vlc_note.pack(anchor="w", padx=8, pady=(0, 2))

		self.manual_config_frame = ctk.CTkFrame(vlc_frame, fg_color="transparent")

		vlc_password_frame = ctk.CTkFrame(self.manual_config_frame, fg_color="transparent")
		vlc_password_frame.pack(fill="x")

		ctk.CTkLabel(vlc_password_frame, text="Password:", width=80, anchor="w", font=("Segoe UI", 10)).pack(side="left")

		self.vlc_password = ctk.StringVar(value="")
		password_entry = ctk.CTkEntry(vlc_password_frame, textvariable=self.vlc_password, width=120, show="•", height=28)
		password_entry.pack(side="left")

		ctk.CTkLabel(
			vlc_password_frame,
			text="(Optional)",
			font=("Segoe UI", 9),
			text_color=DISCORD_TEXT_MUTED,
		).pack(side="left", padx=(2, 0))

		manual_config_instructions = ctk.CTkLabel(
			self.manual_config_frame,
			text="Configure manually: VLC > Tools > Preferences > Show settings 'All' > \nInterface > Main interfaces > Web > Set password and port",
			font=("Segoe UI", 9),
			text_color=DISCORD_TEXT_MUTED,
			justify="left",
		)
		manual_config_instructions.pack(anchor="w", pady=(2, 0))

		bottom_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
		bottom_frame.pack(fill="x", side="bottom", pady=(10, 0))

		status_progress_frame = ctk.CTkFrame(bottom_frame, fg_color="transparent")
		status_progress_frame.pack(fill="x", side="top", pady=(0, 10))

		self.status_var = ctk.StringVar()
		self.status_var.set("Ready to install")

		ctk.CTkLabel(
			status_progress_frame,
			textvariable=self.status_var,
			font=("Segoe UI", 9),
			text_color=DISCORD_TEXT_MUTED,
		).pack(anchor="w")

		self.progress = ctk.CTkProgressBar(
			status_progress_frame,
			height=8,
			fg_color=DISCORD_DARKER,
			progress_color=DISCORD_BLURPLE,
		)
		self.progress.pack(fill="x", pady=(2, 0))
		self.progress.set(0)

		btn_frame = ctk.CTkFrame(bottom_frame, fg_color="transparent")
		btn_frame.pack(fill="x")

		button_width = 110

		cancel_btn = ctk.CTkButton(
			btn_frame,
			text="Cancel",
			command=self.root.destroy,
			width=button_width,
			height=32,
			fg_color="#4f545c",
			hover_color="#686d73",
		)
		cancel_btn.pack(side="right", padx=(5, 0))

		install_btn = ctk.CTkButton(
			btn_frame,
			text="Install Now",
			command=self.install,
			width=button_width,
			height=32,
			fg_color=DISCORD_BLURPLE,
			hover_color="#4752C4",
			font=("Segoe UI", 11, "bold"),
		)
		install_btn.pack(side="right")

	def toggle_vlc_manual_config(self):
		if self.configure_vlc.get():
			self.manual_config_frame.pack_forget()
		else:
			self.manual_config_frame.pack(fill="x", padx=10, pady=(5, 10))

	def browse_install_dir(self):
		directory = filedialog.askdirectory(initialdir=self.install_dir.get(), title="Select Installation Directory")
		if directory:
			self.install_dir.set(directory)

	def create_desktop_shortcut(self, exe_path, install_dir):
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
				$Shortcut.IconLocation = "{os.path.join(install_dir, "assets", "icon.ico")}"
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
		self.progress.set(value / 100)
		self.status_var.set(message)
		self.root.update_idletasks()

	def install(self):
		install_dir = self.install_dir.get()

		try:
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

			self.update_progress(40, "Installing assets...")
			assets_source = resource_path("assets")
			assets_dir = os.path.join(install_dir, "assets")
			if os.path.isdir(assets_source):
				if os.path.exists(assets_dir):
					shutil.rmtree(assets_dir)
				shutil.copytree(assets_source, assets_dir)

			if self.configure_vlc.get():
				self.update_progress(50, "Configuring VLC...")
				try:
					success, port, password = setup_vlc_config(port=port, enable_http=True, logger=self.logger)
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
						f"Could not configure VLC automatically: {str(e)}\nYou may need to configure the HTTP interface manually.",
					)
			else:
				self.update_progress(50, "Using manual VLC configuration...")
				messagebox.showinfo(
					"Manual VLC Configuration",
					f"Please configure VLC manually with the HTTP interface on port {port}.\n"
					"Remember to enable the web interface in VLC preferences.",
				)

			if self.add_startup.get():
				self.update_progress(75, "Adding to startup...")
				add_to_startup(exe_path)

			if self.create_shortcut.get():
				self.update_progress(85, "Creating desktop shortcut...")
				self.create_desktop_shortcut(exe_path, install_dir)

			self.update_progress(90, "Creating uninstaller...")
			create_uninstaller(install_dir=install_dir)

			self.update_progress(95, "Starting application...")
			subprocess.Popen([exe_path], cwd=install_dir)

			self.update_progress(100, "Installation complete!")
			messagebox.showinfo(
				"Installation Complete",
				"VLC Discord Rich Presence has been installed successfully!\n\nThe application is now running in the background.",
			)

			self.root.destroy()

		except Exception as e:
			self.logger.error(f"Installation error: {str(e)}")
			messagebox.showerror("Error", f"An error occurred during installation:\n\n{str(e)}")
			self.update_progress(0, "Installation failed.")

	def run(self):
		self.root.update_idletasks()

		width = 780
		height = 520

		self.root.geometry(f"{width}x{height}")

		x = (self.root.winfo_screenwidth() // 2) - (width // 2)
		y = (self.root.winfo_screenheight() // 2) - (height // 2)

		if x < 0:
			x = 0
		if y < 0:
			y = 0

		self.root.geometry(f"{width}x{height}+{x}+{y}")

		self.root.bind("<Tab>", lambda e: self.root.event_generate("<<NextWindow>>"))
		self.root.bind("<Escape>", lambda e: self.root.destroy())

		self.root.mainloop()


if __name__ == "__main__":
	try:
		import customtkinter
	except ImportError:
		print("CustomTkinter is required. Install with: pip install customtkinter")
		sys.exit(1)

	app = InstallerGUI()
	app.run()
