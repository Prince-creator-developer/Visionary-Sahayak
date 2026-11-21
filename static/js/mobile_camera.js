// Visionary Sahayak - Mobile Camera Streaming & Native Shutter Client
// Authors: Prince Kumar (1BG24CS133) & Yash Sharma (1BG24CS186)

let socket = null;
let videoStream = null;
let isStreaming = false;
let streamInterval = null;
let currentTrack = null;
let torchOn = false;
let frameCount = 0;
let lastFpsTime = Date.now();

const video = document.getElementById('mobileVideo');
const mobilePreviewImg = document.getElementById('mobilePreviewImg');
const captureCanvas = document.getElementById('captureCanvas');
const captureCtx = captureCanvas.getContext('2d');
const connStatus = document.getElementById('connStatus');
const permissionOverlay = document.getElementById('permissionOverlay');
const resolutionInfo = document.getElementById('resolutionInfo');
const mobileFps = document.getElementById('mobileFps');
const hudTag = document.getElementById('hudTag');

function initMobileWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?role=mobile`;

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("[Mobile WS] Connected to Desktop Hub");
            connStatus.className = "px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800";
            connStatus.innerText = "Console Synced";
        };

        socket.onclose = () => {
            console.warn("[Mobile WS] Disconnected. Will use HTTP Relay fallback & retry WS.");
            connStatus.className = "px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800";
            connStatus.innerText = "HTTP Live Sync";
            setTimeout(initMobileWebSocket, 3000);
        };

        socket.onerror = () => {
            connStatus.className = "px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800";
            connStatus.innerText = "HTTP Live Sync";
        };
    } catch (e) {
        connStatus.innerText = "HTTP Live Sync";
    }
}

// Native Camera Shutter (Works 100% on ANY phone, ANY network, even HTTP!)
function handleNativeCameraCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    hudTag.innerText = "Transmitting to Dashboard...";
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result;
        
        // Display locally
        mobilePreviewImg.src = base64Data;
        mobilePreviewImg.classList.remove('hidden');
        video.classList.add('hidden');
        permissionOverlay.classList.add('hidden');
        resolutionInfo.innerText = "Photo Captured";

        // Transmit frame to Desktop via WS and HTTP
        sendFrameToHub(base64Data);

        hudTag.innerText = "Sent to Dashboard!";
        setTimeout(() => {
            hudTag.innerText = "Align Remote in Center";
        }, 2500);
    };
    reader.readAsDataURL(file);
}

// Live Video Stream (Requires localhost or HTTPS on Vercel)
async function startMobileCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Live continuous video requires HTTPS (e.g. deployed on Vercel) or localhost.\nPlease tap 'Take Photo with Phone Camera' to use your phone's native camera immediately!");
        return;
    }

    try {
        const constraints = {
            video: {
                facingMode: { ideal: "environment" }, // Rear camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = videoStream;
        currentTrack = videoStream.getVideoTracks()[0];

        mobilePreviewImg.classList.add('hidden');
        video.classList.remove('hidden');
        permissionOverlay.classList.add('hidden');

        video.onloadedmetadata = () => {
            resolutionInfo.innerText = `${video.videoWidth} x ${video.videoHeight}`;
            captureCanvas.width = 640;
            captureCanvas.height = Math.round((video.videoHeight / video.videoWidth) * 640);
            startContinuousStreaming();
        };

    } catch (err) {
        console.error("Camera access notice:", err);
        alert("Camera note: " + err.message + "\nYou can tap 'Take Photo with Phone Camera' to snap photos directly!");
    }
}

function startContinuousStreaming() {
    isStreaming = true;
    hudTag.innerText = "Streaming to Dashboard";

    streamInterval = setInterval(() => {
        if (!isStreaming || !videoStream) return;

        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const frameData = captureCanvas.toDataURL('image/jpeg', 0.65);
        sendFrameToHub(frameData);

        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
            mobileFps.innerText = `${frameCount} FPS`;
            frameCount = 0;
            lastFpsTime = now;
        }
    }, 120);
}

// Unified Frame Transmitter (WebSockets with HTTP Post Fallback)
function sendFrameToHub(frameBase64) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(frameBase64);
    } else {
        // Fallback over HTTP API (Vercel Serverless Compatible)
        fetch('/api/stream/frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame: frameBase64 })
        }).catch(e => console.warn("HTTP Frame sync error", e));
    }
}

function snapAndSend() {
    if (videoStream) {
        captureCanvas.width = video.videoWidth || 1280;
        captureCanvas.height = video.videoHeight || 720;
        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const snapB64 = captureCanvas.toDataURL('image/jpeg', 0.85);
        sendFrameToHub(snapB64);
        hudTag.innerText = "Snapshot Broadcasted!";
        setTimeout(() => hudTag.innerText = "Align Remote in Center", 2000);
    } else {
        document.getElementById('nativeCameraInput').click();
    }
}

async function toggleTorch() {
    if (!currentTrack) return;
    try {
        const capabilities = currentTrack.getCapabilities();
        if ('torch' in capabilities) {
            torchOn = !torchOn;
            await currentTrack.applyConstraints({
                advanced: [{ torch: torchOn }]
            });
            document.getElementById('btnTorch').className = torchOn ? 
                "w-8 h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xs shadow-md shadow-amber-400/50" : 
                "w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs";
        } else {
            alert("Flashlight/Torch is not available on this browser/lens.");
        }
    } catch (e) {
        console.warn("Torch notice", e);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initMobileWebSocket();
});
