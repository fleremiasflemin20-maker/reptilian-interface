import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { handControl } from "./handcontrol.js";

const MODEL_URL = "models/draconian_rigged.glb";

/* ---------------- lore content ---------------- */
const LORE = {
  origen: {
    tag: "REGISTRO 01",
    title: "El arquetipo del reptil",
    body:
      "La figura del humanoide reptiliano aparece en el folclore de casi todas las civilizaciones antiguas, mucho antes de la ufología moderna. Sirvió como símbolo de sabiduría oculta, poder primordial y transformación: la serpiente muda de piel, y por eso se asoció con la renovación y el conocimiento prohibido.",
    note: "Contenido con fines narrativos y de divulgación cultural — no constituye una afirmación factual sobre seres reales.",
  },
  mitos: {
    tag: "REGISTRO 02",
    title: "Serpientes y dragones ancestrales",
    body:
      "Los Naga de la India eran seres serpiente que habitaban el inframundo y custodiaban tesoros y conocimiento. En Mesoamérica, Quetzalcóatl —la 'serpiente emplumada'— y su equivalente maya Gucumatz fueron venerados como dioses creadores y portadores de sabiduría. El griego Boreas era representado con serpientes en lugar de piernas.",
  },
  teoria: {
    tag: "REGISTRO 03",
    title: "La teoría conspirativa moderna",
    body:
      "Popularizada por David Icke desde 'The Biggest Secret' (1999), sostiene que una élite reptiliana cambiaformas —descendiente de los Anunnaki de la constelación Draco— controla la política mundial. Icke combinó ideas teosóficas de Helena Blavatsky, las teorías de Zecharia Sitchin sobre los Anunnaki y ficción pulp de Robert E. Howard (1929).",
    note: "Teoría sin respaldo científico. Clasificada aquí como fenómeno cultural, no como hecho verificado.",
  },
  cultura: {
    tag: "REGISTRO 04",
    title: "Los Draconianos del cómic",
    body:
      "Los paneles que decoran esta galería pertenecen a 'DragonLance: Draconians' (DC/TSR, 1990), donde los draconianos —guerreros reptiles nacidos de huevos de dragón corrompidos— sirven al Imperio Oscuro de Krynn. La serie ayudó a popularizar al humanoide-dragón como villano recurrente del cómic de fantasía.",
    note: "Arte con fines de homenaje y contexto histórico del personaje — derechos de sus autores y editoriales originales.",
  },
};

/* ---------------- DOM refs ---------------- */
const loaderEl = document.getElementById("loader");
const loaderFill = document.getElementById("loader-fill");
const loaderStatus = document.getElementById("loader-status");
const loreBody = document.getElementById("lore-body");
const clockEl = document.getElementById("clock");
const rx = document.getElementById("rx"), ry = document.getElementById("ry"), rz = document.getElementById("rz");

function renderLore(key) {
  const d = LORE[key];
  loreBody.innerHTML = `
    <div class="lore-entry">
      <span class="tag">${d.tag}</span>
      <h3>${d.title}</h3>
      <p class="typewriter" id="tw-text"></p>
      ${d.note ? `<div class="note">${d.note}</div>` : ""}
    </div>`;
  typewrite(document.getElementById("tw-text"), d.body);
}

let twTimer = null;
function typewrite(el, text) {
  clearTimeout(twTimer);
  let i = 0;
  el.textContent = "";
  const step = () => {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i += 2;
      twTimer = setTimeout(step, 8);
    } else {
      el.classList.remove("typewriter");
    }
  };
  el.classList.add("typewriter");
  step();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderLore(btn.dataset.tab);
  });
});
renderLore("origen");

function wirePanelToggle(panelId, headSelector, btnId) {
  const panel = document.getElementById(panelId);
  const head = panel.querySelector(headSelector);
  const btn = document.getElementById(btnId);
  head.addEventListener("click", () => {
    const isCollapsed = panel.classList.toggle("collapsed");
    btn.textContent = isCollapsed ? "+" : "—";
  });
}
wirePanelToggle("panel-lore", ".panel-head", "lore-toggle");
wirePanelToggle("panel-spec", ".panel-head", "spec-toggle");

function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("es-ES", { hour12: false });
}
tickClock();
setInterval(tickClock, 1000);

