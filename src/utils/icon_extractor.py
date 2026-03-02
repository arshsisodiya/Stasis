import win32gui
import win32ui
import win32con
import win32api
import os
import base64
from io import BytesIO
from PIL import Image

def extract_icon_as_base64(exe_path, size=32):
    """
    Extracts the icon from an executable and returns it as a base64 encoded PNG.
    """
    if not exe_path or not os.path.exists(exe_path):
        return None

    try:
        # Get the first icon from the executable
        large, small = win32gui.ExtractIconEx(exe_path, 0)
        
        if not large:
            # Try to get from small if large not found
            if small:
                for h in large: win32gui.DestroyIcon(h)
                large = small
                small = []
            else:
                return None
            
        # Clean up icons we don't use
        for h in small:
            win32gui.DestroyIcon(h)
            
        # Use the first large icon
        icon_handle = large[0]
        
        # Create a device context and a bitmap
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
        for h in large:
            win32gui.DestroyIcon(h)
            
        return img_str
    except Exception as e:
        print(f"Error extracting icon from {exe_path}: {e}")
        return None

def get_exe_path_by_name(cursor, app_name):
    """
    Attempts to find the executable path for a given app name from the activity logs.
    """
    cursor.execute("SELECT exe_path FROM activity_logs WHERE app_name = ? AND exe_path IS NOT NULL ORDER BY id DESC LIMIT 1", (app_name,))
    row = cursor.fetchone()
    if row:
        return row[0]
    return None
