import base64
import os
import json
import sqlite3
from typing import Optional, Dict, Any, List
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet, InvalidToken
from src.database.database import get_connection

class BackupService:
    TABLES = [
        "settings",
        "telegram_settings",
        "app_limits",
        "blocked_apps",
        "goals",
        "goal_logs",
        "daily_stats",
        "activity_logs",
        "file_logs",
        "limit_events",
        "system_lifecycle"
    ]

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000
        )
        key_bytes = kdf.derive(password.encode())
        return base64.urlsafe_b64encode(key_bytes)

    def encrypt_data(self, data_str: str, password: str) -> bytes:
        """Encrypt JSON string using password-derived PBKDF2HMAC key and Fernet"""
        salt = os.urandom(16)
        key = self._derive_key(password, salt)
        fernet = Fernet(key)
        ciphertext = fernet.encrypt(data_str.encode("utf-8"))
        # Prepend the 16-byte salt to the ciphertext
        return salt + ciphertext

    def decrypt_data(self, backup_payload: bytes, password: str) -> str:
        """Decrypt backup payload using the password"""
        if len(backup_payload) < 17:
            raise ValueError("Invalid backup file: Payload too short.")
        
        salt = backup_payload[:16]
        ciphertext = backup_payload[16:]
        
        try:
            key = self._derive_key(password, salt)
            fernet = Fernet(key)
            decrypted_bytes = fernet.decrypt(ciphertext)
            return decrypted_bytes.decode("utf-8")
        except InvalidToken:
            raise ValueError("Invalid decryption password or corrupted backup file.")

    def export_data(self, user_id: Optional[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Export all scoped user data across all tables into a dictionary representation"""
        conn = get_connection()
        cursor = conn.cursor()
        exported_payload = {}

        try:
            for table in self.TABLES:
                # 1. Query table column details
                cursor.execute(f"PRAGMA table_info({table})")
                columns = [col[1] for col in cursor.fetchall()]
                
                # We always exclude 'user_id' because we'll re-scope on import
                select_cols = [c for c in columns if c != "user_id"]
                
                if not select_cols:
                    continue

                # 2. Build the query filter for active user context
                if user_id is not None:
                    query = f"SELECT {', '.join(select_cols)} FROM {table} WHERE user_id = ?"
                    params = (user_id,)
                else:
                    query = f"SELECT {', '.join(select_cols)} FROM {table} WHERE user_id IS NULL"
                    params = ()
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                # Map to list of dicts
                table_data = []
                for row in rows:
                    row_dict = {}
                    for i, col_name in enumerate(select_cols):
                        row_dict[col_name] = row[i]
                    table_data.append(row_dict)
                
                exported_payload[table] = table_data
            
            return exported_payload
        finally:
            conn.close()

    def import_data(self, user_id: Optional[str], backup_data: Dict[str, List[Dict[str, Any]]]) -> None:
        """
        Delete existing active user data and import/restore the backup payload under
        the current user_id context, resolving PK and FK mappings.
        """
        # Validate keys in backup payload
        for table in self.TABLES:
            if table not in backup_data:
                raise ValueError(f"Corrupt backup file: Missing table data for '{table}'.")

        conn = get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("BEGIN TRANSACTION")

            # 1. Clear all existing data for the active user context across all tables
            for table in self.TABLES:
                if user_id is not None:
                    cursor.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
                else:
                    cursor.execute(f"DELETE FROM {table} WHERE user_id IS NULL")

            # 2. Import Goals first because goal_logs has a foreign key referencing goals.id
            goal_id_mapping = {}  # maps old goal_id -> new goal_id
            goals_list = backup_data.get("goals", [])
            for goal in goals_list:
                old_id = goal.get("id")
                # Exclude autoincremented ID from insert columns to let SQLite auto-generate a fresh, globally unique ID
                insert_cols = [c for c in goal.keys() if c not in ("id", "user_id")]
                values = [goal[c] for c in insert_cols]
                
                # Append user_id
                insert_cols.append("user_id")
                values.append(user_id)
                
                query = f"INSERT INTO goals ({', '.join(insert_cols)}) VALUES ({', '.join(['?'] * len(insert_cols))})"
                cursor.execute(query, values)
                new_id = cursor.lastrowid
                
                if old_id is not None:
                    goal_id_mapping[old_id] = new_id

            # 3. Import all other tables
            for table in self.TABLES:
                if table == "goals":
                    continue  # Already processed

                rows = backup_data.get(table, [])
                if not rows:
                    continue

                for row in rows:
                    # Clean/prepare row attributes
                    # Exclude auto-incrementing non-FK primary key 'id' to avoid collisions, letting SQLite generate fresh ones.
                    # Exception: keep goal_id in goal_logs but map it.
                    exclude_keys = ["user_id"]
                    if "id" in row:
                        exclude_keys.append("id")
                    
                    insert_cols = [c for c in row.keys() if c not in exclude_keys]
                    values = []
                    for c in insert_cols:
                        val = row[c]
                        if table == "goal_logs" and c == "goal_id":
                            # Re-map goal_id to the new autoincremented ID
                            val = goal_id_mapping.get(val, val)
                        values.append(val)

                    # Append active user_id
                    insert_cols.append("user_id")
                    values.append(user_id)

                    query = f"INSERT INTO {table} ({', '.join(insert_cols)}) VALUES ({', '.join(['?'] * len(insert_cols))})"
                    cursor.execute(query, values)

            cursor.execute("COMMIT")
        except Exception as e:
            cursor.execute("ROLLBACK")
            raise e
        finally:
            conn.close()
