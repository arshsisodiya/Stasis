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


    def auto_login_local_user(self):
        """Auto-login the local system user, creating the account if it doesn't exist."""
        import getpass
        import hashlib
        import uuid
        import secrets
        from datetime import datetime, timedelta
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            username = getpass.getuser()
            
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            user = cursor.fetchone()
            
            if not user:
                user_id = str(uuid.uuid4())
                password_hash = "" # No password needed
                created_at = datetime.now().isoformat()
                
                cursor.execute("""
                    INSERT INTO users (id, username, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                """, (user_id, username, password_hash, created_at))
                
                self._merge_legacy_data(cursor, user_id)
            else:
                user_id = user[0]
                
            token = secrets.token_hex(32)
            hashed_token = hashlib.sha256(token.encode()).hexdigest()
            expires_at = (datetime.now() + timedelta(days=3650)).isoformat()
            
            cursor.execute("""
                INSERT INTO sessions (token, user_id, expires_at)
                VALUES (?, ?, ?)
            """, (hashed_token, user_id, expires_at))
            
            self.active_user_id = user_id
            conn.commit()
            
            return {"success": True, "token": token, "user": {"id": user_id, "username": username}}
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
        """Called once on backend startup to ensure the local user is logged in."""
        result = self.auto_login_local_user()
        if result["success"]:
            print(f"[Auth] Auto-logged in local user: {result['user']['username']}")
        else:
            print(f"[Auth] Auto-login failed: {result.get('error')}")


    def set_active_user_by_token(self, token):
        """Called on startup if frontend provides a saved token"""
        user = self.validate_token(token)
        # Always merge any legacy data (from previous accounts or guest mode) into this single active account
        if user:
            try:
                self._merge_legacy_data(cursor, user["id"])
                conn.commit()
            except Exception as e:
                print(f"Error merging legacy data: {e}")
                conn.rollback()
            self.active_user_id = user["id"]
            
        return user
        
    def update_username(self, user_id, new_username):
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT id FROM users WHERE username = ? AND id != ?", (new_username, user_id))
            if cursor.fetchone():
                return {"success": False, "error": "Username already taken."}
                
            cursor.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user_id))
            conn.commit()
            return {"success": True}
        except Exception as e:
            conn.rollback()
            return {"success": False, "error": str(e)}
        finally:
            conn.close()

    def _merge_legacy_data(self, cursor, active_user_id):
        """
        Sweep the database for data belonging to any other user accounts (legacy accounts)
        or NULL (orphaned guest data), and safely merge them into the active_user_id.
        Finally, delete the empty legacy accounts.
        """
        # Find all legacy user IDs (any ID that is not the active user)
        cursor.execute("SELECT id FROM users WHERE id != ?", (active_user_id,))
        legacy_user_ids = [row[0] for row in cursor.fetchall()]
        
        # Add None to represent Guest data (user_id IS NULL)
        legacy_sources = legacy_user_ids + [None]

        for legacy_id in legacy_sources:
            self._merge_single_legacy_source(cursor, active_user_id, legacy_id)

        # Cleanup: Delete old empty user accounts
        for legacy_id in legacy_user_ids:
            try:
                cursor.execute("DELETE FROM users WHERE id = ?", (legacy_id,))
            except Exception:
                pass


    def _merge_single_legacy_source(self, cursor, new_user_id, legacy_id):
        """
        Merges data from a single legacy_id (which can be None) into new_user_id.
        """
        # Helper to construct WHERE clause and params for the legacy source
        where_clause = "user_id IS NULL" if legacy_id is None else "user_id = ?"
        params_single = (new_user_id,) if legacy_id is None else (legacy_id, new_user_id)
        params_delete = () if legacy_id is None else (legacy_id,)
        params_update = (new_user_id,) if legacy_id is None else (new_user_id, legacy_id)

        # 1. Simple tables (activity_logs, file_logs, limit_events, system_lifecycle)
        simple_tables = ["activity_logs", "file_logs", "limit_events", "system_lifecycle"]
        for table in simple_tables:
            try:
                cursor.execute(
                    f"UPDATE {table} SET user_id = ? WHERE {where_clause}",
                    params_update
                )
            except sqlite3.OperationalError:
                pass

        # 2. Settings & Telegram Settings: merge then migrate safely
        for table in ["settings", "telegram_settings"]:
            try:
                # Find legacy rows that collide with existing user rows
                cursor.execute(f"""
                    SELECT key FROM {table} n
                    WHERE n.{where_clause}
                      AND EXISTS (
                          SELECT 1 FROM {table} e
                          WHERE e.key = n.key AND e.user_id = ?
                      )
                """, params_single)
                colliding_keys = [r[0] for r in cursor.fetchall()]
                
                # For colliding keys, delete the legacy settings (prefer user's existing settings)
                for key in colliding_keys:
                    if legacy_id is None:
                        cursor.execute(f"DELETE FROM {table} WHERE key = ? AND user_id IS NULL", (key,))
                    else:
                        cursor.execute(f"DELETE FROM {table} WHERE key = ? AND user_id = ?", (key, legacy_id))
                
                # Migrate remaining non-colliding legacy settings to the user
                cursor.execute(
                    f"UPDATE {table} SET user_id = ? WHERE {where_clause}",
                    params_update
                )
            except sqlite3.OperationalError:
                pass

        # 3. App Limits & Blocked Apps: merge then migrate safely
        try:
            # app_limits collisions
            cursor.execute(f"""
                SELECT app_name FROM app_limits n
                WHERE n.{where_clause}
                  AND EXISTS (
                      SELECT 1 FROM app_limits e
                      WHERE e.app_name = n.app_name AND e.user_id = ?
                  )
            """, params_single)
            colliding_limits = [r[0] for r in cursor.fetchall()]
            
            for app in colliding_limits:
                if legacy_id is None:
                    cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id IS NULL", (app,))
                else:
                    cursor.execute("DELETE FROM app_limits WHERE app_name = ? AND user_id = ?", (app, legacy_id))
                
            cursor.execute(
                f"UPDATE app_limits SET user_id = ? WHERE {where_clause}",
                params_update
            )
        except sqlite3.OperationalError:
            pass

        try:
            # blocked_apps collisions
            cursor.execute(f"""
                SELECT app_name FROM blocked_apps n
                WHERE n.{where_clause}
                  AND EXISTS (
                      SELECT 1 FROM blocked_apps e
                      WHERE e.app_name = n.app_name AND e.user_id = ?
                  )
            """, params_single)
            colliding_blocked = [r[0] for r in cursor.fetchall()]
            
            for app in colliding_blocked:
                if legacy_id is None:
                    cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id IS NULL", (app,))
                else:
                    cursor.execute("DELETE FROM blocked_apps WHERE app_name = ? AND user_id = ?", (app, legacy_id))
                
            cursor.execute(
                f"UPDATE blocked_apps SET user_id = ? WHERE {where_clause}",
                params_update
            )
        except sqlite3.OperationalError:
            pass

        # 4. Goals & Goal Logs: merge goals and migrate goal logs carefully
        try:
            # Find goals by goal_type to handle conflicts
            if legacy_id is None:
                cursor.execute("SELECT id, goal_type FROM goals WHERE user_id IS NULL")
            else:
                cursor.execute("SELECT id, goal_type FROM goals WHERE user_id = ?", (legacy_id,))
            legacy_goals = cursor.fetchall()
            
            for g_id, g_type in legacy_goals:
                # Check if user already has a goal of this type
                cursor.execute("SELECT id FROM goals WHERE goal_type = ? AND user_id = ?", (g_type, new_user_id))
                user_goal = cursor.fetchone()
                
                if user_goal:
                    user_goal_id = user_goal[0]
                    # Collision! Migrate legacy goal_logs to the existing user_goal_id
                    cursor.execute("SELECT date FROM goal_logs WHERE goal_id = ?", (g_id,))
                    legacy_log_dates = [r[0] for r in cursor.fetchall()]
                    
                    for date in legacy_log_dates:
                        # Check if user goal already has a log on this date
                        cursor.execute("SELECT 1 FROM goal_logs WHERE goal_id = ? AND date = ?", (user_goal_id, date))
                        if cursor.fetchone():
                            # Collision in logs, delete the legacy log
                            cursor.execute("DELETE FROM goal_logs WHERE goal_id = ? AND date = ?", (g_id, date))
                        else:
                            # Safe to migrate log to user goal
                            cursor.execute("UPDATE goal_logs SET goal_id = ? WHERE goal_id = ? AND date = ?", (user_goal_id, g_id, date))
                    
                    # Delete the duplicate legacy goal
                    cursor.execute("DELETE FROM goals WHERE id = ?", (g_id,))
                else:
                    # No collision, just migrate the goal to the user
                    cursor.execute("UPDATE goals SET user_id = ? WHERE id = ?", (new_user_id, g_id))
        except sqlite3.OperationalError:
            pass

        # 5. Daily Stats: merge safely using composite PK
        try:
            if legacy_id is None:
                cursor.execute("SELECT date, app_name, main_category, sub_category, active_seconds, idle_seconds, sessions, keystrokes, clicks FROM daily_stats WHERE user_id IS NULL")
            else:
                cursor.execute("SELECT date, app_name, main_category, sub_category, active_seconds, idle_seconds, sessions, keystrokes, clicks FROM daily_stats WHERE user_id = ?", (legacy_id,))
            
            legacy_stats = cursor.fetchall()
            
            for row in legacy_stats:
                date, app_name, main_cat, sub_cat, act_sec, idl_sec, sess, keys, clicks = row
                
                # Check if user already has a stat row for this (date, app_name, main_category)
                cursor.execute("""
                    SELECT active_seconds, idle_seconds, sessions, keystrokes, clicks 
                    FROM daily_stats 
                    WHERE date = ? AND app_name = ? AND main_category = ? AND user_id = ?
                """, (date, app_name, main_cat, new_user_id))
                
                existing = cursor.fetchone()
                
                if existing:
                    # Merge data
                    e_act, e_idl, e_sess, e_keys, e_clicks = existing
                    cursor.execute("""
                        UPDATE daily_stats 
                        SET active_seconds = ?, idle_seconds = ?, sessions = ?, keystrokes = ?, clicks = ?
                        WHERE date = ? AND app_name = ? AND main_category = ? AND user_id = ?
                    """, (
                        (e_act or 0) + (act_sec or 0),
                        (e_idl or 0) + (idl_sec or 0),
                        (e_sess or 0) + (sess or 0),
                        (e_keys or 0) + (keys or 0),
                        (e_clicks or 0) + (clicks or 0),
                        date, app_name, main_cat, new_user_id
                    ))
                    # Delete the old legacy row
                    if legacy_id is None:
                        cursor.execute("DELETE FROM daily_stats WHERE date = ? AND app_name = ? AND main_category = ? AND user_id IS NULL", (date, app_name, main_cat))
                    else:
                        cursor.execute("DELETE FROM daily_stats WHERE date = ? AND app_name = ? AND main_category = ? AND user_id = ?", (date, app_name, main_cat, legacy_id))
                else:
                    # Simply migrate the legacy row to the user
                    if legacy_id is None:
                        cursor.execute("UPDATE daily_stats SET user_id = ? WHERE date = ? AND app_name = ? AND main_category = ? AND user_id IS NULL", (new_user_id, date, app_name, main_cat))
                    else:
                        cursor.execute("UPDATE daily_stats SET user_id = ? WHERE date = ? AND app_name = ? AND main_category = ? AND user_id = ?", (new_user_id, date, app_name, main_cat, legacy_id))
        except sqlite3.OperationalError:
            pass