/* ---------------- three.js scene ---------------- */
const canvas = document.getElementById("scene");
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120608, 0.028);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(3.2, 1.8, 4.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x120608, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.92;
controls.target.set(0, 1, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 1.4;

handControl.setCamera(camera, controls);

/* lighting: classic comic hero-shot — warm key, blue fill, red rim */
const key = new THREE.SpotLight(0xfff0c8, 60, 20, Math.PI / 5, 0.4, 1.2);
key.position.set(4, 6, 3);
scene.add(key);

const fill = new THREE.PointLight(0x1c6fd6, 16, 15, 2);
fill.position.set(-4, 2, -2);
scene.add(fill);

const rim = new THREE.PointLight(0xe0202c, 12, 15, 2);
rim.position.set(0, 1.5, -4);
scene.add(rim);

const ambient = new THREE.AmbientLight(0x33201c, 0.9);
scene.add(ambient);

/* ink-ring ground marks */
const ringMat = new THREE.MeshBasicMaterial({ color: 0xe0202c, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.45, 64), ringMat);
ring.rotation.x = -Math.PI / 2;
scene.add(ring);

const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xffcf27, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.025, 64), ring2Mat);
ring2.rotation.x = -Math.PI / 2;
scene.add(ring2);

/* drifting ink-dust particles */
const particleCount = 260;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 20;
  positions[i * 3 + 1] = Math.random() * 8;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
}
particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({ color: 0xffcf27, size: 0.025, transparent: true, opacity: 0.6 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

/* ---------------- loading manager (shared by model + comic wall) ---------------- */
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  loaderFill.style.width = pct + "%";
  loaderStatus.textContent = `CARGANDO LA BESTIA... ${pct}%`;
};
manager.onError = (url) => {
  loaderStatus.textContent = "¡ERROR DE CARGA! REINTENTANDO...";
};

/* ---------------- comic panel wall ---------------- */
const COMIC_FILES = [
  "comics/panel-01-cover.jpg",
  "comics/panel-02-attack.jpg",
  "comics/panel-03-disguise.jpg",
  "comics/panel-04-duel.jpg",
  "comics/panel-05-warrior.jpg",
  "comics/panel-06-icedragon.jpg",
];
const MAT_COLORS = [0xffcf27, 0xe0202c];
const WALL_RADIUS = 16;
const wallGroup = new THREE.Group();
scene.add(wallGroup);

const comicTexLoader = new THREE.TextureLoader(manager);
COMIC_FILES.forEach((url, i) => {
  const angle = (i / COMIC_FILES.length) * Math.PI * 2;
  const panelY = 2.3 + (i % 2 === 0 ? 0.35 : -0.15);

  comicTexLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const aspect = tex.image.width / tex.image.height;
    const h = 5.2;
    const w = h * aspect;
    const tilt = (Math.random() - 0.5) * 0.1;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    function makeLayer(radiusOffset, geo, mat) {
      const r = WALL_RADIUS + radiusOffset;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(r * sin, panelY, r * cos);
      mesh.lookAt(0, panelY, 0);
      mesh.rotateZ(tilt);
      wallGroup.add(mesh);
      return mesh;
    }

    // frame sits farthest from the origin (behind), image nearest (in front)
    makeLayer(0.5, new THREE.PlaneGeometry(w + 0.5, h + 0.5), new THREE.MeshBasicMaterial({ color: 0x0c0c0c }));
    makeLayer(0.25, new THREE.PlaneGeometry(w + 0.24, h + 0.24), new THREE.MeshBasicMaterial({ color: MAT_COLORS[i % 2] }));
    makeLayer(0, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  });
});

/* post-processing */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.35, 0.4, 0.82
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
let bloomOn = true;

/* ---------------- model loading ---------------- */
let model = null;
let wireOn = false;

const gltfLoader = new GLTFLoader(manager);
gltfLoader.load(
  MODEL_URL,
  (gltf) => {
    model = gltf.scene;

    // Scale-to-fit (max dim 2.6) and ground-centering live on the armature
    // object's own transform inside the file, baked in at export time — no
    // runtime scale/position is applied to the loaded model here.

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          child.material.envMapIntensity = 1.2;
        }
      }
    });

    scene.add(model);

    const bones = {};
    model.traverse((child) => {
      if (child.isBone) bones[child.name] = child;
    });
    handControl.setBones(bones);
    handControl.setModel(model);

    const newBox = new THREE.Box3().setFromObject(model);
    const newCenter = newBox.getCenter(new THREE.Vector3());
    controls.target.copy(newCenter);

    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    loaderStatus.textContent = "¡LA BESTIA HA DESPERTADO!";
    setTimeout(() => loaderEl.classList.add("hidden"), 500);
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loaderFill.style.width = pct + "%";
      loaderStatus.textContent = `CARGANDO LA BESTIA... ${pct}%`;
    }
  },
  (err) => {
    console.error(err);
    loaderStatus.textContent = "¡FALLO AL CARGAR EL MODELO!";
  }
);

