// Webcam hand-tracking → skeleton puppeteering.
// Each finger's curl drives one limb; overall hand position/roll drives the
// whole model. Runs entirely client-side (MediaPipe Tasks Vision, WASM) —
// no video frame ever leaves the browser.
import * as THREE from "three";

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

// Hand-driven free camera orbit tuning.
const ROT_SENSITIVITY = 6.0; // radians of orbit per full (0..1) hand sweep
const ZOOM_SENSITIVITY = 22.0; // camera-distance units per unit of hand-size change
const MIN_RADIUS = 1.5;
const MAX_RADIUS = 16;
const MIN_PHI = 0.12; // keep just short of the poles so the view can't flip
const MAX_PHI = Math.PI - 0.12;

const TASKS_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_ASSET = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe's 21-point hand landmark indices.
const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 0 = finger fully extended, 1 = fully curled into a fist.
function fingerCurl(landmarks, indices) {
  const pts = indices.map((i) => landmarks[i]);
  let chainLen = 0;
  for (let i = 0; i < pts.length - 1; i++) chainLen += dist3(pts[i], pts[i + 1]);
  const straight = dist3(pts[0], pts[pts.length - 1]);
  if (chainLen < 1e-6) return 0;
  return clamp(1 - straight / chainLen, 0, 1);
}

class HandControl {
  constructor() {
    this.bones = null;
    this.model = null;
    this.active = false;
    this.ready = false;
    this.landmarker = null;
    this.video = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.statusEl = null;
    this.stream = null;
    this.detecting = false;
    this.lastResult = null;
    this.rafId = null;

    // smoothed (current) values
    this.cur = { curl: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, present: 0 };
    // raw targets from the latest detection
    this.target = { curl: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, present: 0 };

    // hand-driven free camera orbit (rotate + zoom around the model)
    this.camera = null;
    this.controls = null;
    this.orbit = null; // { theta, phi, radius } — lazily seeded from the camera
    this.prevWrist = null; // last frame's {x,y} for delta-based rotation
    this.smoothedHandSize = null;
  }

  setBones(bones) {
    this.bones = bones;
    // Bones loaded from the file can have large, non-trivial rest-pose
    // rotations (Blender's bone roll). Mutating individual Euler components
    // (bone.rotation.x = …) reinterprets those rest rotations as a fresh
    // XYZ decomposition and silently produces a completely different net
    // rotation. Instead we capture each controlled bone's rest quaternion
    // once, and always compose our pose offset ON TOP of it via quaternion
    // multiplication, which is representation-independent and safe.
    this.restQuat = {};
    for (const name in bones) this.restQuat[name] = bones[name].quaternion.clone();
    this._deltaQuat = new THREE.Quaternion();
  }

  // Rotate `boneName` by `angle` radians around its own local `axis`,
  // relative to its rest pose (not the current/previous frame's pose).
  _poseBone(boneName, axis, angle) {
    const bone = this.bones[boneName];
    const rest = this.restQuat[boneName];
    this._deltaQuat.setFromAxisAngle(axis, angle);
    bone.quaternion.copy(rest).multiply(this._deltaQuat);
  }

  setModel(model) {
    this.model = model;
  }

  setCamera(camera, controls) {
    this.camera = camera;
    this.controls = controls;
  }

  attachDOM({ video, overlayCanvas, statusEl }) {
    this.video = video;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext("2d");
    this.statusEl = statusEl;
  }

  async toggle() {
    if (this.active) {
      this.disable();
      return false;
    }
    await this.enable();
    return this.active;
  }

