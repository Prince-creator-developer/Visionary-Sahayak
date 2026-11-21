import os
import io
import time
import uuid
import base64
import socket
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import qrcode
from PIL import Image

from gemini_engine import MultimodalRepairEngine
from database import init_db, save_session, save_media_record, get_all_records, get_all_sessions

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

IS_VERCEL = bool(os.environ.get("VERCEL"))
if IS_VERCEL:
    RECORDINGS_DIR = "/tmp/recordings"
    SNAPSHOTS_DIR = "/tmp/snapshots"
else:
    RECORDINGS_DIR = os.path.join(BASE_DIR, "recordings")
    SNAPSHOTS_DIR = os.path.join(BASE_DIR, "snapshots")

for d in [STATIC_DIR, TEMPLATES_DIR, RECORDINGS_DIR, SNAPSHOTS_DIR]:
    os.makedirs(d, exist_ok=True)

# Initialize app
app = FastAPI(
    title="Visionary Sahayak - GenAI Multimodal Hardware Repair Platform",
    version="2.0.0",
    description="Real-time Mobile Camera Streaming, GenAI Defect Diagnosis, and Interactive Step-by-Step Hardware Repair System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/recordings", StaticFiles(directory=RECORDINGS_DIR), name="recordings")
app.mount("/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")

templates = Jinja2Templates(directory=TEMPLATES_DIR)
ai_engine = MultimodalRepairEngine()

def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# WebSocket Stream Manager
class StreamManager:
    def __init__(self):
        self.active_desktops: List[WebSocket] = []
        self.active_mobiles: List[WebSocket] = []
        self.latest_frame: Optional[str] = None
        self.active_session_id: str = str(uuid.uuid4())[:8]

    async def connect_desktop(self, websocket: WebSocket):
        await websocket.accept()
        self.active_desktops.append(websocket)
        # Notify desktop of current mobile connection state
        await websocket.send_json({
            "type": "status",
            "mobile_connected": len(self.active_mobiles) > 0,
            "session_id": self.active_session_id
        })

    async def connect_mobile(self, websocket: WebSocket):
        await websocket.accept()
        self.active_mobiles.append(websocket)
        # Notify desktops that mobile camera is connected
        await self.broadcast_to_desktops({
            "type": "mobile_status",
            "connected": True,
            "message": "Mobile Camera Paired & Active!"
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
        # Relay to all listening desktops
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

# --- HTTP Frame Stream Fallback (Vercel Serverless Compatible) ---

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
        return {"status": "ok", "timestamp": time.time()}
    return JSONResponse(status_code=400, content={"error": "No frame data"})

@app.get("/api/stream/latest")
async def get_latest_frame():
    return {
        "frame": stream_manager.latest_frame,
        "mobile_connected": len(stream_manager.active_mobiles) > 0 or stream_manager.latest_frame is not None,
        "session_id": stream_manager.active_session_id
    }

# --- Routes ---

@app.get("/", response_class=HTMLResponse)
async def dashboard_view(request: Request):
    lan_ip = get_lan_ip()
    mobile_url = f"http://{lan_ip}:8000/mobile"
    return templates.TemplateResponse("dashboard.html", {
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
async def mobile_camera_view(request: Request):
    lan_ip = get_lan_ip()
    return templates.TemplateResponse("mobile.html", {
        "request": request,
        "lan_ip": lan_ip
    })

@app.get("/qr")
async def generate_qr():
    lan_ip = get_lan_ip()
    mobile_url = f"http://{lan_ip}:8000/mobile"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
    )
    qr.add_data(mobile_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#00ffcc", back_color="#0f172a")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

@app.get("/api/info")
async def get_sys_info():
    lan_ip = get_lan_ip()
    return {
        "status": "online",
        "lan_ip": lan_ip,
        "mobile_url": f"http://{lan_ip}:8000/mobile",
        "mobile_connected": len(stream_manager.active_mobiles) > 0,
        "active_desktops": len(stream_manager.active_desktops),
        "session_id": stream_manager.active_session_id
    }

@app.post("/api/diagnose")
async def diagnose_device(payload: Dict[str, Any]):
    image_b64 = payload.get("image")
    user_prompt = payload.get("prompt", "")
    device_hint = payload.get("device_hint", "auto")

    if not image_b64:
        return JSONResponse(status_code=400, content={"error": "No image frame provided"})

    result = ai_engine.orchestrate_pipeline(image_b64, user_prompt, device_hint)
    
    # Save diagnostic session in database
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
    total_steps = payload.get("total_steps", 5)

    verification = ai_engine.verify_repair_step(image_b64, current_step_index, total_steps)
    return verification

@app.post("/api/save-snapshot")
async def save_snapshot(payload: Dict[str, Any]):
    image_b64 = payload.get("image", "")
    notes = payload.get("notes", "Captured from camera stream")
    
    if not image_b64:
        return JSONResponse(status_code=400, content={"error": "Missing image"})

    clean_b64 = image_b64.split(",")[-1]
    img_data = base64.b64decode(clean_b64)
    
    filename = f"snapshot_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(img_data)
        
    save_media_record(
        session_id=stream_manager.active_session_id,
        media_type="snapshot",
        file_path=f"/snapshots/{filename}",
        file_name=filename,
        file_size=len(img_data),
        notes=notes
    )
    
    return {"status": "success", "file_url": f"/snapshots/{filename}", "filename": filename}

@app.post("/api/save-recording")
async def save_recording(video: UploadFile = File(...), notes: str = Form("Live Mobile Video Recording")):
    filename = f"recording_{int(time.time())}_{uuid.uuid4().hex[:6]}.webm"
    filepath = os.path.join(RECORDINGS_DIR, filename)
    
    content = await video.read()
    with open(filepath, "wb") as f:
        f.write(content)
        
    save_media_record(
        session_id=stream_manager.active_session_id,
        media_type="video_recording",
        file_path=f"/recordings/{filename}",
        file_name=filename,
        file_size=len(content),
        notes=notes
    )
    
    return {"status": "success", "file_url": f"/recordings/{filename}", "filename": filename, "size": len(content)}

@app.get("/api/records")
async def list_records():
    records = get_all_records()
    sessions = get_all_sessions()
    return {"records": records, "sessions": sessions}

# --- WebSockets for Live Real-Time Mobile Streaming ---

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    role = websocket.query_params.get("role", "desktop")
    if role == "mobile":
        await stream_manager.connect_mobile(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                # Frame data from mobile
                await stream_manager.broadcast_frame_from_mobile(data)
        except WebSocketDisconnect:
            await stream_manager.disconnect_mobile(websocket)
    else:
        await stream_manager.connect_desktop(websocket)
        try:
            while True:
                # Keep desktop alive and handle control signals
                data = await websocket.receive_text()
        except WebSocketDisconnect:
            stream_manager.disconnect_desktop(websocket)

if __name__ == "__main__":
    import uvicorn
    init_db()
    lan_ip = get_lan_ip()
    print("=" * 65)
    print("🚀 Visionary Sahayak - GenAI Multimodal Repair Engine Started!")
    print(f"💻 Operator Desktop Dashboard:  http://localhost:8000")
    print(f"📱 Connect Mobile Phone Camera: http://{lan_ip}:8000/mobile")
    print(f"👥 Authors: Prince Kumar (1BG24CS133) & Yash Sharma (1BG24CS186)")
    print("=" * 65)
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
