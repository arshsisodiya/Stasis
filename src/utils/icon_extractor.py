import win32gui
import win32ui
import win32con
import win32api
import os
import base64
import psutil
import glob
import subprocess
try:
    from win32com.shell import shell, shellcon
    HAS_SHELL = True
except ImportError:
    HAS_SHELL = False
from io import BytesIO
from PIL import Image

def extract_icon_as_base64(exe_path, size=32):
    """
    Extracts the icon from an executable and returns it as a base64 encoded PNG.
    Tries multiple methods for maximum compatibility (standard EXE vs UWP stubs).
    """
    if not exe_path or not os.path.exists(exe_path):
        return None

    try:
        icon_handle = None
        
        # Method 1: Standard ExtractIconEx (best for traditional desktop apps)
        try:
            large, small = win32gui.ExtractIconEx(exe_path, 0)
            if large:
                icon_handle = large[0]
                for h in small: win32gui.DestroyIcon(h)
                for h in large[1:]: win32gui.DestroyIcon(h)
            elif small:
                icon_handle = small[0]
                for h in small[1:]: win32gui.DestroyIcon(h)
        except Exception:
            pass
            
        # Method 2: Shell.SHGetFileInfo (best for UWP stubs and shell aliases)
        if not icon_handle and HAS_SHELL:
            try:
                flags = shellcon.SHGFI_ICON | (shellcon.SHGFI_LARGEICON if size > 16 else shellcon.SHGFI_SMALLICON)
                ret, info = shell.SHGetFileInfo(exe_path, 0, flags)
                icon_handle = info[0]
            except Exception as e:
                print(f"[icon_extractor] Shell fallback failed for {exe_path}: {e}")
                pass
                
        if not icon_handle:
            return None
            
        # Create a device context and a bitmap to draw the icon
        hdc = win32ui.CreateDCFromHandle(win32gui.GetDC(0))
        hbmp = win32ui.CreateBitmap()
        hbmp.CreateCompatibleBitmap(hdc, size, size)
        
        hdc_mem = win32ui.CreateDCFromHandle(win32gui.CreateCompatibleDC(hdc.GetSafeHdc()))
        hdc_mem.SelectObject(hbmp)
        
        # Draw the icon onto the bitmap
        win32gui.DrawIconEx(hdc_mem.GetSafeHdc(), 0, 0, icon_handle, size, size, 0, None, win32con.DI_NORMAL)
        
        # Convert bitmap to PIL Image
        bmpinfo = hbmp.GetInfo()
        bmpstr = hbmp.GetBitmapBits(True)
        img = Image.frombuffer('RGBA', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRA', 0, 1)
        
        # Convert PIL Image to Base64 PNG
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        # Cleanup
        win32gui.DestroyIcon(icon_handle)
            
        return img_str
    except Exception as e:
        print(f"Error extracting icon from {exe_path}: {e}")
        return None

def find_running_exe_by_name(app_name: str) -> str | None:
    """
    Searches all running processes for a match against the friendly name
    or the executable filename.
    """
    try:
        from src.core.process_cache import process_cache
        # Limit iteration to avoid blocking for too long
        for p in psutil.process_iter(['pid']):
            try:
                # Use our existing cache to avoid redundant metadata lookups
                name, exe = process_cache.get_info(p.info['pid'])
                if name and name.lower() == app_name.lower():
                    return exe
                if exe and os.path.basename(exe).lower() == app_name.lower():
                    return exe
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass
    return None

def find_uwp_fallback(stale_path: str) -> str | None:
    """
    If a UWP path no longer exists (due to update), tries to find 
    the newer version in Program Files\WindowsApps.
    """
    if "WindowsApps" not in stale_path:
        return None
    
    parts = stale_path.split(os.sep)
    try:
        # Find where WindowsApps is and the next part (the package folder)
        wa_idx = parts.index("WindowsApps")
        if wa_idx + 2 >= len(parts):
            return None
        
        package_folder_stale = parts[wa_idx + 1]
        exe_filename = parts[-1]
        
        # Folder pattern: Company.AppName_Version_Arch__ID
        # We search for Company.AppName_*__ID
        if "_" in package_folder_stale:
            prefix = package_folder_stale.split("_")[0]
            suffix = package_folder_stale.split("__")[-1] if "__" in package_folder_stale else "*"
            
            search_pattern = os.path.join(
                os.path.join(*parts[:wa_idx + 1]), # C:\Program Files\WindowsApps
                f"{prefix}*__*{suffix}"
            )
            
            matches = glob.glob(search_pattern)
            if matches:
                # Sort by creation time to get the newest if multiple exist
                matches.sort(key=os.path.getctime, reverse=True)
                for match in matches:
                    new_path = os.path.join(match, *parts[wa_idx + 2:])
                    if os.path.exists(new_path):
                        return new_path
    except Exception:
        pass
    return None

def find_uwp_via_powershell(app_name: str) -> str | None:
    """
    Last resort: Uses PowerShell to find the installation location of a UWP package.
    Only triggered for known UWP-friendly names when other methods fail.
    """
    uwp_map = {
        "photos": "*Photos*",
        "calculator": "*Calculator*",
        "media player": "*ZuneMusic*",
        "whatsapp": "*WhatsApp*",
        "microsoft store": "*WindowsStore*",
        "notepad": "*Notepad*",
        "camera": "*WindowsCamera*"
    }
    
    # Flexible lookup: check if any key matches the start or is contained in the app name
    cleaned_name = app_name.lower().replace(".exe", "")
    pattern = None
    for key, pat in uwp_map.items():
        if key in cleaned_name:
            pattern = pat
            break
    
    if not pattern:
        return None
        
    try:
        cmd = f'powershell -Command "Get-AppxPackage -Name {pattern} | Select-Object -ExpandProperty InstallLocation"'
        output = subprocess.check_output(cmd, shell=True, text=True).strip()
        if output and os.path.exists(output):
            # Try to find an EXE in the root folder with a similar name
            exes = glob.glob(os.path.join(output, "*.exe"))
            if exes:
                # Prefer the one that starts with the same prefix or has the most similar name
                exes.sort(key=lambda x: len(os.path.basename(x)), reverse=True)
                return exes[0]
    except Exception as e:
        print(f"[icon_extractor] PowerShell UWP lookup error: {e}")
        pass
    return None

def get_exe_path_by_name(cursor, app_name):
    """
    Attempts to find the executable path for a given app name.
    1. Search running processes (live accurate path)
    2. Search DB history
    3. Fix stale UWP paths
    4. PowerShell UWP lookup (last resort for never-logged UWP apps)
    """
    print(f"[icon_extractor] Resolving path for: '{app_name}'")
    
    # Stage 1: Live processes
    live_path = find_running_exe_by_name(app_name)
    if live_path and os.path.exists(live_path):
        print(f"[icon_extractor] Stage 1 success: {live_path}")
        return live_path

    # Stage 2: Database History
    cursor.execute("""
        SELECT exe_path FROM activity_logs 
        WHERE app_name = ? AND exe_path IS NOT NULL 
        ORDER BY id DESC LIMIT 1
    """, (app_name,))
    row = cursor.fetchone()
    
    if row:
        db_path = row[0]
        if os.path.exists(db_path):
            print(f"[icon_extractor] Stage 2 success (DB): {db_path}")
            return db_path
            
        # Stage 3: UWP Fix-up (if DB path is stale)
        print(f"[icon_extractor] Stage 2 path stale, trying Stage 3 fixup: {db_path}")
        fixed_path = find_uwp_fallback(db_path)
        if fixed_path:
            print(f"[icon_extractor] Stage 3 success (UWP fix): {fixed_path}")
            return fixed_path

    # Stage 4: PowerShell Fallback (for UWP apps with no history or total path failure)
    print(f"[icon_extractor] Falling back to Stage 4 (PowerShell)...")
    ps_path = find_uwp_via_powershell(app_name)
    if ps_path:
        print(f"[icon_extractor] Stage 4 success: {ps_path}")
        return ps_path

    print(f"[icon_extractor] Failed to resolve path for '{app_name}'")
    return None
