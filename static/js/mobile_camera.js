// Visionary Sahayak - Mobile Camera Streaming Client
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
const captureCanvas = document.getElementById('captureCanvas');
const captureCtx = captureCanvas.getContext('2d');
const connStatus = document.getElementById('connStatus');
const permissionOverlay = document.getElementById('permissionOverlay');
const resolutionInfo = document.getElementById('resolutionInfo');
const mobileFps = document.getElementById('mobileFps');
const btnStreamToggle = document.getElementById('btnStreamToggle');
const streamBtnText = document.getElementById('streamBtnText');

function initMobileWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?role=mobile`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("[Mobile WS] Connected to Desktop Server");
        connStatus.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse";
        connStatus.innerText = "Connected to Console";
    };

    socket.onclose = () => {
        console.warn("[Mobile WS] Disconnected. Reconnecting...");
        connStatus.className = "px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-950 text-rose-400 border border-rose-800";
        connStatus.innerText = "Reconnecting...";
        setTimeout(initMobileWebSocket, 2500);
    };

    socket.onerror = (err) => {
        console.error("[Mobile WS Error]", err);
    };
}

async function startMobileCamera() {
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

        permissionOverlay.classList.add('hidden');

        video.onloadedmetadata = () => {
            resolutionInfo.innerText = `${video.videoWidth} x ${video.videoHeight}`;
            captureCanvas.width = 640;
            captureCanvas.height = Math.round((video.videoHeight / video.videoWidth) * 640);
            // Automatically start streaming once camera opens
            startStreamingFrames();
        };

    } catch (err) {
        alert("Camera error: " + err.message + "\nPlease allow camera permissions.");
    }
}

function toggleStreaming() {
    if (isStreaming) {
        stopStreamingFrames();
    } else {
        startStreamingFrames();
    }
}

function startStreamingFrames() {
    if (!videoStream) {
        startMobileCamera();
        return;
    }

    isStreaming = true;
    btnStreamToggle.className = "flex-1 py-3 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500 text-xs font-bold flex items-center justify-center gap-2 shadow-sm animate-pulse";
    streamBtnText.innerText = "Live Streaming Active";

    // Stream at ~10 FPS for ultra-smooth responsiveness without bandwidth choke
    streamInterval = setInterval(() => {
        if (!isStreaming || !socket || socket.readyState !== WebSocket.OPEN) return;

        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const frameData = captureCanvas.toDataURL('image/jpeg', 0.65);
        socket.send(frameData);

        // FPS calculation
        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
            mobileFps.innerText = `${frameCount} FPS`;
            frameCount = 0;
            lastFpsTime = now;
        }
    }, 100);
}

function stopStreamingFrames() {
    isStreaming = false;
    clearInterval(streamInterval);
    btnStreamToggle.className = "flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2";
    streamBtnText.innerText = "Stream to Dashboard";
    mobileFps.innerText = "0 FPS";
}

function snapAndSend() {
    if (!videoStream || !socket || socket.readyState !== WebSocket.OPEN) {
        alert("Camera not active or disconnected.");
        return;
    }
    // High-res snapshot
    captureCanvas.width = video.videoWidth || 1280;
    captureCanvas.height = video.videoHeight || 720;
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const snapB64 = captureCanvas.toDataURL('image/jpeg', 0.85);

    // Send immediately over WS
    socket.send(snapB64);

    // Audio / visual flash effect
    document.body.classList.add('bg-white');
    setTimeout(() => document.body.classList.remove('bg-white'), 100);
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
            alert("Flashlight/Torch is not supported on this browser/camera.");
        }
    } catch (e) {
        console.warn("Torch toggle not supported", e);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initMobileWebSocket();
});
