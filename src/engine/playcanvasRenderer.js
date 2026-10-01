// PlayCanvas 3D renderer.
// Gameplay, AI and physics remain in engine.js; this module owns only the match presentation.
import {
  Application,
  BLEND_NORMAL,
  Color,
  Entity,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
  StandardMaterial,
  Texture,
  TONEMAP_ACES,
  Vec2,
  Vec3,
} from 'playcanvas';

const FW = 1389;
const FH = 900;
const UNIT_PER_M = FW / 105;
const PLAYER_HEIGHT = 1.78 * UNIT_PER_M;
const BALL_RADIUS = 0.24 * UNIT_PER_M;
const BALL_Z_SCALE = 0.6;

let active = false;
let app = null;
let sceneRoot = null;
let camera = null;
let canvas = null;
let stageEl = null;
let resizeHandler = null;
let players = [];
let playerMaterials = null;
let ball = null;
let focusRing = null;
let camX = FW / 2;
let camZ = FH / 2;
let lastFrameTime = 0;
let lastBall = null;
let quality = 'balanced';
let qualitySignature = '';

function hexColor(hex, fallback = '#ffffff') {
  const value = String(hex || fallback).replace('#', '');
  const n = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  const safe = Number.isFinite(n) ? n : 0xffffff;
  return new Color(((safe >> 16) & 255) / 255, ((safe >> 8) & 255) / 255, (safe & 255) / 255);
}

function makeMaterial(color, opts = {}) {
  const mat = new StandardMaterial();
  mat.diffuse = hexColor(color);
  mat.gloss = opts.gloss ?? 0.15;
  mat.metalness = opts.metalness ?? 0;
  mat.useMetalness = true;
  mat.opacity = opts.opacity ?? 1;
  mat.blendType = opts.blendType ?? BLEND_NORMAL;
  mat.depthWrite = opts.depthWrite !== false;
  if (opts.diffuseMap) mat.diffuseMap = opts.diffuseMap;
  if (opts.emissive) mat.emissive = hexColor(opts.emissive);
  mat.update();
  return mat;
}

function makeTexture(source, opts = {}) {
  const tex = new Texture(app.graphicsDevice, {
    srgb: true,
    mipmaps: true,
    anisotropy: opts.anisotropy || 8,
  });
  tex.setSource(source);
  tex.upload();
  return tex;
}

function makeFieldCanvas() {
  const size = quality === 'high' ? 1536 : quality === 'balanced' ? 1024 : 768;
  const h = Math.round(size * (FH / FW));
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = h;
  const x = cv.getContext('2d');
  const stripes = 18;
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 ? '#2e9148' : '#349d50';
    x.fillRect((i * size) / stripes, 0, size / stripes + 1, h);
  }
  x.globalAlpha = 0.14;
  for (let i = 0; i < (quality === 'high' ? 900 : 300); i++) {
    const px = Math.random() * size;
    const py = Math.random() * h;
    x.fillStyle = Math.random() > 0.5 ? '#d9f4c5' : '#075e28';
    x.fillRect(px, py, 2, 1);
  }
  x.globalAlpha = 1;
  const mx = (v) => (v / FW) * size;
  const my = (v) => (v / FH) * h;
  const m = (v) => v * UNIT_PER_M;
  x.strokeStyle = 'rgba(255,255,255,.96)';
  x.lineWidth = Math.max(3, size / 430);
  x.lineJoin = 'round';
  x.strokeRect(7, 7, size - 14, h - 14);
  x.beginPath();
  x.moveTo(size / 2, 7);
  x.lineTo(size / 2, h - 7);
  x.stroke();
  x.beginPath();
  x.arc(size / 2, h / 2, mx(m(9.15)), 0, Math.PI * 2);
  x.stroke();
  const boxD = mx(m(16.5));
  const boxW = my(m(40.32));
  const goalD = mx(m(5.5));
  const goalW = my(m(18.32));
  x.strokeRect(7, (h - boxW) / 2, boxD, boxW);
  x.strokeRect(size - 7 - boxD, (h - boxW) / 2, boxD, boxW);
  x.strokeRect(7, (h - goalW) / 2, goalD, goalW);
  x.strokeRect(size - 7 - goalD, (h - goalW) / 2, goalD, goalW);
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(size / 2, h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
  x.arc(7 + mx(m(11)), h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
  x.arc(size - 7 - mx(m(11)), h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
  x.fill();
  return cv;
}

function makeCrowdCanvas() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 192;
  const x = cv.getContext('2d');
  x.fillStyle = '#111820';
  x.fillRect(0, 0, cv.width, cv.height);
  const colors = ['#e63946', '#3a86ff', '#ffd60a', '#f5f5f5', '#4ade80', '#c084fc', '#fb923c'];
  for (let y = 12; y < cv.height - 10; y += 8) {
    for (let px = 6; px < cv.width - 6; px += 7) {
      x.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      x.beginPath();
      x.arc(px + Math.random() * 2, y + Math.random() * 2, 1.6 + Math.random(), 0, Math.PI * 2);
      x.fill();
    }
  }
  return cv;
}

function makeBallCanvas() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#f8fafc';
  x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#161b22';
  [[32, 28], [92, 20], [160, 30], [224, 24], [62, 82], [130, 74], [198, 84]].forEach(([px, py]) => {
    x.beginPath();
    x.arc(px, py, 13, 0, Math.PI * 2);
    x.fill();
  });
  return cv;
}

function makeRingCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = '#ffd60a';
  x.lineWidth = 8;
  x.beginPath();
  x.arc(64, 64, 50, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.92)';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(64, 64, 58, 0, Math.PI * 2);
  x.stroke();
  return cv;
}

function addRenderEntity(name, type, material, position, scale, parent = sceneRoot) {
  const entity = new Entity(name);
  entity.addComponent('render', { type });
  entity.render.material = material;
  entity.setPosition(position[0], position[1], position[2]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  parent.addChild(entity);
  return entity;
}

function addAdBoards(adMaterial) {
  const count = quality === 'low' ? 10 : 18;
  for (let i = 0; i < count; i++) {
    const w = FW / count;
    const board = addRenderEntity('ad', 'box', adMaterial, [w * (i + 0.5), 4, -26], [w - 2, 7, 2]);
    board.setLocalEulerAngles(0, 0, 0);
    if (quality !== 'low') {
      addRenderEntity('ad-far', 'box', adMaterial, [w * (i + 0.5), 4, FH + 26], [w - 2, 7, 2]);
    }
  }
}

function buildStadium(crowdMaterial) {
  const standHeight = quality === 'high' ? 106 : 74;
  const standDepth = quality === 'high' ? 116 : 86;
  const standY = standHeight / 2;
  addRenderEntity('stand-n', 'box', crowdMaterial, [FW / 2, standY, -standDepth * 0.52], [FW + 170, standHeight, standDepth]);
  addRenderEntity('stand-s', 'box', crowdMaterial, [FW / 2, standY, FH + standDepth * 0.52], [FW + 170, standHeight, standDepth]);
  addRenderEntity('stand-w', 'box', crowdMaterial, [-standDepth * 0.52, standY, FH / 2], [standDepth, standHeight, FH + 170]);
  addRenderEntity('stand-e', 'box', crowdMaterial, [FW + standDepth * 0.52, standY, FH / 2], [standDepth, standHeight, FH + 170]);
  if (quality === 'high') {
    const roofMat = makeMaterial('#2b3238', { gloss: 0.28 });
    addRenderEntity('roof-n', 'box', roofMat, [FW / 2, 136, -72], [FW + 240, 8, 150]);
    addRenderEntity('roof-s', 'box', roofMat, [FW / 2, 136, FH + 72], [FW + 240, 8, 150]);
    addRenderEntity('roof-w', 'box', roofMat, [-72, 136, FH / 2], [150, 8, FH + 240]);
    addRenderEntity('roof-e', 'box', roofMat, [FW + 72, 136, FH / 2], [150, 8, FH + 240]);
  }
}

function buildGoal(sign, postMat, netMat) {
  const x = sign < 0 ? 20 : FW - 20;
  addRenderEntity('post-a', 'cylinder', postMat, [x, 11, FH / 2 - 86], [3.1, 22, 3.1]);
  addRenderEntity('post-b', 'cylinder', postMat, [x, 11, FH / 2 + 86], [3.1, 22, 3.1]);
  addRenderEntity('crossbar', 'box', postMat, [x, 22, FH / 2], [3.1, 3.1, 172]);
  const netX = x + sign * 22;
  addRenderEntity('net-back', 'plane', netMat, [netX, 11, FH / 2], [0.5, 22, 172]);
  addRenderEntity('net-top', 'plane', netMat, [x + sign * 11, 22, FH / 2], [22, 1, 172]);
}

function buildBall(ballTexture) {
  const ballMat = makeMaterial('#ffffff', { gloss: 0.62, metalness: 0.02, diffuseMap: ballTexture });
  ball = addRenderEntity('ball', 'sphere', ballMat, [FW / 2, BALL_RADIUS, FH / 2], [BALL_RADIUS * 2, BALL_RADIUS * 2, BALL_RADIUS * 2]);
}

function buildPlayer(team, isGK, materials) {
  const root = new Entity('player');
  const jersey = materials[team][isGK ? 1 : 0];
  const shorts = materials[team][2];
  const skin = materials[2][0];
  const boot = materials[2][1];
  const body = addRenderEntity('body', 'capsule', jersey, [0, 15, 0], [6.4, 7.5, 6.4], root);
  addRenderEntity('head', 'sphere', skin, [0, 24.2, 0], [6.3, 6.3, 6.3], root);
  addRenderEntity('shorts', 'cylinder', shorts, [0, 7.2, 0], [6.5, 3.4, 6.5], root);
  addRenderEntity('leg-l', 'cylinder', boot, [-2.5, 3.6, 0], [2.2, 7.2, 2.2], root);
  addRenderEntity('leg-r', 'cylinder', boot, [2.5, 3.6, 0], [2.2, 7.2, 2.2], root);
  addRenderEntity('arm-l', 'cylinder', jersey, [-6.3, 16.2, 0], [2.05, 7.4, 2.05], root).setLocalEulerAngles(0, 0, -0.34);
  addRenderEntity('arm-r', 'cylinder', jersey, [6.3, 16.2, 0], [2.05, 7.4, 2.05], root).setLocalEulerAngles(0, 0, 0.34);
  root.enabled = false;
  sceneRoot.addChild(root);
  return { root, body };
}

function buildPlayers() {
  const home = makeMaterial('#e63946', { gloss: 0.34 });
  const homeGk = makeMaterial('#2fbf71', { gloss: 0.32 });
  const away = makeMaterial('#3a86ff', { gloss: 0.34 });
  const awayGk = makeMaterial('#ffd166', { gloss: 0.32 });
  const shortsHome = makeMaterial('#ffffff', { gloss: 0.18 });
  const shortsAway = makeMaterial('#18243a', { gloss: 0.18 });
  const skin = makeMaterial('#d9a066', { gloss: 0.14 });
  const boot = makeMaterial('#111827', { gloss: 0.24 });
  playerMaterials = [
    [home, homeGk, shortsHome],
    [away, awayGk, shortsAway],
    [skin, boot],
  ];
  players = Array.from({ length: 22 }, (_, i) => buildPlayer(i < 11 ? 0 : 1, i === 0 || i === 11, playerMaterials));
}

function updateKitColors(teams) {
  if (!teams || !playerMaterials) return;
  const sig = teams.map((t) => [t.name, t.jersey, t.gkJersey, t.shorts].join('|')).join('~');
  if (sig === qualitySignature) return;
  qualitySignature = sig;
  teams.forEach((team, i) => {
    if (!team) return;
    playerMaterials[i][0].diffuse = hexColor(team.jersey);
    playerMaterials[i][1].diffuse = hexColor(team.gkJersey || '#2fbf71');
    playerMaterials[i][2].diffuse = hexColor(team.shorts || (i === 0 ? '#ffffff' : '#18243a'));
    playerMaterials[i].forEach((m) => m.update());
  });
}

function buildScene(container, onExit) {
  canvas = document.createElement('canvas');
  canvas.id = 'stage3d-canvas';
  app = new Application(canvas, {
    graphicsDeviceOptions: {
      antialias: quality !== 'low',
      alpha: false,
      powerPreference: quality === 'high' ? 'high-performance' : 'default',
    },
  });
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.graphicsDevice.maxPixelRatio = quality === 'high' ? 1.5 : 1;
  app.scene.ambientLight = new Color(0.42, 0.48, 0.54);
  app.scene.tonemapping = TONEMAP_ACES;
  app.autoRender = false;

  sceneRoot = new Entity('match-scene');
  app.root.addChild(sceneRoot);

  const fieldTex = makeTexture(makeFieldCanvas(), { anisotropy: quality === 'low' ? 2 : 8 });
  const fieldMat = makeMaterial('#ffffff', { gloss: 0.02, diffuseMap: fieldTex });
  addRenderEntity('field', 'plane', fieldMat, [FW / 2, 0, FH / 2], [FW, 1, FH]);

  const apronMat = makeMaterial('#184a2f', { gloss: 0 });
  addRenderEntity('apron', 'plane', apronMat, [FW / 2, -0.45, FH / 2], [FW + 300, 1, FH + 250]);

  const crowdMat = makeMaterial('#ffffff', { gloss: 0.06, diffuseMap: makeTexture(makeCrowdCanvas(), { anisotropy: 2 }) });
  buildStadium(crowdMat);

  const postMat = makeMaterial('#f4f7fb', { gloss: 0.7, metalness: 0.55 });
  const netMat = makeMaterial('#ffffff', { gloss: 0.1, opacity: 0.18 });
  netMat.blendType = BLEND_NORMAL;
  netMat.depthWrite = false;
  netMat.update();
  buildGoal(-1, postMat, netMat);
  buildGoal(1, postMat, netMat);

  const adMat = makeMaterial('#0b3d91', { gloss: 0.24, emissive: '#071b3e' });
  addAdBoards(adMat);
  buildPlayers();
  buildBall(makeTexture(makeBallCanvas(), { anisotropy: 2 }));

  const ringMat = makeMaterial('#ffffff', {
    gloss: 0,
    diffuseMap: makeTexture(makeRingCanvas(), { anisotropy: 2 }),
    opacity: 0.96,
    depthWrite: false,
  });
  ringMat.blendType = BLEND_NORMAL;
  ringMat.update();
  focusRing = addRenderEntity('focus-ring', 'plane', ringMat, [0, 0.55, 0], [14, 1, 14]);
  focusRing.enabled = false;

  camera = new Entity('camera');
  camera.addComponent('camera', {
    clearColor: new Color(0.035, 0.12, 0.075),
    fov: 32,
    nearClip: 1,
    farClip: 6500,
    frustumCulling: true,
  });
  sceneRoot.addChild(camera);
  camera.setPosition(FW / 2, 430, FH + 330);
  camera.lookAt(FW / 2, 0, FH / 2);

  const sun = new Entity('sun');
  sun.addComponent('light', {
    type: 'directional',
    color: new Color(1, 0.96, 0.86),
    intensity: quality === 'high' ? 1.75 : 1.35,
    castShadows: false,
  });
  sun.setEulerAngles(52, -34, 0);
  sceneRoot.addChild(sun);

  stageEl = document.createElement('div');
  stageEl.id = 'stage3d';
  stageEl.appendChild(canvas);
  const tag = document.createElement('div');
  tag.className = 'stage3d-tag';
  tag.textContent = quality === 'high' ? 'PlayCanvas · 高画质' : quality === 'balanced' ? 'PlayCanvas · 均衡' : 'PlayCanvas · 流畅';
  stageEl.appendChild(tag);
  if (onExit) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage3d-exit';
    btn.textContent = '返回 2D';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      onExit();
    });
    stageEl.appendChild(btn);
  }
  container.appendChild(stageEl);
  resizeHandler = () => app && app.resizeCanvas();
  window.addEventListener('resize', resizeHandler);
  app.start();
  app.resizeCanvas();
}