  async enable() {
    this.setStatus("SOLICITANDO CÁMARA...");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      this.setStatus("¡SIN ACCESO A CÁMARA!");
      console.error("getUserMedia failed", err);
      throw err;
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.landmarker) {
      this.setStatus("CARGANDO MODELO IA...");
      const mod = await import(TASKS_VISION_URL);
      const { HandLandmarker, FilesetResolver } = mod;
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });
    }

    this.active = true;
    this.setStatus("SIN MANO DETECTADA");
    this.loop();
    return true;
  }

  disable() {
    this.active = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
    if (this.overlayCtx) this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.target = { curl: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, present: 0 };
    this.prevWrist = null;
    if (this.controls) this.controls.enabled = true;
    this.setStatus("");
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  loop() {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(() => this.loop());
    if (this.video.readyState < 2) return;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    this.drawOverlay(result);

    if (result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      this.setStatus("🖐 MANO DETECTADA");

      const curl = {};
      for (const name in FINGERS) curl[name] = fingerCurl(lm, FINGERS[name]);

      // wrist position (mirrored: webcam feed is not flipped, so invert X for
      // a natural "move your hand right, view turns right" feel)
      const wrist = lm[0];
      const wristX = 1 - wrist.x;
      const wristY = wrist.y;

      // overall hand size in frame ~ inverse distance from the camera; used
      // to drive zoom ("mano cerca" = zoom in, "mano lejos" = zoom out)
      const handSize = dist3(lm[0], lm[9]);

      this.target = { curl, wristX, wristY, handSize, present: 1 };
    } else {
      this.setStatus("SIN MANO DETECTADA");
      this.target.present = 0;
    }
  }

  drawOverlay(result) {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width, h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.video, 0, 0, w, h);
    if (!result.landmarks || !result.landmarks.length) return;
    const lm = result.landmarks[0];
    ctx.strokeStyle = "#ffcf27";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#e0202c";
    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Called every render frame from the main animate() loop.
  update(dt) {
    this._updateCamera(dt);

    if (!this.bones) return;
    const smooth = 1 - Math.pow(0.001, dt); // fluid, frame-rate independent lerp

    const c = this.cur, t = this.target;
    for (const k in c.curl) c.curl[k] = lerp(c.curl[k], t.curl[k], smooth);
    c.present = lerp(c.present, t.present, smooth);

    const p = c.present;

    // thumb -> head
    this._poseBone("head", AXIS_X, c.curl.thumb * 0.5 * p);

    // index -> right arm, middle -> left arm
    this._poseBone("forearm_R", AXIS_X, -c.curl.index * 0.7 * p);
    this._poseBone("upperarm_R", AXIS_Z, -c.curl.index * 0.3 * p);
    this._poseBone("forearm_L", AXIS_X, -c.curl.middle * 0.7 * p);
    this._poseBone("upperarm_L", AXIS_Z, c.curl.middle * 0.3 * p);

    // ring -> right leg, pinky -> left leg
    this._poseBone("lowerleg_R", AXIS_X, c.curl.ring * 0.5 * p);
    this._poseBone("upperleg_R", AXIS_X, -c.curl.ring * 0.25 * p);
    this._poseBone("lowerleg_L", AXIS_X, c.curl.pinky * 0.5 * p);
    this._poseBone("upperleg_L", AXIS_X, -c.curl.pinky * 0.25 * p);

    // tail sways passively with overall hand openness, for flavor
    const openness = 1 - (c.curl.index + c.curl.middle + c.curl.ring + c.curl.pinky) / 4;
    this._poseBone("tail1", AXIS_X, openness * 0.25 * p);
    this._poseBone("tail2", AXIS_X, openness * 0.2 * p);
  }

  // Free hand-driven camera orbit: wrist position rotates the view
  // (left/right and up/down, unrestricted — no clamped range like the limb
  // poses above), and overall hand size (closer hand = bigger in frame)
  // drives zoom. Delta-based, like a drag gesture, so it composes into full,
  // continuous rotation rather than being limited to the camera's field of
  // view. Falls back to normal mouse OrbitControls whenever no hand is seen.
  _updateCamera() {
    if (!this.camera || !this.controls) return;
    const cam = this.camera, ctl = this.controls;
    const t = this.target;
    const active = this.target.present > 0.5;

    if (!active) {
      if (this.orbit) {
        ctl.enabled = true;
        this.orbit = null;
        this.prevWrist = null;
        this.prevHandSize = null;
      }
      return;
    }

    ctl.enabled = false;

    if (!this.orbit) {
      const offset = new THREE.Vector3().subVectors(cam.position, ctl.target);
      const radius = offset.length() || 4;
      this.orbit = {
        theta: Math.atan2(offset.x, offset.z),
        phi: clamp(Math.acos(clamp(offset.y / radius, -1, 1)), MIN_PHI, MAX_PHI),
        radius: clamp(radius, MIN_RADIUS, MAX_RADIUS),
      };
      this.prevWrist = { x: t.wristX, y: t.wristY };
      this.prevHandSize = t.handSize;
    }

    const dx = t.wristX - this.prevWrist.x;
    const dy = t.wristY - this.prevWrist.y;
    const dSize = t.handSize - this.prevHandSize;
    this.prevWrist = { x: t.wristX, y: t.wristY };
    this.prevHandSize = t.handSize;

    this.orbit.theta += dx * ROT_SENSITIVITY;
    this.orbit.phi = clamp(this.orbit.phi + dy * ROT_SENSITIVITY, MIN_PHI, MAX_PHI);
    this.orbit.radius = clamp(this.orbit.radius - dSize * ZOOM_SENSITIVITY, MIN_RADIUS, MAX_RADIUS);

    const sinPhiR = Math.sin(this.orbit.phi) * this.orbit.radius;
    cam.position.set(
      ctl.target.x + sinPhiR * Math.sin(this.orbit.theta),
      ctl.target.y + Math.cos(this.orbit.phi) * this.orbit.radius,
      ctl.target.z + sinPhiR * Math.cos(this.orbit.theta)
    );
    cam.lookAt(ctl.target);
  }
}

export const handControl = new HandControl();
