import {
    FaceLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

// Prevent duplicate injection
if (document.getElementById('sleepAwakerWidget')) {
    throw new Error("Sleep Awaker Widget already initialized");
}

// --- HTML Injection ---
// Inject the Widget HTML
const widgetHTML = `
<style>
  #sleepAwakerWidget {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.8);
    padding: 10px;
    border-radius: 10px;
    color: white;
    font-family: sans-serif;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 220px;
    transition: all 0.3s ease;
  }
  #sleepAwakerWidget.minimized {
    width: auto;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }
  #sleepAwakerWidget.minimized .widget-content {
    display: none;
  }
  #sleepAwakerToggleBtn {
    background: linear-gradient(90deg, #4b6cb7 0%, #182848 100%);
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  }
  #sleepAwakerToggleBtn.active {
    background: linear-gradient(90deg, #ff416c 0%, #ff4b2b 100%);
  }
  .sa-status {
    font-size: 12px;
    color: #00d4ff;
    text-align: center;
  }
  #saVideoContainer {
    width: 100%;
    position: relative;
    border-radius: 5px;
    overflow: hidden;
    display: none; /* Hidden by default until active */
  }
  #saWebcam {
    width: 100%;
    transform: scaleX(-1);
    display: block;
  }
  #saCanvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: scaleX(-1);
  }
  .sa-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ccc;
    display: inline-block;
  }
  .sa-indicator.on {
    background: #00ff00;
    box-shadow: 0 0 5px #00ff00;
  }
</style>

<div id="sleepAwakerWidget">
  <button id="sleepAwakerToggleBtn">
    <span class="sa-indicator" id="saIndicator"></span>
    Sleep Awaker
  </button>
  
  <div class="widget-content" id="saWidgetContent">
    <div class="sa-status" id="saStatus">Status: OFF</div>
    <div id="saVideoContainer">
      <video id="saWebcam" autoplay playsinline muted></video>
      <canvas id="saCanvas"></canvas>
    </div>
  </div>
</div>
<audio id="saSiren" src="/siren.mp3" loop></audio>
`;

// Insert into body
const div = document.createElement('div');
div.innerHTML = widgetHTML;
document.body.appendChild(div);

// --- Elements ---
const toggleBtn = document.getElementById('sleepAwakerToggleBtn');
const indicator = document.getElementById('saIndicator');
const statusText = document.getElementById('saStatus');
const videoContainer = document.getElementById('saVideoContainer');
const video = document.getElementById('saWebcam');
const canvasElement = document.getElementById('saCanvas');
const canvasCtx = canvasElement.getContext('2d');
const sirenAudio = document.getElementById("saSiren");

// --- Logic Variables ---
let faceLandmarker = undefined;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let results = undefined;
let isRunning = false;
let animationId = null;

const EAR_THRESHOLD = 0.2;
const MOUTH_THRESHOLD = 0.6;
const BLINK_DURATION_THRESHOLD = 400;
const YAWN_DURATION_THRESHOLD = 1500;
const WINDOW_SIZE = 100;

let blinkStartTime = 0;
let lastLongBlinkTime = 0;
let yawnStartTime = 0;
let lastYawnTime = 0;
let history = [];
let drawingUtils = new DrawingUtils(canvasCtx);

// --- Initialization ---
async function initModel() {
    if (faceLandmarker) return;

    statusText.innerText = "Loading Model...";
    try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "/face_landmarker.task",
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: runningMode,
            numFaces: 1
        });
        statusText.innerText = "Model Ready";
    } catch (e) {
        console.error(e);
        statusText.innerText = "Model Failed";
        toggleState(false);
    }
}

// --- Face Logic ---
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function calculateEAR(landmarks) {
    const leftEyeIdx = [362, 385, 387, 263, 373, 380];
    const rightEyeIdx = [33, 160, 158, 133, 153, 144];

    function getEyeEAR(indices) {
        const p1 = landmarks[indices[0]];
        const p2 = landmarks[indices[1]];
        const p3 = landmarks[indices[2]];
        const p4 = landmarks[indices[3]];
        const p5 = landmarks[indices[4]];
        const p6 = landmarks[indices[5]];

        const v1 = distance(p2, p6);
        const v2 = distance(p3, p5);
        const h = distance(p1, p4);
        return (v1 + v2) / (2.0 * h);
    }

    return (getEyeEAR(leftEyeIdx) + getEyeEAR(rightEyeIdx)) / 2.0;
}

function calculateMAR(landmarks) {
    const v1 = distance(landmarks[81], landmarks[178]);
    const v2 = distance(landmarks[13], landmarks[14]);
    const v3 = distance(landmarks[311], landmarks[402]);
    const h = distance(landmarks[78], landmarks[308]);
    return (v1 + v2 + v3) / (2.0 * h);
}

