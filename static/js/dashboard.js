// Visionary Sahayak - Dashboard Controller
// Authors: Prince Kumar (1BG24CS133) & Yash Sharma (1BG24CS186)

let socket = null;
let currentFeedMode = 'mobile'; // 'mobile', 'webcam', or 'upload'
let webcamStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let voiceEnabled = true;

// Active Diagnosis State
let currentDiagnosis = {
    deviceName: "Infrared (IR) Remote Control Unit",
    category: "Home Appliance & Consumer Electronics",
    faultDetected: "Corroded Negative Battery Terminal Spring & IR Emitter Dropout",
    confidence: 94.6,
    safety: "Remove dead alkaline batteries immediately to prevent corrosive potassium hydroxide skin contact.",
    steps: [
        "Slide off the battery compartment door and remove both AA/AAA cylindrical cells.",
        "Inspect the negative coil spring terminal: observe greenish-white alkaline corrosion.",
        "Dip a cotton swab in vinegar or lemon juice (neutralizes alkaline oxide) and swab the spring.",
        "Scrape terminal contact lightly with emery paper or pencil eraser until shiny metal is visible.",
        "Re-insert fresh batteries with correct polarity (+ facing flat terminal, - facing spring).",
        "Verification Test: Point the front IR LED emitter into this mobile camera and press the 'Power' button. The phone camera sensor can capture invisible 940nm IR light as distinct purple flashes!"
    ],
    currentStepIndex: 1
};

// Canvas & Video Elements
const streamCanvas = document.getElementById('streamCanvas');
const ctx = streamCanvas.getContext('2d');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcamVideo');
const staticPreview = document.getElementById('staticPreview');
const noFeedPlaceholder = document.getElementById('noFeedPlaceholder');

