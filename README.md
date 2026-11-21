# 🛠️ Visionary Sahayak
> **Real-Time Multimodal GenAI Hardware Diagnostic & Step-by-Step Device Repair Assistant**  
> *Developed for VTU CSE Academic Project by **Prince Kumar** & **Yash Sharma***

[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v0.110.0-009688.svg)](https://fastapi.tiangolo.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-orange.svg)](https://websockets.readthedocs.io/)
[![Gemini Flash Vision](https://img.shields.io/badge/GenAI-Gemini_Flash_Vision-8E75B2.svg)](https://deepmind.google/technologies/gemini/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 👥 Project Team & Authors
| Student Name | University Seat Number (USN) | Core Role & Responsibilities |
| :--- | :--- | :--- |
| **Prince Kumar** | **`1BG24CS133`** | **Lead Architect & AI Systems Engineer**: Backend Architecture (FastAPI), Multimodal Vision API Integration, WebSocket Relays, Step Verification State Machine, SQLite Persistence. |
| **Yash Sharma** | **`1BG24CS186`** | **Frontend & Interactive UX Engineer**: Cyberpunk Glassmorphic Dashboard, Mobile Rear-Camera Lens PWA, Canvas Overlay Engine, Web Speech API (TTS), Live Recording Station. |

---

## 🌟 Overview & Viral Demo Inspiration
Inspired by the viral GenAI hackathon-winning hardware repair assistant, **Visionary Sahayak** transforms any everyday smartphone camera into an intelligent diagnostic lens. When a user points their phone at a malfunctioning consumer electronic device (such as an **Infrared TV Remote Control**, frayed USB cable, or circuit board), the multimodal vision engine:
1. **Identifies the device & failure mechanism** (e.g., *corroded negative battery terminal coil spring & IR emitter dropout*).
2. **Projects high-contrast AR bounding boxes** directly over the defective component.
3. **Speaks step-by-step instructions hands-free**, allowing the user to handle screwdrivers, brushes, and cleaning solvents without touching the screen.
4. **Validates user actions in a closed loop**: After the user cleans the terminal and inserts fresh batteries, the AI instructs them to point the front infrared emitter at the mobile camera. Because phone camera sensors can capture invisible 940nm infrared light as distinct purple flashes, the AI automatically verifies the pulse and confirms the device is fixed!
5. **Enables live session recording & high-res snapshots** stored in a persistent SQLite gallery.

---

## 📱 Mobile Phone Camera Connectivity (Zero-Install)
Users do **not** need to install any mobile app from the App Store or Play Store:
1. Launch the Desktop Dashboard on your laptop/PC (`http://localhost:8000`).
2. Click **"Connect Mobile Camera"** to open the Dynamic QR Code modal.
3. Scan the QR code with any smartphone connected to the same Wi-Fi network.
4. The smartphone opens the mobile streamer (`http://<LAN_IP>:8000/mobile`), activating the **high-resolution rear environment camera** and streaming video to the desktop console at sub-120ms latency over WebSockets!

---

## 🏗️ System Architecture

```
+-------------------+        +--------------------+        +--------------------+
|  Mobile Phone     |        |   FastAPI Server   |        | Google Gemini /    |
|  Rear Camera Lens |        |   WebSocket Hub    |        | Multimodal Engine  |
+-------------------+        +--------------------+        +--------------------+
          |                            |                             |
          |--- (1) Connect WS -------->|                             |
          |--- (2) 10 FPS Frame Stream>|                             |
          |                            |--- (3) Relay to Desktop --->| (Render Feed)
          |                            |                             |
          |                            |--- (4) POST /api/diagnose ->|
          |                            |<-- (5) Structured JSON -----|
          |                            |    (Boxes, Steps, Safety)   |
          |                            |                             |
          |<-- (6) Voice Readout ------|                             |
          |    (Hands-free TTS)        |                             |
          |                            |                             |
          |--- (7) Action Completed -->|                             |
          |--- (8) Camera Verify ----->|--- (9) Validate Optical --->|
          |<-- (10) Step Confirmed ----|<-- (11) Advance Machine ----|
```

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- Python 3.10 or 3.11 installed.
- Smartphone and computer connected to the same local Wi-Fi network.

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Prince-creator-developer/Visionary-Sahayak.git
cd Visionary-Sahayak

# Install dependencies
pip install -r requirements.txt
```

### 3. Launching the Platform
```bash
# Optional: Set your Gemini API key for live online multimodal inference
# (The platform includes an intelligent offline diagnostic heuristic fallback if no key is provided)
set GEMINI_API_KEY="your_google_gemini_api_key_here"

# Run the FastAPI server
python app.py
```

### 4. Accessing the Interfaces
- **Operator Desktop Dashboard:** Open [http://localhost:8000](http://localhost:8000)
- **Mobile Camera Streamer:** Scan the on-screen QR code or open `http://<YOUR_LAN_IP>:8000/mobile`

---

## 📑 27-Page Academic Project Report
The complete formal 27-page VTU academic project report matching all required chapters is generated and stored in [`docs/`](docs/):
- **Compiled PDF:** [`docs/Visionary_Sahayak_Final_Project_Report.pdf`](docs/Visionary_Sahayak_Final_Project_Report.pdf)
- **Markdown Source:** [`docs/Visionary_Sahayak_Final_Project_Report.md`](docs/Visionary_Sahayak_Final_Project_Report.md)
- **PDF Compilation Script:** [`docs/generate_report_pdf.py`](docs/generate_report_pdf.py)

### Table of Contents Coverage
- **Chapter 1:** Introduction (Page 1)
- **Chapter 2:** Problem Statement and Objectives (Page 2)
- **Chapter 3:** User's Business Requirements Specification (Pages 3–4)
  - 3.1 User Requirements Specifications (Page 3)
  - 3.2 Business Requirements Specifications (Page 4)
- **Chapter 4:** Functional Requirements (Pages 5–6)
- **Chapter 5:** Non-Functional Requirements (Pages 7–8)
- **Chapter 6:** Components/Modules (Pages 9–10)
- **Chapter 7:** Design Elements (Pages 11–12)
- **Chapter 8:** ITCs / STCs / ATCs (Pages 13–15)
  - 8.1 Integration Test Cases (Pages 13–14)
  - 8.2 System Test Cases (Pages 14–15)
  - 8.3 Acceptance Test Cases (Page 15)
- **Chapter 9:** Use-Case Diagrams (Pages 16–19)
- **Chapter 10:** Sequence Diagrams (Pages 20–23)
- **Chapter 11:** Class Diagrams (Pages 24–25)
- **Chapter 12:** Conclusion (Page 26)
- **REFERENCES:** IEEE Citations (Page 27)

---

## 📄 License
This project is open-source and distributed under the MIT License.