async function predictWebcam() {
    if (!isRunning) return;

    // Resize canvas to match video
    if (video.videoWidth > 0 && canvasElement.width !== video.videoWidth) {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime && faceLandmarker) {
        lastVideoTime = video.currentTime;
        results = faceLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];

        // Simplified Drawing - just eyes/mouth if needed, or nothing to save perf
        // drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 1 });

        const ear = calculateEAR(landmarks);
        const mar = calculateMAR(landmarks);

        const nose = landmarks[1];
        const hCenterY = (landmarks[234].y + landmarks[454].y) / 2.0;
        const pitch = nose.y - hCenterY;

        const now = Date.now();

        // Blink
        if (ear < EAR_THRESHOLD) {
            if (blinkStartTime === 0) blinkStartTime = now;
            else if (now - blinkStartTime > BLINK_DURATION_THRESHOLD) {
                lastLongBlinkTime = now;
            }
        } else {
            blinkStartTime = 0;
        }

        // Yawn
        if (mar > MOUTH_THRESHOLD) {
            if (yawnStartTime === 0) yawnStartTime = now;
            else if (now - yawnStartTime > YAWN_DURATION_THRESHOLD) {
                lastYawnTime = now;
            }
        } else {
            yawnStartTime = 0;
        }

        history.push({ ear, mar, pitch, timestamp: now });
        if (history.length > WINDOW_SIZE) history.shift();

        // Risk
        if (history.length > 10) {
            const perclos = history.filter(h => h.ear < EAR_THRESHOLD).length / history.length;
            const tBlink = now - lastLongBlinkTime;
            const longBlinkRisk = (tBlink < 10000) ? (10000 - tBlink) / 10000.0 : 0.0;
            const tYawn = now - lastYawnTime;
            const yawnRisk = (tYawn < 30000) ? (30000 - tYawn) / 30000.0 : 0.0;
            const nodding = history.filter(h => h.pitch > 0.05).length / history.length;

            let raw = (perclos * 0.4) + (longBlinkRisk * 0.25) + (yawnRisk * 0.2) + (nodding * 0.15);
            if (perclos > 0.3 && longBlinkRisk > 0.5) raw += 0.2;
            if (nodding > 0.3 && perclos > 0.2) raw += 0.3;

            let currentRisk = Math.min(1.0, Math.max(0.0, raw));

            let stage = "SAFE";
            if (currentRisk > 0.8) stage = "CRITICAL";
            else if (currentRisk > 0.5) stage = "WARNING";
            else if (currentRisk > 0.2) stage = "NORMAL";

            updateStatus(stage, currentRisk);
        }
    }

    canvasCtx.restore();
    if (isRunning) {
        animationId = window.requestAnimationFrame(predictWebcam);
    }
}

function updateStatus(stage, risk) {
    statusText.innerText = `Status: ${stage} (${(risk * 100).toFixed(0)}%)`;
    statusText.style.color = stage === "CRITICAL" ? "red" : (stage === "WARNING" ? "orange" : "#00d4ff");

    if (stage === "CRITICAL") {
        if (sirenAudio.paused) {
            sirenAudio.play().catch(e => console.log("Audio play blocked"));
        }
    } else {
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
    }
}

// --- Toggle Logic ---

async function toggleState(shouldBeOn) {
    if (shouldBeOn) {
        // Turn ON
        try {
            if (!faceLandmarker) await initModel();

            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;

            // Wait for video to load
            video.addEventListener("loadeddata", () => {
                isRunning = true;
                videoContainer.style.display = "block"; // Show preview
                predictWebcam();
            }, { once: true });

            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<span class="sa-indicator on" id="saIndicator"></span> Stop Sleep Awaker';
            indicator.classList.add('on');
            localStorage.setItem('sleepAwakerState', 'ON');
            statusText.innerText = "Monitoring...";

        } catch (err) {
            console.error("Failed to start", err);
            alert("Could not start camera. Please check permissions.");
            toggleState(false);
        }
    } else {
        // Turn OFF
        isRunning = false;
        if (animationId) cancelAnimationFrame(animationId);

        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '<span class="sa-indicator" id="saIndicator"></span> Sleep Awaker';
        indicator.classList.remove('on');
        localStorage.setItem('sleepAwakerState', 'OFF');
        videoContainer.style.display = "none";
        statusText.innerText = "Status: OFF";
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
    }
}

toggleBtn.addEventListener('click', () => {
    const isCurrentlyOn = localStorage.getItem('sleepAwakerState') === 'ON';
    toggleState(!isCurrentlyOn);
});

// --- Auto Start ---
const savedState = localStorage.getItem('sleepAwakerState');
if (savedState === 'ON') {
    toggleState(true);
}

// --- storage Sync ---
window.addEventListener('storage', (event) => {
    if (event.key === 'sleepAwakerState') {
        const newState = event.newValue === 'ON';
        const currentState = toggleBtn.classList.contains('active');
        if (newState !== currentState) {
            toggleState(newState);
        }
    }
});
