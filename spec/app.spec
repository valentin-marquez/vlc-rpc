# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ["../src/main.py"],
    pathex=["../src"],
    binaries=[],
    datas=[
        ("../assets", "assets"),
        ("../src/*.py", "."),
    ],
    hiddenimports=[
        # External libraries
        "beautifulsoup4",
        "bs4",
        "pypresence",
        "requests",
        "platform",
        # Local modules
        "audio",
        "config",
        "discord_client",
        "media_states",
        "status_reader",
        "video",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="VLC Discord Presence",
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
    icon="../assets/icon.ico",
    version="version_info.txt",
)
