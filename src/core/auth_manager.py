import sqlite3
import uuid
import secrets
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from src.database.database import get_connection

class AuthManager:
    def __init__(self):
        self._active_user_id = None
        
    @property
    def active_user_id(self):
        return self._active_user_id
        
    @active_user_id.setter
    def active_user_id(self, value):
        self._active_user_id = value

    def register_user(self, username, password):
        """Register a new user and return user info"""
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Check if username exists
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cursor.fetchone():
                return {"success": False, "error": "Username already exists"}
                
            user_id = str(uuid.uuid4())
            password_hash = generate_password_hash(password)
            created_at = datetime.now().isoformat()
            
            cursor.execute("""
                INSERT INTO users (id, username, password_hash, created_at)
                VALUES (?, ?, ?, ?)
            """, (user_id, username, password_hash, created_at))
            
            # Sync orphaned data
            self._sync_orphaned_data(cursor, user_id)
            
            conn.commit()
            return {"success": True, "user": {"id": user_id, "username": username}}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def login(self, username, password):
        """Login user, set active user, and create session"""
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()
            
            if not user or not check_password_hash(user[2], password):
                return {"success": False, "error": "Invalid username or password"}
                
            user_id = user[0]
            token = secrets.token_hex(32)
            # Session valid for 30 days
            expires_at = (datetime.now() + timedelta(days=30)).isoformat()
            
            cursor.execute("""
                INSERT INTO sessions (token, user_id, expires_at)
                VALUES (?, ?, ?)
            """, (token, user_id, expires_at))
            
            # Set global active user
            self.active_user_id = user_id
            
            # Sync orphaned data created while logged out
            self._sync_orphaned_data(cursor, user_id)
            
            conn.commit()
            return {"success": True, "token": token, "user": {"id": user_id, "username": user[1]}}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def logout(self, token):
        """Logout user and destroy session"""
        conn = get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            
            # Clear active user state if the current active session matches
            # For a strictly single-tenant desktop app, we can just clear it.
            self.active_user_id = None
            return {"success": True}
        finally:
            conn.close()
            
    def validate_token(self, token):
        """Validate token and return user if valid"""
        if not token:
            return None
            
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Check expiration
            now = datetime.now().isoformat()
            
            # Cleanup expired sessions first
            cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.commit()
            
            cursor.execute("""
                SELECT u.id, u.username 
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at >= ?
            """, (token, now))
            
            user = cursor.fetchone()
            if user:
                return {"id": user[0], "username": user[1]}
            return None
        finally:
            conn.close()

    def restore_session_from_db(self):
        """
        Called once on backend startup to restore active_user_id from the most
        recent valid (non-expired) session stored in the database.
        
        This ensures the activity logger writes the correct user_id immediately
        on restart, without waiting for the frontend to reconnect and call /api/auth/me.
        """
        conn = get_connection()
        cursor = conn.cursor()
        try:
            now = datetime.now().isoformat()
            # Clean up expired sessions first
            cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.commit()
            
            # Find the most recently created valid session
            cursor.execute("""
                SELECT s.user_id, u.username
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.expires_at >= ?
                ORDER BY s.expires_at DESC
                LIMIT 1
            """, (now,))
            row = cursor.fetchone()
            if row:
                self._active_user_id = row[0]
                return {"id": row[0], "username": row[1]}
            return None
        except Exception as e:
            print(f"[AuthManager] Failed to restore session from DB: {e}")
            return None
        finally:
            conn.close()

    def set_active_user_by_token(self, token):
        """Called on startup if frontend provides a saved token"""
        user = self.validate_token(token)
        if user:
            self.active_user_id = user["id"]
        return user
        
    def change_password(self, user_id, current_password, new_password):
        """Change user password"""
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            
            if not user or not check_password_hash(user[0], current_password):
                return {"success": False, "error": "Incorrect current password"}
                
            new_hash = generate_password_hash(new_password)
            
            cursor.execute("""
                UPDATE users 
                SET password_hash = ? 
                WHERE id = ?
            """, (new_hash, user_id))
            
            # Optional: invalidate other sessions here if desired, 
            # but for now we just change the password.
            
            conn.commit()
            return {"success": True}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def _sync_orphaned_data(self, cursor, new_user_id):
        """
        Assign any telemetry recorded with user_id = NULL to the active user.

        Simple tables (activity_logs, file_logs, etc.) can be updated directly.
        daily_stats has a 4-column UNIQUE PK (date, app_name, main_category, user_id),
        so we must merge counts into any existing row before removing the NULL row —
        otherwise a plain UPDATE would violate the constraint when a real-user-id row
        already exists for the same key.
        """
        # Tables where a simple UPDATE is safe (no composite UNIQUE with user_id)
        simple_tables = ["activity_logs", "file_logs", "limit_events", "system_lifecycle"]
        for table in simple_tables:
            try:
                cursor.execute(
                    f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL",
                    (new_user_id,)
                )
            except sqlite3.OperationalError:
                pass

        # daily_stats: composite PK requires merge-then-delete for conflicting rows
        try:
            # Phase 1: find NULL rows that would collide with an existing user row
            cursor.execute("""
                SELECT n.rowid, n.date, n.app_name, n.main_category,
                       n.active_seconds, n.idle_seconds, n.sessions, n.keystrokes, n.clicks
                FROM daily_stats n
                WHERE n.user_id IS NULL
                  AND EXISTS (
                      SELECT 1 FROM daily_stats e
                      WHERE e.date = n.date
                        AND e.app_name = n.app_name
                        AND e.main_category = n.main_category
                        AND e.user_id = ?
                  )
            """, (new_user_id,))
            conflicts = cursor.fetchall()

            for row in conflicts:
                rowid, date, app, cat, active, idle, sessions, keys, clicks = row
                # Accumulate the orphaned counts into the existing user row
                cursor.execute("""
                    UPDATE daily_stats SET
                        active_seconds = active_seconds + ?,
                        idle_seconds   = idle_seconds   + ?,
                        sessions       = sessions       + ?,
                        keystrokes     = keystrokes     + ?,
                        clicks         = clicks         + ?
                    WHERE date = ? AND app_name = ? AND main_category = ? AND user_id = ?
                """, (
                    active or 0, idle or 0, sessions or 0, keys or 0, clicks or 0,
                    date, app, cat, new_user_id
                ))
                # Remove the now-merged NULL row
                cursor.execute("DELETE FROM daily_stats WHERE rowid = ?", (rowid,))

            # Phase 2: safely update any remaining NULL rows (no conflict)
            cursor.execute(
                "UPDATE daily_stats SET user_id = ? WHERE user_id IS NULL",
                (new_user_id,)
            )
        except sqlite3.OperationalError:
            pass