// Initialize WebSockets
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?role=desktop`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("[WS] Desktop connected to Visionary Sahayak stream hub");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'frame' && currentFeedMode === 'mobile') {
                renderMobileFrame(data.data);
            } else if (data.type === 'mobile_status') {
                updateMobileStatus(data.connected, data.message);
            } else if (data.type === 'status') {
                updateMobileStatus(data.mobile_connected);
            }
        } catch (e) {
            console.error("Error processing stream message", e);
        }
    };

    socket.onclose = () => {
        console.warn("[WS] Stream disconnected. Reconnecting in 3s...");
        setTimeout(initWebSocket, 3000);
    };
}

function updateMobileStatus(connected, message = '') {
    const dot = document.getElementById('mobileStatusDot');
    const badgeLight = document.getElementById('badgeLight');
    const badgeText = document.getElementById('badgeText');

    if (connected) {
        dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-ping";
        badgeLight.className = "w-2 h-2 rounded-full bg-emerald-400";
        badgeText.innerText = "Mobile Phone Camera Active";
        noFeedPlaceholder.classList.add('hidden');
    } else {
        dot.className = "w-2 h-2 rounded-full bg-rose-500 animate-pulse";
        badgeLight.className = "w-2 h-2 rounded-full bg-slate-500";
        badgeText.innerText = message || "Mobile Camera Disconnected";
        if (currentFeedMode === 'mobile') {
            noFeedPlaceholder.classList.remove('hidden');
        }
    }
}

function renderMobileFrame(base64Data) {
    noFeedPlaceholder.classList.add('hidden');
    const img = new Image();
    img.onload = () => {
        streamCanvas.width = img.width;
        streamCanvas.height = img.height;
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = base64Data;
}

// Feed Switching
async function switchFeedSource(source) {
    currentFeedMode = source;
    document.getElementById('btnFeedMobile').className = source === 'mobile' ? 
        'px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-medium transition' : 
        'px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-medium transition';
    
    document.getElementById('btnFeedWebcam').className = source === 'webcam' ? 
        'px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-medium transition' : 
        'px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-medium transition';

    if (source === 'mobile') {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        webcamVideo.classList.add('hidden');
        staticPreview.classList.add('hidden');
        streamCanvas.classList.remove('hidden');
        document.getElementById('badgeText').innerText = "Mobile Camera Feed";
    } else if (source === 'webcam') {
        staticPreview.classList.add('hidden');
        streamCanvas.classList.add('hidden');
        noFeedPlaceholder.classList.add('hidden');
        webcamVideo.classList.remove('hidden');
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
            webcamVideo.srcObject = webcamStream;
            document.getElementById('badgeText').innerText = "PC Webcam Active";
            document.getElementById('badgeLight').className = "w-2 h-2 rounded-full bg-emerald-400";
        } catch (err) {
            alert("Could not access PC webcam: " + err.message);
        }
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentFeedMode = 'upload';
    const reader = new FileReader();
    reader.onload = (e) => {
        staticPreview.src = e.target.result;
        staticPreview.onload = () => {
            streamCanvas.width = staticPreview.naturalWidth;
            streamCanvas.height = staticPreview.naturalHeight;
            overlayCanvas.width = staticPreview.naturalWidth;
            overlayCanvas.height = staticPreview.naturalHeight;
            ctx.drawImage(staticPreview, 0, 0);
            
            staticPreview.classList.add('hidden');
            webcamVideo.classList.add('hidden');
            noFeedPlaceholder.classList.add('hidden');
            streamCanvas.classList.remove('hidden');
            
            document.getElementById('badgeText').innerText = `Uploaded: ${file.name}`;
            triggerAnalysis(e.target.result);
        };
    };
    reader.readAsDataURL(file);
}

// Current Frame Capture Helper
function getCurrentFrameBase64() {
    if (currentFeedMode === 'webcam' && webcamVideo.srcObject) {
        streamCanvas.width = webcamVideo.videoWidth || 640;
        streamCanvas.height = webcamVideo.videoHeight || 480;
        ctx.drawImage(webcamVideo, 0, 0, streamCanvas.width, streamCanvas.height);
        return streamCanvas.toDataURL('image/jpeg', 0.85);
    } else {
        return streamCanvas.toDataURL('image/jpeg', 0.85);
    }
}

// GenAI Defect Diagnosis
async function triggerAnalysis(customImageB64 = null) {
    const btn = document.getElementById('btnAnalyze');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Diagnosing Hardware...`;
    btn.disabled = true;

    const frameB64 = customImageB64 || getCurrentFrameBase64();

    try {
        const response = await fetch('/api/diagnose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: frameB64,
                prompt: "Identify the hardware device, diagnose defects like battery terminal corrosion or broken springs, and output step-by-step repair guide."
            })
        });

        const data = await response.json();
        applyDiagnosticResults(data);
        
        // Auto-save snapshot
        saveSnapshot(frameB64, `AI Diagnosis: ${data.device_name}`);

    } catch (err) {
        console.error("Diagnosis error", err);
        alert("Failed to run diagnosis: " + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function applyDiagnosticResults(data) {
    currentDiagnosis = {
        deviceName: data.device_name || "Unknown Hardware",
        category: data.category || "Consumer Electronics",
        faultDetected: data.fault_detected || "No critical faults detected",
        confidence: data.confidence_score || 92.0,
        safety: data.safety_warning || "Standard ESD precautions advised.",
        steps: data.repair_steps || ["Inspect device visually.", "Clean connections."],
        currentStepIndex: 1
    };

    document.getElementById('deviceName').innerText = currentDiagnosis.deviceName;
    document.getElementById('deviceCategory').innerText = `Category: ${currentDiagnosis.category}`;
    document.getElementById('faultDescription').innerText = currentDiagnosis.faultDetected;
    document.getElementById('safetyText').innerText = currentDiagnosis.safety;
    document.getElementById('confidenceVal').innerText = currentDiagnosis.confidence;
    document.getElementById('confidenceBadge').classList.remove('hidden');

    renderStepsList();
    updateProgress();

    // Draw visual bounding box if provided
    if (data.bounding_box && data.bounding_box.length === 4) {
        drawBoundingBox(data.bounding_box, currentDiagnosis.faultDetected);
    }

    if (voiceEnabled) {
        speakText(`Diagnostic complete. Detected ${currentDiagnosis.deviceName} with ${currentDiagnosis.faultDetected}. Proceeding to Step 1.`);
    }
}

function drawBoundingBox(box, label) {
    // box is [ymin, xmin, ymax, xmax] in 0-1000 scale
    const [ymin, xmin, ymax, xmax] = box;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const x = (xmin / 1000) * w;
    const y = (ymin / 1000) * h;
    const boxW = ((xmax - xmin) / 1000) * w;
    const boxH = ((ymax - ymin) / 1000) * h;

    overlayCtx.clearRect(0, 0, w, h);
    
    // Draw box
    overlayCtx.strokeStyle = "#00ffcc";
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeRect(x, y, boxW, boxH);

    // Label tag
    overlayCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
    overlayCtx.fillRect(x, Math.max(0, y - 24), boxW, 22);

    overlayCtx.fillStyle = "#00ffcc";
    overlayCtx.font = "bold 12px monospace";
    overlayCtx.fillText(label.slice(0, 32), x + 6, Math.max(14, y - 8));
}

function renderStepsList() {
    const list = document.getElementById('stepsList');
    list.innerHTML = '';

    currentDiagnosis.steps.forEach((step, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === currentDiagnosis.currentStepIndex;
        const isCompleted = stepNum < currentDiagnosis.currentStepIndex;

        const item = document.createElement('div');
        item.className = `step-item p-3.5 rounded-xl border transition flex items-start gap-3 ${
            isActive ? 'border-cyan-500/50 bg-cyan-950/20 active-step shadow-md shadow-cyan-950/40' :
            isCompleted ? 'border-emerald-500/30 bg-emerald-950/10 opacity-70' :
            'border-slate-800 bg-slate-950/40 opacity-50'
        }`;

        item.innerHTML = `
            <span class="step-num w-6 h-6 rounded-full ${
                isCompleted ? 'bg-emerald-500 text-slate-950' :
                isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            } text-xs font-bold flex items-center justify-center shrink-0">
                ${isCompleted ? '<i class="fa-solid fa-check text-[10px]"></i>' : stepNum}
            </span>
            <div class="flex-1">
                <p class="text-xs font-semibold ${isActive ? 'text-slate-100' : 'text-slate-300'}">${step}</p>
            </div>
            ${isActive ? `<button onclick="readCurrentStepAloud()" class="text-cyan-400 hover:text-cyan-200 text-xs p-1" title="Read Step"><i class="fa-solid fa-volume-high"></i></button>` : ''}
        `;
        list.appendChild(item);
    });
}

function updateProgress() {
    const total = currentDiagnosis.steps.length;
    const completed = currentDiagnosis.currentStepIndex - 1;
    const percent = Math.min(100, Math.round((completed / total) * 100));

    document.getElementById('progressPercent').innerText = `${percent}%`;
    document.getElementById('progressBar').style.width = `${percent}%`;
}

// Interactive Verification Loop
async function verifyStepWithCamera() {
    const btn = document.getElementById('btnVerifyStep');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking Camera View...`;
    btn.disabled = true;

    const frameB64 = getCurrentFrameBase64();

    try {
        const resp = await fetch('/api/verify-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: frameB64,
                current_step_index: currentDiagnosis.currentStepIndex,
                total_steps: currentDiagnosis.steps.length
            })
        });

        const result = await resp.json();
        if (result.verified) {
            currentDiagnosis.currentStepIndex = result.current_step_index;
            renderStepsList();
            updateProgress();

            if (result.is_completed) {
                speakText("Verification confirmed! Congratulations, the device repair procedure is complete!");
                alert("🎉 Device repair verified successfully by Visionary Sahayak!");
            } else {
                const nextStepText = currentDiagnosis.steps[currentDiagnosis.currentStepIndex - 1];
                speakText(`Step verified! Next: ${nextStepText}`);
            }
        }
    } catch (err) {
        console.error("Step verification error", err);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Text-to-Speech (TTS) Voice Engine
function speakText(text) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
}

function readCurrentStepAloud() {
    const stepText = currentDiagnosis.steps[currentDiagnosis.currentStepIndex - 1];
    if (stepText) {
        speakText(`Step ${currentDiagnosis.currentStepIndex}: ${stepText}`);
    }
}

function toggleVoiceAudio() {
    voiceEnabled = !voiceEnabled;
    const status = document.getElementById('ttsStatus');
    status.innerText = voiceEnabled ? "Voice Active" : "Voice Muted";
}

// Live Video Recording
function toggleRecording() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

function startRecording() {
    recordedChunks = [];
    let streamToRecord = null;

    if (currentFeedMode === 'webcam' && webcamStream) {
        streamToRecord = webcamStream;
    } else {
        streamToRecord = streamCanvas.captureStream(25);
    }

    try {
        mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
    } catch (e) {
        mediaRecorder = new MediaRecorder(streamToRecord);
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = uploadRecording;
    mediaRecorder.start(1000);

    isRecording = true;
    recordStartTime = Date.now();
    document.getElementById('recIndicator').classList.remove('hidden');
    document.getElementById('btnRecordText').innerText = "Stop Recording";
    document.getElementById('btnRecord').className = "px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 text-xs font-semibold flex items-center gap-2 transition shadow-lg animate-pulse";

    recordTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        document.getElementById('recTimer').innerText = `${mins}:${secs}`;
    }, 1000);
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        clearInterval(recordTimerInterval);
        document.getElementById('recIndicator').classList.add('hidden');
        document.getElementById('btnRecordText').innerText = "Start Recording";
        document.getElementById('btnRecord').className = "px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-2 transition shadow-sm";
    }
}

async function uploadRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', blob, `recording_${Date.now()}.webm`);
    formData.append('notes', `Repair inspection of ${currentDiagnosis.deviceName}`);

    try {
        const resp = await fetch('/api/save-recording', {
            method: 'POST',
            body: formData
        });
        const res = await resp.json();
        console.log("Recording saved:", res);
        refreshRecords();
    } catch (err) {
        console.error("Recording upload failed", err);
    }
}

// Snapshot Capture
async function captureSnapshot() {
    const frameB64 = getCurrentFrameBase64();
    await saveSnapshot(frameB64, `Manual Snapshot of ${currentDiagnosis.deviceName}`);
}

async function saveSnapshot(frameB64, notes = "") {
    try {
        const resp = await fetch('/api/save-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameB64, notes: notes })
        });
        const res = await resp.json();
        console.log("Snapshot stored:", res);
        refreshRecords();
    } catch (e) {
        console.error("Save snapshot error", e);
    }
}

// Records & Gallery Fetch
async function refreshRecords() {
    try {
        const resp = await fetch('/api/records');
        const data = await resp.json();
        const gallery = document.getElementById('mediaGallery');

        if (!data.records || data.records.length === 0) {
            gallery.innerHTML = `<div class="text-xs text-slate-500 col-span-full py-6 text-center">No snapshots or recordings captured yet.</div>`;
            return;
        }

        gallery.innerHTML = '';
        data.records.forEach(rec => {
            const card = document.createElement('div');
            card.className = "bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col group relative";

            if (rec.media_type === 'snapshot') {
                card.innerHTML = `
                    <div class="aspect-video bg-black overflow-hidden relative">
                        <img src="${rec.file_path}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                        <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-cyan-300">PHOTO</span>
                    </div>
                    <div class="p-2 flex items-center justify-between">
                        <span class="text-[10px] text-slate-400 truncate max-w-[90px]">${rec.notes || rec.file_name}</span>
                        <a href="${rec.file_path}" download class="text-cyan-400 hover:text-cyan-300 text-xs"><i class="fa-solid fa-download"></i></a>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="aspect-video bg-black overflow-hidden relative flex items-center justify-center">
                        <video src="${rec.file_path}" class="w-full h-full object-cover" controls preload="metadata"></video>
                        <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600/80 text-[9px] font-mono text-white">REC</span>
                    </div>
                    <div class="p-2 flex items-center justify-between">
                        <span class="text-[10px] text-slate-400 truncate max-w-[90px]">${rec.notes || rec.file_name}</span>
                        <a href="${rec.file_path}" download class="text-rose-400 hover:text-rose-300 text-xs"><i class="fa-solid fa-download"></i></a>
                    </div>
                `;
            }
            gallery.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to load records", e);
    }
}

// Modal & QR Utilities
function toggleMobileModal() {
    const modal = document.getElementById('mobileModal');
    modal.classList.toggle('hidden');
}

function copyMobileUrl() {
    const url = document.getElementById('mobileUrlText').innerText;
    navigator.clipboard.writeText(url);
    alert("Mobile connection URL copied to clipboard: " + url);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    refreshRecords();
    renderStepsList();
});
