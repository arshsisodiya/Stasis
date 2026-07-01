import json
from flask import Blueprint, jsonify, request
from src.database.database import get_connection

notes_bp = Blueprint("notes_bp", __name__)

def _uid():
    """Helper to get current user_id safely."""
    from src.api.auth_routes import _app_controller
    if _app_controller and _app_controller.auth_manager:
        return _app_controller.auth_manager.active_user_id
    return None

@notes_bp.route("/api/notes", methods=["GET"])
def get_notes():
    """Get all unread quick notes for the current user."""
    uid = _uid()
    conn = get_connection()
    cursor = conn.cursor()
    
    if uid:
        cursor.execute("SELECT id, note_text, created_at FROM quick_notes WHERE is_read = 0 AND user_id = ? ORDER BY created_at DESC", (uid,))
    else:
        cursor.execute("SELECT id, note_text, created_at FROM quick_notes WHERE is_read = 0 AND user_id IS NULL ORDER BY created_at DESC")
        
    rows = cursor.fetchall()
    conn.close()
    
    notes = [{"id": r[0], "text": r[1], "created_at": r[2]} for r in rows]
    return jsonify({"success": True, "notes": notes})

@notes_bp.route("/api/notes/<int:note_id>/read", methods=["POST"])
def mark_note_read(note_id):
    """Mark a quick note as read (dismissed)."""
    uid = _uid()
    conn = get_connection()
    cursor = conn.cursor()
    
    if uid:
        cursor.execute("UPDATE quick_notes SET is_read = 1 WHERE id = ? AND user_id = ?", (note_id, uid))
    else:
        cursor.execute("UPDATE quick_notes SET is_read = 1 WHERE id = ? AND user_id IS NULL", (note_id,))
        
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})
