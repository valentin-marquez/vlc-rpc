# -*- mode: python -*-
a = Analysis(
    ["../scripts/installer.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("../dist/VLC Discord Presence.exe", "."),
        ("../assets", "assets"),
    ],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="VLC Discord RP Setup",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    icon="../assets/icon.ico",
    version="version_info.txt",
)
