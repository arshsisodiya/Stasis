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
            
            # Note: We do NOT sync orphaned data here anymore.
            # It's explicitly merged via /api/auth/sync-guest when user confirms.
            
            conn.commit()
            return {"success": True, "user": {"id": user_id, "username": username}}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def login(self, username, password):
        """Login user, set active user, and create session"""
        import hashlib
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()
            
            if not user or not check_password_hash(user[2], password):
                return {"success": False, "error": "Invalid username or password"}
                
            user_id = user[0]
            token = secrets.token_hex(32)
            hashed_token = hashlib.sha256(token.encode()).hexdigest()
            # Session valid for 30 days
            expires_at = (datetime.now() + timedelta(days=30)).isoformat()
            
            cursor.execute("""
                INSERT INTO sessions (token, user_id, expires_at)
                VALUES (?, ?, ?)
            """, (hashed_token, user_id, expires_at))
            
            # Set global active user
            self.active_user_id = user_id
            
            # Note: We do NOT sync orphaned data here anymore.
            # It's explicitly merged via /api/auth/sync-guest when user confirms.
            
            conn.commit()
            return {"success": True, "token": token, "user": {"id": user_id, "username": user[1]}}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def logout(self, token):
        """Logout user and destroy session"""
        import hashlib
        conn = get_connection()
        cursor = conn.cursor()
        try:
            hashed_token = hashlib.sha256(token.encode()).hexdigest()
            cursor.execute("DELETE FROM sessions WHERE token = ?", (hashed_token,))
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
            
        import hashlib
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Check expiration
            now = datetime.now().isoformat()
            
            # Cleanup expired sessions first
            cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.commit()
            
            hashed_token = hashlib.sha256(token.encode()).hexdigest()
            cursor.execute("""
                SELECT u.id, u.username 
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at >= ?
            """, (hashed_token, now))
            
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

    def get_guest_summary(self):
        """Get summary of unsynced (guest) data for popup display"""
        conn = get_connection()
        cursor = conn.cursor()
        try:
            # Get total seconds and date range
            cursor.execute("""
                SELECT 
                    SUM(active_seconds) as total_seconds,
                    MIN(date) as min_date,
                    MAX(date) as max_date,
                    COUNT(*) as record_count
                FROM daily_stats 
                WHERE user_id IS NULL
            """)
            stats = cursor.fetchone()
            
            total_seconds = stats[0] or 0
            if total_seconds == 0:
                return None
                
            min_date = stats[1]
            max_date = stats[2]
            record_count = stats[3] or 0
            
            # Get top 3 apps
            cursor.execute("""
                SELECT app_name, SUM(active_seconds) as total_active
                FROM daily_stats
                WHERE user_id IS NULL
                GROUP BY app_name
                ORDER BY total_active DESC
                LIMIT 3
            """)
            top_apps = [{"name": row[0], "seconds": row[1]} for row in cursor.fetchall()]
            
            return {
                "total_seconds": total_seconds,
                "min_date": min_date,
                "max_date": max_date,
                "record_count": record_count,
                "top_apps": top_apps
            }
        finally:
            conn.close()

    def discard_guest_data(self):
        """Delete all NULL-user rows from DB"""
        conn = get_connection()
        cursor = conn.cursor()
        try:
            tables = ["activity_logs", "file_logs", "daily_stats", "limit_events", "system_lifecycle"]
            for table in tables:
                try:
                    cursor.execute(f"DELETE FROM {table} WHERE user_id IS NULL")
                except sqlite3.OperationalError:
                    pass
            conn.commit()
            return {"success": True}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def sync_guest_data_for_user(self, user_id):
        """Explicitly merge guest data for a user"""
        conn = get_connection()
        cursor = conn.cursor()
        try:
            self._sync_orphaned_data(cursor, user_id)
            conn.commit()
            return {"success": True}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def _sync_orphaned_data(self, cursor, new_user_id):
        """
        Assign any telemetry and configurations recorded with user_id = NULL to the active user.
        """
        # 1. Simple tables (activity_logs, file_logs, limit_events, system_lifecycle)
        simple_tables = ["activity_logs", "file_logs", "limit_events", "system_lifecycle"]
        for table in simple_tables:
            try:
                cursor.execute(
                    f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL",
                    (new_user_id,)
                )
            except sqlite3.OperationalError:
                pass

        # 2. Settings & Telegram Settings: merge then migrate safely
        for table in ["settings", "telegram_settings"]:
            try:
                # Find guest rows that collide with existing user rows
                cursor.execute(f"""
                    SELECT key FROM {table} n
                    WHERE n.user_id IS NULL
                      AND EXISTS (
                          SELECT 1 FROM {table} e
                          WHERE e.key = n.key AND e.user_id = ?
                      )
                """, (new_user_id,))
                colliding_keys = [r[0] for r in cursor.fetchall()]
                
                # For colliding keys, delete the guest settings (prefer user's existing settings)
                for key in colliding_keys:
                    cursor.execute(f"DELETE FROM {table} WHERE key = ? AND user_id IS NULL", (key,))
                
                # Migrate remaining non-colliding guest settings to the user
                cursor.execute(
                    f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL",
                    (new_user_id,)
                )
            except sqlite3.OperationalError:
                pass

        # 3. App Limits & Blocked Apps: merge then migrate safely
        try:
            # app_limits collisions
            cursor.execute("""
                SELECT app_name FROM app_limits n
                WHERE n.user_id IS NULL
                  AND EXISTS (
                      SELECT 1 FROM app_limits e
                      WHERE e.app_name = n.app_name AND e.user_id = ?
                  )
            """, (new_user_id,))
            colliding_limits = [r[0] for r in cursor.fetchall()]
            
            for app in colliding_limits:
                cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id IS NULL", (app,))
                
            cursor.execute(
                "UPDATE app_limits SET user_id = ? WHERE user_id IS NULL",
                (new_user_id,)
            )
        except sqlite3.OperationalError:
            pass

        try:
            # blocked_apps collisions
            cursor.execute("""
                SELECT app_name FROM blocked_apps n
                WHERE n.user_id IS NULL
                  AND EXISTS (
                      SELECT 1 FROM blocked_apps e
                      WHERE e.app_name = n.app_name AND e.user_id = ?
                  )
            """, (new_user_id,))
            colliding_blocked = [r[0] for r in cursor.fetchall()]
            
            for app in colliding_blocked:
                cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app,))
                
            cursor.execute(
                "UPDATE blocked_apps SET user_id = ? WHERE user_id IS NULL",
                (new_user_id,)
            )
        except sqlite3.OperationalError:
            pass

        # 4. Goals & Goal Logs: merge goals and migrate goal logs carefully
        try:
            # Find goals by goal_type to handle conflicts
            cursor.execute("SELECT id, goal_type FROM goals WHERE user_id IS NULL")
            guest_goals = cursor.fetchall()
            
            for g_id, g_type in guest_goals:
                # Check if user already has a goal of this type
                cursor.execute("SELECT id FROM goals WHERE goal_type = ? AND user_id = ?", (g_type, new_user_id))
                user_goal = cursor.fetchone()
                
                if user_goal:
                    user_goal_id = user_goal[0]
                    # Collision! Migrate guest goal_logs to the existing user_goal_id
                    cursor.execute("SELECT date FROM goal_logs WHERE goal_id = ?", (g_id,))
                    guest_log_dates = [r[0] for r in cursor.fetchall()]
                    
                    for date in guest_log_dates:
                        # Check if user goal already has a log on this date
                        cursor.execute("SELECT 1 FROM goal_logs WHERE goal_id = ? AND date = ?", (user_goal_id, date))
                        if cursor.fetchone():
                            # Collision in logs, delete the guest log
                            cursor.execute("DELETE FROM goal_logs WHERE goal_id = ? AND date = ?", (g_id, date))
                        else:
                            # Update guest log to match user goal_id and set user_id
                            cursor.execute("""
                                UPDATE goal_logs 
                                SET goal_id = ?, user_id = ? 
                                WHERE goal_id = ? AND date = ?
                            """, (user_goal_id, new_user_id, g_id, date))
                    
                    # Delete guest goal
                    cursor.execute("DELETE FROM goals WHERE id = ?", (g_id,))
                else:
                    # No collision! Simply update goal to the user
                    cursor.execute("UPDATE goals SET user_id = ? WHERE id = ?", (new_user_id, g_id))
                    # And set user_id for all goal_logs belonging to this goal
                    cursor.execute("UPDATE goal_logs SET user_id = ? WHERE goal_id = ?", (new_user_id, g_id))
        except sqlite3.OperationalError:
            pass

        # 5. daily_stats: composite PK requires merge-then-delete for conflicting rows
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
