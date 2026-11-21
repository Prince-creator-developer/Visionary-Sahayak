import os
import json
import tempfile
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

# In-Memory Fallback Cache to guarantee 100% uptime on Serverless platforms (Vercel / AWS Lambda)
MEMORY_SESSIONS = []
MEMORY_RECORDS = []

def get_connection():
    try:
        # Check if local directory is writable
        db_path = os.path.join(tempfile.gettempdir(), "visionary_sahayak.db")
        conn = sqlite3.connect(db_path, timeout=5)
        return conn
    except Exception:
        # Fallback to pure in-memory SQLite
        return sqlite3.connect(":memory:")

def init_db():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            device_name TEXT,
            category TEXT,
            fault_detected TEXT,
            confidence_score REAL,
            status TEXT,
            total_steps INTEGER,
            completed_steps INTEGER
        )
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS media_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            media_type TEXT,
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
        """)

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Database Init Notice] Running in memory mode ({e})")

def save_session(session_data: Dict[str, Any]):
    MEMORY_SESSIONS.append(session_data)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT OR REPLACE INTO sessions (id, device_name, category, fault_detected, confidence_score, status, total_steps, completed_steps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_data.get("id"),
            session_data.get("device_name", "Unknown Hardware"),
            session_data.get("category", "General Electronics"),
            session_data.get("fault_detected", "Pending Triage"),
            session_data.get("confidence_score", 0.0),
            session_data.get("status", "ACTIVE"),
            session_data.get("total_steps", 0),
            session_data.get("completed_steps", 0)
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Session Save Warning] Cached in memory: {e}")

def save_media_record(session_id: str, media_type: str, file_path: str, file_name: str, file_size: int, notes: str = ""):
    record = {
        "session_id": session_id,
        "media_type": media_type,
        "file_path": file_path,
        "file_name": file_name,
        "file_size": file_size,
        "created_at": datetime.now().isoformat(),
        "notes": notes
    }
    MEMORY_RECORDS.insert(0, record)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO media_records (session_id, media_type, file_path, file_name, file_size, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (session_id, media_type, file_path, file_name, file_size, notes))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Media Save Warning] Cached in memory: {e}")

def get_all_records() -> List[Dict[str, Any]]:
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media_records ORDER BY created_at DESC LIMIT 50")
        rows = cursor.fetchall()
        conn.close()
        db_records = [dict(r) for r in rows]
        if db_records:
            return db_records
    except Exception:
        pass
    return MEMORY_RECORDS[:50]

def get_all_sessions() -> List[Dict[str, Any]]:
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20")
        rows = cursor.fetchall()
        conn.close()
        db_sessions = [dict(r) for r in rows]
        if db_sessions:
            return db_sessions
    except Exception:
        pass
    return MEMORY_SESSIONS[:20]

# Safe initialization
init_db()
