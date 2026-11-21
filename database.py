import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

IS_VERCEL = bool(os.environ.get("VERCEL"))
if IS_VERCEL:
    DB_PATH = "/tmp/visionary_sahayak.db"
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "visionary_sahayak.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Inspection Sessions
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
    
    # Snapshots & Recordings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS media_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        media_type TEXT, -- 'snapshot' or 'video_recording'
        file_path TEXT,
        file_name TEXT,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
    )
    """)

    # Repair Steps Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS repair_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        step_number INTEGER,
        step_instruction TEXT,
        verified_at TIMESTAMP,
        status TEXT
    )
    """)

    conn.commit()
    conn.close()

def save_session(session_data: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
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

def save_media_record(session_id: str, media_type: str, file_path: str, file_name: str, file_size: int, notes: str = ""):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO media_records (session_id, media_type, file_path, file_name, file_size, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (session_id, media_type, file_path, file_name, file_size, notes))
    conn.commit()
    conn.close()

def get_all_records() -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM media_records ORDER BY created_at DESC LIMIT 50
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_all_sessions() -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

init_db()
