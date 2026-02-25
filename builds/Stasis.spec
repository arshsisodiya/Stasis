# -*- mode: python ; coding: utf-8 -*-

import os

project_root = os.path.abspath(os.getcwd())
version_file = os.path.join(project_root, "builds", "version.txt")

a = Analysis(
    [os.path.join(project_root, 'src', 'main.py')],
    pathex=[project_root, os.path.join(project_root, 'src')],
    binaries=[],
    datas=[],
    hiddenimports=[
        'win32crypt',
        'requests',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Stasis',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version=version_file,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Stasis',
)