export function start3D(container, onExit) {
  if (active) return true;
  const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 4);
  const dpr = Number(window.devicePixelRatio || 1);
  quality = mobile || memory <= 4 || cores <= 4 ? 'low' : dpr > 2 ? 'balanced' : 'high';
  qualitySignature = '';
  try {
    buildScene(container, onExit);
  } catch (error) {
    console.error('PlayCanvas 初始化失败', error);
    stop3D();
    return false;
  }
  active = true;
  camX = FW / 2;
  camZ = FH / 2;
  lastFrameTime = 0;
  lastBall = null;
  return true;
}

export function stop3D() {
  active = false;
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
  if (stageEl && stageEl.parentNode) stageEl.parentNode.removeChild(stageEl);
  stageEl = null;
  if (app) app.destroy();
  app = null;
  sceneRoot = null;
  camera = null;
  canvas = null;
  players = [];
  playerMaterials = null;
  ball = null;
  focusRing = null;
  qualitySignature = '';
  lastFrameTime = 0;
  lastBall = null;
}

export function render3DFrame(snap) {
  if (!active || !app || !snap) return;
  const now = performance.now();
  const interval = quality === 'high' ? 1000 / 60 : quality === 'balanced' ? 1000 / 45 : 1000 / 30;
  if (lastFrameTime && now - lastFrameTime < interval - 1) return;
  const dt = lastFrameTime ? Math.min(0.08, (now - lastFrameTime) / 1000) : 1 / 60;
  lastFrameTime = now;
  if (snap.teams) updateKitColors(snap.teams);
  if (!players.length) return;

  const activeIdx = Math.max(0, snap.players.findIndex((p) => p.active));
  snap.players.forEach((p, i) => {
    const player = players[i];
    if (!player) return;
    player.root.enabled = true;
    player.root.setPosition(p.x, 0, p.y);
    player.root.setEulerAngles(0, Math.atan2(p.faceX || 0, p.faceY || (p.team === 0 ? 1 : -1)) * 180 / Math.PI, 0);
  });
  if (focusRing) {
    const p = snap.players[activeIdx];
    focusRing.enabled = !!p;
    if (p) focusRing.setPosition(p.x, 0.55, p.y);
  }

  if (ball) {
    const z = (snap.ball.z || 0) * BALL_Z_SCALE;
    ball.setPosition(snap.ball.x, z + BALL_RADIUS, snap.ball.y);
    if (lastBall) {
      const vx = snap.ball.vx || 0;
      const vy = snap.ball.vy || 0;
      const speed = Math.hypot(vx, vy);
      if (speed > 0.01) ball.rotateLocal(0, 0, speed * dt * 4.5);
    }
    lastBall = { x: snap.ball.x, y: snap.ball.y, z };
  }

  const focus = snap.focus || { x: snap.ball.x, y: snap.ball.y };
  const targetX = Math.max(FW * 0.14, Math.min(FW * 0.86, focus.x));
  const targetZ = Math.max(70, Math.min(FH - 70, focus.y));
  camX += (targetX - camX) * Math.min(1, dt * 3.2);
  camZ += (targetZ - camZ) * Math.min(1, dt * 2.8);
  camera.setPosition(camX, quality === 'low' ? 470 : 430, FH + 330);
  camera.lookAt(camX, 0, camZ);
  app.render();
}
