import os
import io
import time
import uuid
import base64
import socket
import tempfile
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import qrcode
import qrcode.image.svg

from gemini_engine import UniversalHardwareOrchestrator
from database import init_db, save_session, save_media_record, get_all_records, get_all_sessions

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Find templates directory across local and Vercel serverless environments
possible_dirs = [
    os.path.join(BASE_DIR, "templates"),
    os.path.join(os.getcwd(), "templates"),
    os.path.join(os.path.dirname(BASE_DIR), "templates"),
    "/var/task/templates"
]
TEMPLATES_DIR = next((d for d in possible_dirs if os.path.exists(d)), os.path.join(BASE_DIR, "templates"))

# Safe temp directories for media
MEDIA_DIR = os.path.join(tempfile.gettempdir(), "visionary_media")
os.makedirs(MEDIA_DIR, exist_ok=True)

# Initialize app
app = FastAPI(
    title="Visionary Sahayak - Autonomous Hardware Diagnostic & Repair Suite",
    version="3.0.0",
    description="Multi-Agent AI Hardware Service Engineer replacing human customer care for any device"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vercel Path Normalizer Middleware
@app.middleware("http")
async def vercel_path_normalizer(request: Request, call_next):
    path = request.scope.get("path", "")
    if path.startswith("/api/index.py"):
        new_path = path[len("/api/index.py"):] or "/"
        request.scope["path"] = new_path
    elif path.startswith("/api/index"):
        new_path = path[len("/api/index"):] or "/"
        request.scope["path"] = new_path
    return await call_next(request)

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)
ai_orchestrator = UniversalHardwareOrchestrator()

def safe_render_template(template_name: str, context: dict) -> HTMLResponse:
    try:
        return templates.TemplateResponse(template_name, context)
    except Exception as err:
        print(f"[Template Warning] {err}. Falling back to direct filesystem template loader.")
        for root in [BASE_DIR, os.getcwd(), os.path.dirname(BASE_DIR), "/var/task"]:
            path = os.path.join(root, "templates", template_name)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    html = f.read()
                # Substitute simple string placeholders
                for k, v in context.items():
                    if isinstance(v, str):
                        html = html.replace(f"{{{{ {k} }}}}", v)
                return HTMLResponse(content=html)
        return HTMLResponse(content=f"<h3>Error loading template '{template_name}'</h3><p>{err}</p>", status_code=500)

def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# In-Memory Stream Hub
class StreamManager:
    def __init__(self):
        self.active_desktops: List[WebSocket] = []
        self.active_mobiles: List[WebSocket] = []
        self.latest_frame: Optional[str] = None
        self.active_session_id: str = str(uuid.uuid4())[:8]

    async def connect_desktop(self, websocket: WebSocket):
        await websocket.accept()
        self.active_desktops.append(websocket)
        await websocket.send_json({
            "type": "status",
            "mobile_connected": len(self.active_mobiles) > 0 or self.latest_frame is not None,
            "session_id": self.active_session_id
        })

    async def connect_mobile(self, websocket: WebSocket):
        await websocket.accept()
        self.active_mobiles.append(websocket)
        await self.broadcast_to_desktops({
            "type": "mobile_status",
            "connected": True,
            "message": "Mobile Camera Lens Paired"
        })

    def disconnect_desktop(self, websocket: WebSocket):
        if websocket in self.active_desktops:
            self.active_desktops.remove(websocket)

    async def disconnect_mobile(self, websocket: WebSocket):
        if websocket in self.active_mobiles:
            self.active_mobiles.remove(websocket)
        await self.broadcast_to_desktops({
            "type": "mobile_status",
            "connected": len(self.active_mobiles) > 0,
            "message": "Mobile Camera Disconnected"
        })

    async def broadcast_frame_from_mobile(self, frame_b64: str):
        self.latest_frame = frame_b64
        for desktop in list(self.active_desktops):
            try:
                await desktop.send_json({
                    "type": "frame",
                    "data": frame_b64,
                    "timestamp": time.time()
                })
            except Exception:
                self.disconnect_desktop(desktop)

    async def broadcast_to_desktops(self, payload: dict):
        for desktop in list(self.active_desktops):
            try:
                await desktop.send_json(payload)
            except Exception:
                self.disconnect_desktop(desktop)

stream_manager = StreamManager()

# --- Page Views ---

@app.get("/", response_class=HTMLResponse)
@app.get("/api/index.py", response_class=HTMLResponse)
@app.get("/api/index", response_class=HTMLResponse)
@app.get("/api", response_class=HTMLResponse)
async def dashboard_view(request: Request):
    lan_ip = get_lan_ip()
    host_header = request.headers.get("host", f"{lan_ip}:8000")
    protocol = "https" if "vercel" in host_header or request.url.scheme == "https" else "http"
    mobile_url = f"{protocol}://{host_header}/mobile"

    return safe_render_template("dashboard.html", {
        "request": request,
        "lan_ip": lan_ip,
        "mobile_url": mobile_url,
        "team": {
            "lead": "Prince Kumar",
            "usn_lead": "1BG24CS133",
            "co_author": "Yash Sharma",
            "usn_co": "1BG24CS186"
        }
    })

@app.get("/mobile", response_class=HTMLResponse)
@app.get("/api/index.py/mobile", response_class=HTMLResponse)
@app.get("/api/mobile", response_class=HTMLResponse)
async def mobile_view(request: Request):
    lan_ip = get_lan_ip()
    return safe_render_template("mobile.html", {
        "request": request,
        "lan_ip": lan_ip
    })

