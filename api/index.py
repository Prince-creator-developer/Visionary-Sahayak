"""
Visionary Sahayak - Vercel Serverless Entry Point
Uses Mangum ASGI adapter to bridge FastAPI (ASGI) → Vercel (Lambda/WSGI)
"""
import os
import sys

# Ensure root project directory is on sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import app

# Mangum wraps FastAPI as a Lambda/Vercel-compatible handler
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    # Fallback: expose the ASGI app directly
    handler = app
