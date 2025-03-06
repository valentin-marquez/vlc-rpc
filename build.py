#!/usr/bin/env python3
import argparse
import os
import re
import shutil
import subprocess


def clean():
    """Clean build artifacts"""
    print("Cleaning build directories...")
    try:
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
        return True
    except Exception as e:
        print(f"Clean failed: {e}")
        return False


def build_app(version=None, dev=False):
    """Build the VLC Discord RP application executable"""
    print("Building VLC Discord Rich Presence application...")

    # Update version_info.txt if version is provided
    if version:
        update_version_info(version)

    # Modify app.spec for console mode based on dev flag
    spec_file_path = os.path.join("spec", "app.spec")
    if os.path.exists(spec_file_path):
        # Read the spec file
        with open(spec_file_path, "r") as f:
            spec_content = f.read()

        # Backup original spec file
        with open(f"{spec_file_path}.bak", "w") as f:
            f.write(spec_content)

        # Set console mode according to dev flag
        if dev:
            print("Development mode: Building with console window...")
            spec_content = re.sub(r"console=(True|False)", "console=True", spec_content)
        else:
            print("Release mode: Building without console window...")
            spec_content = re.sub(
                r"console=(True|False)", "console=False", spec_content
            )

        # Write modified spec file
        with open(spec_file_path, "w") as f:
            f.write(spec_content)

    # Run PyInstaller for the main application
    try:
        subprocess.run(["pyinstaller", "--clean", "spec/app.spec"], check=True)
        print("Application build complete!")
        success = os.path.exists(os.path.join("dist", "VLC Discord Presence.exe"))
    except subprocess.CalledProcessError:
        print("Application build failed!")
        success = False

    # Restore original spec file if modified
    if os.path.exists(f"{spec_file_path}.bak"):
        shutil.move(f"{spec_file_path}.bak", spec_file_path)

    return success


def update_version_info(version):
    """Update version_info.txt with provided version"""
    print(f"Updating version to {version}...")

    # Read the current content
    version_file_path = os.path.join("spec", "version_info.txt")
    with open(version_file_path, "r") as f:
        content = f.read()

    # Split version into components
    version_parts = version.split(".")
    while len(version_parts) < 3:
        version_parts.append("0")
    version_tuple = ", ".join(version_parts) + ", 0"

    # Replace version strings
    content = re.sub(
        r"filevers=\(\d+, \d+, \d+, \d+\)", f"filevers=({version_tuple})", content
    )
    content = re.sub(
        r"prodvers=\(\d+, \d+, \d+, \d+\)", f"prodvers=({version_tuple})", content
    )
    content = re.sub(
        r"u'FileVersion', u'\d+\.\d+\.\d+'", f"u'FileVersion', u'{version}'", content
    )
    content = re.sub(
        r"u'ProductVersion', u'\d+\.\d+\.\d+'",
        f"u'ProductVersion', u'{version}'",
        content,
    )

    # Write the updated content
    with open(version_file_path, "w") as f:
        f.write(content)


def build_installer():
    """Build the installer executable"""
    print("Building installer...")

    try:
        # First make sure the application was built - note the updated path
        app_path = os.path.join("dist", "VLC Discord Presence.exe")
        if not os.path.exists(app_path):
            print(
                f"Error: Application executable not found at {app_path}. Run build first."
            )
            return False

        # Run PyInstaller for the installer using the spec file
        print("Running PyInstaller with spec/installer.spec...")
        result = subprocess.run(
            ["pyinstaller", "--clean", "spec/installer.spec"],
            check=True,
            capture_output=True,
            text=True,
        )
        print("PyInstaller output:")
        print(result.stdout)

        if result.stderr:
            print("PyInstaller errors:")
            print(result.stderr)

        installer_path = os.path.join("dist", "VLC Discord RP Setup.exe")
        if os.path.exists(installer_path):
            print(f"Installer created successfully at {installer_path}")
            return True
        else:
            print(f"Installer not found at expected location {installer_path}")
            return False

    except subprocess.CalledProcessError as e:
        print(f"Installer build failed with return code: {e.returncode}")
        print("Output:", e.stdout)
        print("Error:", e.stderr)
        return False
    except Exception as e:
        print(f"Installer build failed: {e}")
        return False


def package():
    """Package everything into a release zip"""
    print("Creating release package...")
    try:
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
            return False

        # Copy readme, license and changelog
        for file in ["README.md", "LICENSE", "CHANGELOG.md"]:
            if os.path.exists(file):
                shutil.copy2(file, os.path.join(release_dir, file))

        # Create ZIP archive
        shutil.make_archive("VLC_Discord_RP", "zip", release_dir)
        print("Release package created: VLC_Discord_RP.zip")
        return os.path.exists("VLC_Discord_RP.zip")
    except Exception as e:
        print(f"Package creation failed: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build VLC Discord Rich Presence")
    parser.add_argument(
        "command",
        choices=["clean", "build", "installer", "package", "all"],
        help="Build command to run",
    )
    parser.add_argument(
        "--version",
        help="Version number to update in version_info.txt",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Build in development mode with console window enabled",
    )

    args = parser.parse_args()

    if args.command == "clean":
        clean()
    elif args.command == "build":
        build_app(version=args.version, dev=args.dev)
    elif args.command == "installer":
        build_installer()
    elif args.command == "package":
        success = package()
        if not success:
            exit(1)
    elif args.command == "all":
        if not clean():
            exit(1)
        if not build_app(args.version, dev=args.dev):
            exit(1)
        if not build_installer():
            exit(1)
        if not package():
            exit(1)
    else:
        parser.print_help()