let mixer = null;

/* ---------------- dock controls ---------------- */
const btnRotate = document.getElementById("btn-rotate");
const btnWire = document.getElementById("btn-wire");
const btnBloom = document.getElementById("btn-bloom");
const btnLight = document.getElementById("btn-light");
const btnReset = document.getElementById("btn-reset");

btnRotate.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.classList.toggle("active", controls.autoRotate);
});

btnWire.addEventListener("click", () => {
  wireOn = !wireOn;
  btnWire.classList.toggle("active", wireOn);
  if (model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) child.material.wireframe = wireOn;
    });
  }
});

btnBloom.addEventListener("click", () => {
  bloomOn = !bloomOn;
  btnBloom.classList.toggle("active", bloomOn);
  bloomPass.enabled = bloomOn;
});

const lightPalettes = [
  { key: 0xfff0c8, fill: 0x1c6fd6, rim: 0xe0202c, ring: 0xe0202c, ring2: 0xffcf27, dust: 0xffcf27 },
  { key: 0xffcf27, fill: 0xe0202c, rim: 0x1c6fd6, ring: 0xffcf27, ring2: 0x1c6fd6, dust: 0xe0202c },
  { key: 0xe0202c, fill: 0xffcf27, rim: 0x2f9e44, ring: 0xe0202c, ring2: 0x2f9e44, dust: 0xffcf27 },
  { key: 0x1c6fd6, fill: 0x2f9e44, rim: 0xffcf27, ring: 0x1c6fd6, ring2: 0xffcf27, dust: 0x2f9e44 },
];
let paletteIdx = 0;
btnLight.addEventListener("click", () => {
  paletteIdx = (paletteIdx + 1) % lightPalettes.length;
  const p = lightPalettes[paletteIdx];
  key.color.setHex(p.key);
  fill.color.setHex(p.fill);
  rim.color.setHex(p.rim);
  ringMat.color.setHex(p.ring);
  ring2Mat.color.setHex(p.ring2);
  particleMat.color.setHex(p.dust);
  btnLight.classList.add("active");
  setTimeout(() => btnLight.classList.remove("active"), 300);
});

btnReset.addEventListener("click", () => {
  camera.position.set(3.2, 1.8, 4.4);
  controls.target.set(0, model ? 1 : 0, 0);
  controls.update();
});

/* ---------------- hand tracking ---------------- */
const btnHand = document.getElementById("btn-hand");
const handPanel = document.getElementById("hand-panel");
handControl.attachDOM({
  video: document.getElementById("hand-video"),
  overlayCanvas: document.getElementById("hand-canvas"),
  statusEl: document.getElementById("hand-status"),
});

btnHand.addEventListener("click", async () => {
  btnHand.disabled = true;
  try {
    const isActive = await handControl.toggle();
    btnHand.classList.toggle("active", isActive);
    handPanel.classList.toggle("visible", isActive);
  } catch (err) {
    handPanel.classList.remove("visible");
  } finally {
    btnHand.disabled = false;
  }
});

/* ---------------- resize ---------------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- animation loop ---------------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  controls.update();
  if (mixer) mixer.update(dt);
  handControl.update(dt);

  ring.rotation.z += dt * 0.15;
  ring2.rotation.z -= dt * 0.1;
  ring.material.opacity = 0.45 + Math.sin(t * 1.5) * 0.15;

  particles.rotation.y += dt * 0.02;
  const posAttr = particleGeo.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    let y = posAttr.getY(i) + dt * 0.15;
    if (y > 8) y = 0;
    posAttr.setY(i, y);
  }
  posAttr.needsUpdate = true;

  key.intensity = 55 + Math.sin(t * 2.2) * 6;

  if (model) {
    rx.textContent = model.rotation.x.toFixed(3);
    ry.textContent = (t * 0.1 % (Math.PI * 2)).toFixed(3);
    rz.textContent = camera.position.distanceTo(controls.target).toFixed(3);
  }

  composer.render();
}
animate();
