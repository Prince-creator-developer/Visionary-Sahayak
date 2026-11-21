// Visionary Sahayak - Unified Hardware Diagnostic & Autonomous Support Suite
// Authors: Prince Kumar (1BG24CS133) & Yash Sharma (1BG24CS186)

let socket = null;
let currentFeedMode = 'mobile';
let webcamStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let voiceEnabled = true;

// Active Chat History for Triage Interview
let chatHistory = [];

// Current Active Diagnostic State
let activeDiagnosis = {
    deviceName: "Universal Hardware Diagnostics",
    category: "Consumer Device / Appliance",
    faultDetected: "Awaiting Diagnostic Triage",
    confidence: 0,
    safety: "Always disconnect power from mains and discharge capacitors before physical inspection.",
    steps: [],
    currentStepIndex: 1
};

// DOM Handles
const streamCanvas = document.getElementById('streamCanvas');
const ctx = streamCanvas.getContext('2d');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcamVideo');
const noFeedPlaceholder = document.getElementById('noFeedPlaceholder');
const chatThread = document.getElementById('chatThread');
const chatInput = document.getElementById('chatInput');

// --- WebSocket & Stream Management ---
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?role=desktop`;

    try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("[WS] Desktop connected to Visionary Sahayak Hub");
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
                console.error("Frame parse error", e);
            }
        };

        socket.onclose = () => {
            console.warn("[WS] WS stream dropped. Starting HTTP Polling fallback...");
            startHttpPollingFallback();
            setTimeout(initWebSocket, 3000);
        };

        socket.onerror = () => {
            startHttpPollingFallback();
        };
    } catch (e) {
        startHttpPollingFallback();
    }
}

let pollingInterval = null;
function startHttpPollingFallback() {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            return;
        }
        try {
            const resp = await fetch('/api/stream/latest');
            const data = await resp.json();
            if (data.frame && currentFeedMode === 'mobile') {
                updateMobileStatus(data.mobile_connected);
                renderMobileFrame(data.frame);
            }
        } catch (e) {}
    }, 450);
}

function updateMobileStatus(connected, message = '') {
    const dot = document.getElementById('mobileStatusDot');
    const badgeLight = document.getElementById('badgeLight');
    const badgeText = document.getElementById('badgeText');

    if (connected) {
        dot.className = "w-2 h-2 rounded-full bg-emerald-400";
        badgeLight.className = "w-2.5 h-2.5 rounded-full bg-emerald-400";
        badgeText.innerText = "Mobile Camera Lens Active";
        noFeedPlaceholder.classList.add('hidden');
    } else {
        dot.className = "w-2 h-2 rounded-full bg-slate-400";
        badgeLight.className = "w-2.5 h-2.5 rounded-full bg-slate-500";
        badgeText.innerText = message || "Optical Scanner Inactive";
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

// Feed Selection
async function switchFeedSource(source) {
    currentFeedMode = source;
    document.getElementById('btnFeedMobile').className = source === 'mobile' ? 
        'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium transition' : 
        'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition';
    
    document.getElementById('btnFeedWebcam').className = source === 'webcam' ? 
        'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium transition' : 
        'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition';

    if (source === 'mobile') {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        webcamVideo.classList.add('hidden');
        streamCanvas.classList.remove('hidden');
        document.getElementById('badgeText').innerText = "Mobile Camera Feed";
    } else if (source === 'webcam') {
        streamCanvas.classList.add('hidden');
        noFeedPlaceholder.classList.add('hidden');
        webcamVideo.classList.remove('hidden');
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
            webcamVideo.srcObject = webcamStream;
            document.getElementById('badgeText').innerText = "Laptop Webcam Active";
            document.getElementById('badgeLight').className = "w-2.5 h-2.5 rounded-full bg-emerald-400";
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
        const img = new Image();
        img.onload = () => {
            streamCanvas.width = img.width;
            streamCanvas.height = img.height;
            overlayCanvas.width = img.width;
            overlayCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            webcamVideo.classList.add('hidden');
            noFeedPlaceholder.classList.add('hidden');
            streamCanvas.classList.remove('hidden');

            document.getElementById('badgeText').innerText = `Uploaded: ${file.name}`;
            triggerAnalysis(e.target.result);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

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

// --- Conversational Diagnostic Triage (Eliminates Customer Care) ---

async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendChatMessage("user", text);
    chatInput.value = "";

    const frameB64 = getCurrentFrameBase64();

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: chatHistory,
                image: frameB64
            })
        });

        const data = await resp.json();
        appendChatMessage("ai", data.reply);

        if (data.suggested_chips && data.suggested_chips.length > 0) {
            renderQuickChips(data.suggested_chips);
        }

        if (data.ready_for_steps) {
            triggerAnalysis(null, text);
        }

    } catch (err) {
        console.error("Chat triage error", err);
        appendChatMessage("ai", "I've logged your issue. Let me run a direct optical scan on the device view to diagnose the failure.");
        triggerAnalysis(null, text);
    }
}

function sendQuickChip(text) {
    chatInput.value = text;
    sendChatMessage();
}

function appendChatMessage(sender, message) {
    chatHistory.push({ sender, message });
    const msgDiv = document.createElement('div');
    msgDiv.className = "flex items-start gap-2.5 animate-in fade-in duration-200";

    if (sender === 'user') {
        msgDiv.innerHTML = `
            <div class="ml-auto bg-indigo-600 text-white rounded-xl p-3 max-w-[85%] leading-relaxed shadow-sm">
                ${message}
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">AI</div>
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 max-w-[85%] text-slate-200 leading-relaxed shadow-sm">
                ${message}
            </div>
        `;
        if (voiceEnabled) {
            speakText(message);
        }
    }

    chatThread.appendChild(msgDiv);
    chatThread.scrollTop = chatThread.scrollHeight;
}

function renderQuickChips(chips) {
    const container = document.getElementById('quickChips');
    container.innerHTML = '';
    chips.forEach(chip => {
        const btn = document.createElement('button');
        btn.className = "px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition";
        btn.innerText = chip;
        btn.onclick = () => sendQuickChip(chip);
        container.appendChild(btn);
    });
}

// Voice Recognition Dictation
function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech Recognition is not supported on this browser. Please type in the chat box.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    const btn = document.getElementById('btnVoiceInput');
    btn.className = "p-2 rounded-lg bg-rose-600 text-white text-xs border border-rose-500 animate-pulse";

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        chatInput.value = transcript;
        sendChatMessage();
    };

    recognition.onend = () => {
        btn.className = "p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition";
    };

    recognition.start();
}

// --- Staged Multi-Agent Hardware Analysis ---

async function triggerAnalysis(customImageB64 = null, customPrompt = "") {
    const btn = document.getElementById('btnAnalyze');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Hardware...`;
    btn.disabled = true;

    const frameB64 = customImageB64 || getCurrentFrameBase64();
    const problem = customPrompt || chatInput.value || "Universal Hardware Triage";

    try {
        const resp = await fetch('/api/diagnose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: frameB64,
                prompt: problem
            })
        });

        const data = await resp.json();
        applyDiagnosticResults(data);
        saveSnapshot(frameB64, `AI Scan: ${data.device_name}`);

    } catch (err) {
        console.error("Diagnosis error", err);
        alert("Hardware analysis notice: " + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function applyDiagnosticResults(data) {
    activeDiagnosis = {
        deviceName: data.device_name || "Identified Hardware",
        category: data.category || "Consumer Electronics",
        faultDetected: data.fault_detected || "Component Failure Diagnosed",
        confidence: data.confidence_score || 93.0,
        safety: data.safety_warning || "Disconnect power from mains before physical intervention.",
        steps: data.repair_steps || ["Inspect connections.", "Clean contacts."],
        currentStepIndex: 1
    };

    document.getElementById('deviceName').innerText = activeDiagnosis.deviceName;
    document.getElementById('deviceCategory').innerText = `Category: ${activeDiagnosis.category}`;
    document.getElementById('faultDescription').innerText = activeDiagnosis.faultDetected;
    document.getElementById('safetyText').innerText = activeDiagnosis.safety;
    document.getElementById('confidenceText').innerText = `Confidence: ${activeDiagnosis.confidence}%`;

    renderStepsList();
    updateProgress();

    if (data.bounding_box && data.bounding_box.length === 4) {
        drawBoundingBox(data.bounding_box, activeDiagnosis.faultDetected);
    }

    if (voiceEnabled) {
        speakText(`Hardware diagnosed as ${activeDiagnosis.deviceName}. Root cause: ${activeDiagnosis.faultDetected}. Proceed to Step 1.`);
    }
}

function drawBoundingBox(box, label) {
    const [ymin, xmin, ymax, xmax] = box;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const x = (xmin / 1000) * w;
    const y = (ymin / 1000) * h;
    const boxW = ((xmax - xmin) / 1000) * w;
    const boxH = ((ymax - ymin) / 1000) * h;

    overlayCtx.clearRect(0, 0, w, h);

    // Clean Indigo/Sky Engineering Box
    overlayCtx.strokeStyle = "#38bdf8";
    overlayCtx.lineWidth = 2.5;
    overlayCtx.strokeRect(x, y, boxW, boxH);

    overlayCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
    overlayCtx.fillRect(x, Math.max(0, y - 22), Math.min(boxW + 20, 240), 20);

    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.font = "bold 11px sans-serif";
    overlayCtx.fillText(label.slice(0, 30), x + 5, Math.max(14, y - 7));
}

function renderStepsList() {
    const list = document.getElementById('stepsList');
    list.innerHTML = '';

    if (!activeDiagnosis.steps || activeDiagnosis.steps.length === 0) {
        list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">Awaiting diagnostic triage.</div>`;
        return;
    }

    activeDiagnosis.steps.forEach((step, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === activeDiagnosis.currentStepIndex;
        const isCompleted = stepNum < activeDiagnosis.currentStepIndex;

        const item = document.createElement('div');
        item.className = `p-3 rounded-lg border transition flex items-start gap-3 ${
            isActive ? 'border-indigo-500 bg-indigo-950/20 shadow-sm' :
            isCompleted ? 'border-slate-800 bg-slate-950/40 opacity-70' :
            'border-slate-800 bg-slate-950/20 opacity-50'
        }`;

        item.innerHTML = `
            <span class="w-5 h-5 rounded-full ${
                isCompleted ? 'bg-emerald-600 text-white' :
                isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            } text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                ${isCompleted ? '<i class="fa-solid fa-check"></i>' : stepNum}
            </span>
            <div class="flex-1">
                <p class="text-xs font-semibold ${isActive ? 'text-slate-100' : 'text-slate-300'}">${step}</p>
            </div>
            ${isActive ? `<button onclick="readCurrentStepAloud()" class="text-indigo-400 hover:text-indigo-300 text-xs p-1"><i class="fa-solid fa-volume-high"></i></button>` : ''}
        `;
        list.appendChild(item);
    });
}

function updateProgress() {
    const total = activeDiagnosis.steps.length || 1;
    const completed = activeDiagnosis.currentStepIndex - 1;
    const percent = Math.min(100, Math.round((completed / total) * 100));

    document.getElementById('progressPercent').innerText = `${percent}%`;
    document.getElementById('progressBar').style.width = `${percent}%`;
}

// Step Verification
async function verifyStepWithCamera() {
    const btn = document.getElementById('btnVerifyStep');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying with Camera...`;
    btn.disabled = true;

    const frameB64 = getCurrentFrameBase64();

    try {
        const resp = await fetch('/api/verify-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: frameB64,
                current_step_index: activeDiagnosis.currentStepIndex,
                total_steps: activeDiagnosis.steps.length
            })
        });

        const res = await resp.json();
        if (res.verified) {
            activeDiagnosis.currentStepIndex = res.current_step_index;
            renderStepsList();
            updateProgress();

            if (res.is_completed) {
                speakText("Verification confirmed! Hardware repair successfully completed.");
                alert("🎉 Device repair validated successfully!");
            } else {
                const nextStep = activeDiagnosis.steps[activeDiagnosis.currentStepIndex - 1];
                speakText(`Step verified! Next: ${nextStep}`);
            }
        }
    } catch (e) {
        console.error("Step verification error", e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// TTS Audio
function speakText(text) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
}

function readCurrentStepAloud() {
    const step = activeDiagnosis.steps[activeDiagnosis.currentStepIndex - 1];
    if (step) {
        speakText(`Step ${activeDiagnosis.currentStepIndex}: ${step}`);
    }
}

function toggleVoiceAudio() {
    voiceEnabled = !voiceEnabled;
    document.getElementById('ttsStatus').innerText = voiceEnabled ? "Voice Active" : "Voice Muted";
}

// Video Recording & Snapshots
function toggleRecording() {
    if (!isRecording) startRecording();
    else stopRecording();
}

function startRecording() {
    recordedChunks = [];
    const streamToRecord = (currentFeedMode === 'webcam' && webcamStream) ? webcamStream : streamCanvas.captureStream(25);

    try {
        mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
    } catch (e) {
        mediaRecorder = new MediaRecorder(streamToRecord);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = uploadRecording;
    mediaRecorder.start(1000);

    isRecording = true;
    recordStartTime = Date.now();
    document.getElementById('recIndicator').classList.remove('hidden');
    document.getElementById('btnRecordText').innerText = "Stop Recording";
    document.getElementById('btnRecord').className = "px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 shadow";

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
        document.getElementById('btnRecord').className = "px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition";
    }
}

async function uploadRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', blob, `session_${Date.now()}.webm`);
    formData.append('notes', `Inspection of ${activeDiagnosis.deviceName}`);

    try {
        await fetch('/api/save-recording', { method: 'POST', body: formData });
        refreshRecords();
    } catch (e) {
        console.error("Recording upload error", e);
    }
}

async function captureSnapshot() {
    const frameB64 = getCurrentFrameBase64();
    await saveSnapshot(frameB64, `Snapshot: ${activeDiagnosis.deviceName}`);
}

async function saveSnapshot(frameB64, notes = "") {
    try {
        await fetch('/api/save-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameB64, notes: notes })
        });
        refreshRecords();
    } catch (e) {}
}

async function refreshRecords() {
    try {
        const resp = await fetch('/api/records');
        const data = await resp.json();
        const gallery = document.getElementById('mediaGallery');

        if (!data.records || data.records.length === 0) {
            gallery.innerHTML = `<div class="text-xs text-slate-500 col-span-full py-4 text-center">No inspection records stored yet.</div>`;
            return;
        }

        gallery.innerHTML = '';
        data.records.forEach(rec => {
            const card = document.createElement('div');
            card.className = "bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-sm flex flex-col group";

            if (rec.media_type === 'snapshot') {
                card.innerHTML = `
                    <div class="aspect-video bg-black overflow-hidden relative">
                        <img src="${rec.file_path}" class="w-full h-full object-cover">
                        <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[8px] font-mono text-slate-300">PHOTO</span>
                    </div>
                    <div class="p-1.5 flex items-center justify-between">
                        <span class="text-[10px] text-slate-400 truncate max-w-[80px]">${rec.notes || rec.file_name}</span>
                        <a href="${rec.file_path}" download class="text-indigo-400 hover:text-indigo-300 text-xs"><i class="fa-solid fa-download"></i></a>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="aspect-video bg-black overflow-hidden relative flex items-center justify-center">
                        <video src="${rec.file_path}" class="w-full h-full object-cover" controls preload="metadata"></video>
                        <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600 text-[8px] font-mono text-white">REC</span>
                    </div>
                    <div class="p-1.5 flex items-center justify-between">
                        <span class="text-[10px] text-slate-400 truncate max-w-[80px]">${rec.notes || rec.file_name}</span>
                        <a href="${rec.file_path}" download class="text-rose-400 hover:text-rose-300 text-xs"><i class="fa-solid fa-download"></i></a>
                    </div>
                `;
            }
            gallery.appendChild(card);
        });
    } catch (e) {}
}

function toggleMobileModal() {
    document.getElementById('mobileModal').classList.toggle('hidden');
}

function copyMobileUrl() {
    const url = document.getElementById('mobileUrlText').innerText;
    navigator.clipboard.writeText(url);
    alert("Mobile connection URL copied: " + url);
}

window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    refreshRecords();
});
