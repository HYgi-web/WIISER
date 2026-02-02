import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const sirenAudio = document.getElementById("sirenAudio");
const alertBanner = document.getElementById("alertBanner");

// Stats Elements
const scoreVal = document.getElementById("scoreVal");
const earVal = document.getElementById("earVal");
const marVal = document.getElementById("marVal");
const statusVal = document.getElementById("statusVal");

let faceLandmarker = undefined;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let results = undefined;

// Constants (Matching Python)
const EAR_THRESHOLD = 0.2;
const MOUTH_THRESHOLD = 0.6;
const BLINK_DURATION_THRESHOLD = 400; // ms
const YAWN_DURATION_THRESHOLD = 1500; // ms
const WINDOW_SIZE = 100;

// State
let blinkStartTime = 0;
let lastLongBlinkTime = 0;
let yawnStartTime = 0;
let lastYawnTime = 0;
let history = []; // Array of {ear, mar, pitch, timestamp}

// --- Initialization ---
async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: "face_landmarker.task", // Local asset
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode: runningMode,
    numFaces: 1
  });
  enableWebcamButton.disabled = false;
  enableWebcamButton.innerText = "ENABLE WEBCAM";
}
createFaceLandmarker();

// --- Utils ---
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Landmark Indices (MediaPipe)
// Left Eye: 362, 385, 387, 263, 373, 380
// Right Eye: 33, 160, 158, 133, 153, 144
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

    const leftEAR = getEyeEAR(leftEyeIdx);
    const rightEAR = getEyeEAR(rightEyeIdx);
    return (leftEAR + rightEAR) / 2.0;
}

function calculateMAR(landmarks) {
    // MAR Indices: 81, 178, 13, 14, 311, 402 (Vertical), 78, 308 (Horizontal)
    const v1 = distance(landmarks[81], landmarks[178]);
    const v2 = distance(landmarks[13], landmarks[14]);
    const v3 = distance(landmarks[311], landmarks[402]);
    const h = distance(landmarks[78], landmarks[308]);
    return (v1 + v2 + v3) / (2.0 * h);
}

// --- Webcam & Loop ---
function enableCam(event) {
  if (!faceLandmarker) {
    console.log("Wait! faceLandmarker not loaded yet.");
    return;
  }

  const constraints = { video: true };
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
    enableWebcamButton.classList.add("removed");
    enableWebcamButton.style.display = "none";
  });
}
enableWebcamButton.addEventListener("click", enableCam);

let drawingUtils = new DrawingUtils(canvasCtx);

async function predictWebcam() {
  canvasElement.style.width = video.videoWidth + 'px';
  canvasElement.style.height = video.videoHeight + 'px';
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    results = faceLandmarker.detectForVideo(video, startTimeMs);
  }

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Logic
  let currentRisk = 0.0;
  let alertStage = "SAFE";
  
  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];
      
      // Draw
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
      
      // Calculate Metrics
      const ear = calculateEAR(landmarks);
      const mar = calculateMAR(landmarks);
      
      // Pitch Approximation (Nose Y vs Cheek center Y)
      // Nose: 1, Left Cheek: 234, Right Cheek: 454
      const nose = landmarks[1];
      const hCenterY = (landmarks[234].y + landmarks[454].y) / 2.0;
      const pitch = nose.y - hCenterY; // Positive = Nodding Down

      const now = Date.now();

      // Detect Blink
      if (ear < EAR_THRESHOLD) {
          if (blinkStartTime === 0) blinkStartTime = now;
          else if (now - blinkStartTime > BLINK_DURATION_THRESHOLD) {
              lastLongBlinkTime = now;
              drawText("EYES CLOSED", 50, 200, "red");
          }
      } else {
          blinkStartTime = 0;
      }

      // Detect Yawn
      if (mar > MOUTH_THRESHOLD) {
          if (yawnStartTime === 0) yawnStartTime = now;
          else if (now - yawnStartTime > YAWN_DURATION_THRESHOLD) {
              lastYawnTime = now;
              drawText("YAWNING", 50, 250, "red");
          }
      } else {
          yawnStartTime = 0;
      }

      // Update History
      history.push({ ear, mar, pitch, timestamp: now });
      if (history.length > WINDOW_SIZE) history.shift();

      // Risk Calculation
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

          currentRisk = Math.min(1.0, Math.max(0.0, raw));
          
          if (currentRisk > 0.8) alertStage = "CRITICAL";
          else if (currentRisk > 0.5) alertStage = "WARNING";
          else if (currentRisk > 0.2) alertStage = "NORMAL";
      }

      // Update UI
      earVal.innerText = ear.toFixed(2);
      marVal.innerText = mar.toFixed(2);
      scoreVal.innerText = currentRisk.toFixed(2);
      statusVal.innerText = alertStage;
      
      updateAlert(alertStage);
  }

  canvasCtx.restore();
  window.requestAnimationFrame(predictWebcam);
}

function drawText(text, x, y, color) {
    canvasCtx.fillStyle = color;
    canvasCtx.font = "30px Arial";
    canvasCtx.fillText(text, x, y);
}

function updateAlert(stage) {
    if (stage === "CRITICAL") {
        alertBanner.innerText = "CRITICAL ALERT! WAKE UP!";
        alertBanner.className = "alert-banner alert-critical";
        sirenAudio.play().catch(e => console.log("Audio play failed (user interaction needed first)"));
    } else if (stage === "WARNING") {
        alertBanner.innerText = "WARNING: DROWSINESS DETECTED";
        alertBanner.className = "alert-banner alert-warning";
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
    } else {
        alertBanner.style.display = "none";
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
    }
}
