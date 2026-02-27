# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['src\\main.py'],
    pathex=[],
    binaries=[],
    datas=[('src\\config\\app_categories.json', 'src\\config')],
    hiddenimports=[
        'flask',
        'flask_cors',
        'werkzeug',
        'werkzeug.routing',
        'werkzeug.serving',
        'pynput.keyboard._win32',
        'pynput.mouse._win32',
        'win32api',
        'win32con',
        'win32gui',
        'win32process',
        'win32security',
        'pywintypes',
        'winerror',
        'comtypes.client',
        'cryptography',
        'watchdog.observers.winapi',
        '_psutil_windows',
        'PIL.Image'
    ],
    hookspath=[],
    hooksconfig={},
    excludes=['unittest', 'lib2to3', 'pydoc', 'doctest', 'curses', 'turtle', 'antigravity', 'distutils', 'test', 'matplotlib', 'scipy', 'pandas', 'IPython', 'pywinauto', 'PyQt5', 'PySide2', 'OpenGL'],
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='stasis-backend',
    icon='backend-app-icon.ico',
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
    
)