@app.get("/qr")
@app.get("/api/index.py/qr")
@app.get("/api/qr")
async def generate_qr(request: Request):
    host_header = request.headers.get("host", f"{get_lan_ip()}:8000")
    protocol = "https" if "vercel" in host_header or request.url.scheme == "https" else "http"
    mobile_url = f"{protocol}://{host_header}/mobile"

    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(mobile_url, image_factory=factory, box_size=10)
    
    buf = io.BytesIO()
    img.save(buf)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")

# --- AI Conversational Triage & Diagnostics ---

@app.post("/api/chat")
async def diagnostic_chat(payload: Dict[str, Any]):
    message = payload.get("message", "")
    history = payload.get("history", [])
    image_b64 = payload.get("image")
    api_key = payload.get("api_key")

    res = ai_orchestrator.conduct_diagnostic_chat(history, message, image_b64, api_key=api_key)
    return res

@app.post("/api/diagnose")
async def diagnose_device(payload: Dict[str, Any]):
    image_b64 = payload.get("image")
    problem = payload.get("prompt", "")
    device_hint = payload.get("device_hint", "auto")
    api_key = payload.get("api_key")

    if not image_b64:
        return JSONResponse(status_code=400, content={"error": "No image frame provided for analysis."})

    result = ai_orchestrator.orchestrate_hardware_repair(image_b64, problem, device_hint, api_key=api_key)

    session_data = {
        "id": stream_manager.active_session_id,
        "device_name": result.get("device_name"),
        "category": result.get("category"),
        "fault_detected": result.get("fault_detected"),
        "confidence_score": result.get("confidence_score"),
        "status": "DIAGNOSED",
        "total_steps": len(result.get("repair_steps", [])),
        "completed_steps": 0
    }
    save_session(session_data)

    return result

@app.post("/api/verify-step")
async def verify_step(payload: Dict[str, Any]):
    image_b64 = payload.get("image", "")
    current_step_index = payload.get("current_step_index", 1)
    total_steps = payload.get("total_steps", 4)

    verification = ai_orchestrator.verify_repair_step(image_b64, current_step_index, total_steps)
    return verification

# --- Frame Streaming & Media ---

@app.post("/api/stream/frame")
async def post_stream_frame(payload: Dict[str, Any]):
    frame_b64 = payload.get("frame")
    if frame_b64:
        stream_manager.latest_frame = frame_b64
        await stream_manager.broadcast_to_desktops({
            "type": "frame",
            "data": frame_b64,
            "timestamp": time.time()
        })
        return {"status": "ok"}
    return JSONResponse(status_code=400, content={"error": "No frame data"})

@app.get("/api/stream/latest")
async def get_latest_frame():
    return {
        "frame": stream_manager.latest_frame,
        "mobile_connected": len(stream_manager.active_mobiles) > 0 or stream_manager.latest_frame is not None,
        "session_id": stream_manager.active_session_id
    }

@app.post("/api/save-snapshot")
async def save_snapshot(payload: Dict[str, Any]):
    image_b64 = payload.get("image", "")
    notes = payload.get("notes", "Captured Diagnostic Inspection")

    if not image_b64:
        return JSONResponse(status_code=400, content={"error": "Missing image"})

    clean_b64 = image_b64.split(",")[-1]
    img_data = base64.b64decode(clean_b64)

    filename = f"snapshot_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
    filepath = os.path.join(MEDIA_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(img_data)

    save_media_record(
        session_id=stream_manager.active_session_id,
        media_type="snapshot",
        file_path=f"/media/snapshots/{filename}",
        file_name=filename,
        file_size=len(img_data),
        notes=notes
    )

    return {"status": "success", "file_url": f"/media/snapshots/{filename}", "filename": filename}

@app.post("/api/save-recording")
async def save_recording(video: UploadFile = File(...), notes: str = Form("Live Hardware Session")):
    filename = f"recording_{int(time.time())}_{uuid.uuid4().hex[:6]}.webm"
    filepath = os.path.join(MEDIA_DIR, filename)

    content = await video.read()
    with open(filepath, "wb") as f:
        f.write(content)

    save_media_record(
        session_id=stream_manager.active_session_id,
        media_type="video_recording",
        file_path=f"/media/recordings/{filename}",
        file_name=filename,
        file_size=len(content),
        notes=notes
    )

    return {"status": "success", "file_url": f"/media/recordings/{filename}", "filename": filename}

@app.get("/media/{media_type}/{filename}")
async def get_media_file(media_type: str, filename: str):
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(MEDIA_DIR, safe_filename)
    if os.path.exists(filepath):
        return FileResponse(filepath)
    return JSONResponse(status_code=404, content={"error": "Media not found"})

@app.get("/api/records")
async def list_records():
    return {"records": get_all_records(), "sessions": get_all_sessions()}

# --- WebSocket Stream ---

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    role = websocket.query_params.get("role", "desktop")
    if role == "mobile":
        await stream_manager.connect_mobile(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                await stream_manager.broadcast_frame_from_mobile(data)
        except WebSocketDisconnect:
            await stream_manager.disconnect_mobile(websocket)
    else:
        await stream_manager.connect_desktop(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            stream_manager.disconnect_desktop(websocket)

# Entrypoint for local execution
if __name__ == "__main__":
    import uvicorn
    init_db()
    lan_ip = get_lan_ip()
    print("=" * 65)
    print("🚀 Visionary Sahayak v3.0 - Autonomous Hardware Diagnostic Suite")
    print(f"💻 Desktop Operator Console: http://localhost:8000")
    print(f"📱 Mobile Camera Lens:      http://{lan_ip}:8000/mobile")
    print("=" * 65)
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
