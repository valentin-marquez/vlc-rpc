#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess


def clean():
    """Clean build artifacts"""
    print("Cleaning build directories...")
    dirs_to_clean = ["build", "dist", "__pycache__", "release", "VLC_Discord_RP"]

    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)

    # Clean .pyc files
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith(".pyc"):
                os.remove(os.path.join(root, file))

    # Remove zip file if it exists
    zip_file = "VLC_Discord_RP.zip"
    if os.path.exists(zip_file):
        os.remove(zip_file)
        print(f"Removed {zip_file}")

    print("Clean completed")


def build_app():
    """Build the VLC Discord RP application executable"""
    print("Building VLC Discord Rich Presence application...")

    # Run PyInstaller for the main application
    subprocess.run(["pyinstaller", "--clean", "vlc_discord_rp.spec"], check=True)

    print("Application build complete!")


def build_installer():
    """Build the installer executable"""
    print("Building installer...")

    # First make sure the application was built
    if not os.path.exists(os.path.join("dist", "VLC Discord Presence.exe")):
        print("Error: Application executable not found. Run build first.")
        return False

    # Create installer spec
    installer_spec = """# -*- mode: python -*-
a = Analysis(
    ['scripts/installer.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('dist/VLC Discord Presence.exe', '.'),
        ('assets', 'assets'),
        ('lua', 'lua'),
    ],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='VLC Discord RP Setup',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
)
"""

    # Write the installer spec file
    with open("installer.spec", "w") as spec_file:
        spec_file.write(installer_spec)

    # Run PyInstaller for the installer
    subprocess.run(["pyinstaller", "--clean", "installer.spec"], check=True)

    # Cleanup
    os.remove("installer.spec")

    print("Installer build complete!")
    return True


def package():
    """Package everything into a release zip"""
    print("Creating release package...")

    # Create release directory
    release_dir = "release"
    if os.path.exists(release_dir):
        shutil.rmtree(release_dir)
    os.makedirs(release_dir)

    # Copy installer
    installer_path = os.path.join("dist", "VLC Discord RP Setup.exe")
    if os.path.exists(installer_path):
        shutil.copy2(
            installer_path, os.path.join(release_dir, "VLC Discord RP Setup.exe")
        )
    else:
        print("Warning: Installer executable not found.")

    # Copy readme and license
    if os.path.exists("README.md"):
        shutil.copy2("README.md", os.path.join(release_dir, "README.md"))

    if os.path.exists("LICENSE"):
        shutil.copy2("LICENSE", os.path.join(release_dir, "LICENSE"))

    # Create ZIP archive
    shutil.make_archive("VLC_Discord_RP", "zip", release_dir)
    print("Release package created: VLC_Discord_RP.zip")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build VLC Discord Rich Presence")
    parser.add_argument(
        "command",
        choices=["clean", "build", "installer", "package", "all"],
        help="Build command to run",
    )

    args = parser.parse_args()

    if args.command == "clean":
        clean()
    elif args.command == "build":
        build_app()
    elif args.command == "installer":
        build_installer()
    elif args.command == "package":
        package()
    elif args.command == "all":
        clean()
        build_app()
        if build_installer():
            package()
    else:
        parser.print_help()
