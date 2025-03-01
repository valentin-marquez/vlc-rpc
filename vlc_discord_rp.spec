# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['src\\discord_handler.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets', 'assets'),  # Include all assets
        ('lua', 'lua'),        # Include the Lua script for installation
    ],
    hiddenimports=['pypresence'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='VLC Discord Presence',  # More professional name
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
    version='version_info.txt',  # Add version info
)