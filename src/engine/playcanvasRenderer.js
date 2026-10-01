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
import playerUrl from '../assets/player.glb?url';

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
let playerTemplateAsset = null;

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
  const penR = mx(m(10));
  const penL = 7 + mx(m(11));
  const penRight = size - 7 - mx(m(11));
  x.beginPath();
  x.arc(penL, h / 2, penR, -Math.PI / 2, Math.PI / 2);
  x.stroke();
  x.beginPath();
  x.arc(penRight, h / 2, penR, Math.PI / 2, -Math.PI / 2);
  x.stroke();
  const cornerR = mx(m(1));
  [[7, 7, 0], [size - 7, 7, Math.PI / 2], [size - 7, h - 7, Math.PI], [7, h - 7, -Math.PI / 2]].forEach(([cx, cy, angle]) => {
    x.beginPath();
    x.arc(cx, cy, cornerR, angle, angle + Math.PI / 2);
    x.stroke();
  });
  x.save();
  x.translate(size / 2, h / 2);
  x.rotate(-0.11);
  x.fillStyle = 'rgba(255,255,255,.11)';
  x.font = `900 ${Math.max(28, size / 12)}px "Arial Black", sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('GREEN PITCH', 0, 0);
  x.restore();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(size / 2, h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
  x.arc(penL, h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
  x.arc(penRight, h / 2, Math.max(2, size / 300), 0, Math.PI * 2);
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

function makeAdCanvas(index) {
  const palettes = [
    ['#0b3d91', '#0a2a63', 'PLAY FOOTBALL'],
    ['#c8102e', '#7a0a1c', 'MATCH DAY'],
    ['#0f7a4a', '#064a2c', 'GREEN PITCH'],
    ['#f2c14e', '#c98a12', 'KICKOFF 2026'],
    ['#111827', '#374151', 'WORLD STAGE'],
    ['#6d28d9', '#3b0f80', 'LIVE FOOTBALL'],
  ];
  const [start, end, label] = palettes[index % palettes.length];
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const x = cv.getContext('2d');
  const grad = x.createLinearGradient(0, 0, cv.width, 0);
  grad.addColorStop(0, start);
  grad.addColorStop(1, end);
  x.fillStyle = grad;
  x.fillRect(0, 0, cv.width, cv.height);
  x.strokeStyle = 'rgba(255,255,255,.62)';
  x.lineWidth = 7;
  x.strokeRect(6, 6, cv.width - 12, cv.height - 12);
  x.fillStyle = index === 3 ? '#1b1b1b' : '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '900 52px "Arial Black", "PingFang SC", sans-serif';
  x.fillText(label, cv.width / 2, cv.height / 2);
  return cv;
}

function makeNetCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(245,250,255,.78)';
  x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 10) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 128);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i);
    x.lineTo(128, i);
    x.stroke();
  }
  return cv;
}

function makeScreenCanvas() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#071018';
  x.fillRect(0, 0, cv.width, cv.height);
  x.strokeStyle = '#36d7ff';
  x.lineWidth = 8;
  x.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  x.fillStyle = '#f8fafc';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '900 58px "Arial Black", sans-serif';
  x.fillText('PLAYCANVAS', cv.width / 2, 92);
  x.fillStyle = '#ffd60a';
  x.font = '700 32px sans-serif';
  x.fillText('FOOTBALL LIVE', cv.width / 2, 158);
  x.fillStyle = '#7dffb0';
  x.font = '600 22px monospace';
  x.fillText('HOME  00 : 00  AWAY', cv.width / 2, 210);
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

function addAdBoards(adMaterials) {
  const count = quality === 'low' ? 12 : 20;
  for (let i = 0; i < count; i++) {
    const w = FW / count;
    const material = adMaterials[i % adMaterials.length];
    addRenderEntity('ad-near', 'box', material, [w * (i + 0.5), 4, FH + 25], [w - 1.5, 7, 2]);
    if (quality !== 'low') {
      addRenderEntity('ad-far', 'box', material, [w * (i + 0.5), 4, -25], [w - 1.5, 7, 2]);
    }
  }
  if (quality === 'high') {
    const endCount = 12;
    for (let i = 0; i < endCount; i++) {
      const w = FH / endCount;
      const material = adMaterials[(i + 2) % adMaterials.length];
      addRenderEntity('ad-west', 'box', material, [-25, 4, w * (i + 0.5)], [2, 7, w - 1.5]);
      addRenderEntity('ad-east', 'box', material, [FW + 25, 4, w * (i + 0.5)], [2, 7, w - 1.5]);
    }
  }
}

function addTierBox(name, along, dir, length, offset, depth, height, baseY, material) {
  const position = along === 'x'
    ? [FW / 2, baseY + height / 2, along === 'x' && dir > 0 ? FH + offset : -offset]
    : [dir > 0 ? FW + offset : -offset, baseY + height / 2, FH / 2];
  const scale = along === 'x'
    ? [length, height, depth]
    : [depth, height, length];
  return addRenderEntity(name, 'box', material, position, scale);
}

function buildStadium(crowdMaterial, screenMaterial) {
  const concrete = makeMaterial('#8d949c', { gloss: 0.16 });
  const dark = makeMaterial('#252c33', { gloss: 0.28 });
  const rail = makeMaterial('#b8c0c8', { gloss: 0.34, metalness: 0.32 });
  const roofMat = makeMaterial('#20272e', { gloss: 0.3, metalness: 0.22 });
  const lampMat = makeMaterial('#fff5cf', { gloss: 0.72, emissive: '#fff0ad' });
  const flagMat = makeMaterial('#ffd60a', { gloss: 0.18, emissive: '#7b5f00' });
  const tiers = quality === 'high'
    ? [[44, 62], [36, 52], [28, 42]]
    : [[62, 92]];
  const baseGap = 20;
  let depthAcum = 0;
  let heightAcum = 0;
  tiers.forEach(([height, depth], tierIndex) => {
    const offset = baseGap + depthAcum + depth / 2;
    const tierMat = tierIndex === 0 && quality === 'high' ? crowdMaterial : concrete;
    addTierBox(`tier-n-${tierIndex}`, 'x', -1, FW + 150, offset, depth, height, heightAcum, tierMat);
    addTierBox(`tier-s-${tierIndex}`, 'x', 1, FW + 150, offset, depth, height, heightAcum, tierMat);
    addTierBox(`tier-w-${tierIndex}`, 'z', -1, FH + 150, offset, depth, height, heightAcum, tierMat);
    addTierBox(`tier-e-${tierIndex}`, 'z', 1, FH + 150, offset, depth, height, heightAcum, tierMat);

    const fasciaOffset = baseGap + depthAcum + 1.5;
    addTierBox(`fascia-n-${tierIndex}`, 'x', -1, FW + 155, fasciaOffset, 3, height + 4, heightAcum, dark);
    addTierBox(`fascia-s-${tierIndex}`, 'x', 1, FW + 155, fasciaOffset, 3, height + 4, heightAcum, dark);
    addTierBox(`fascia-w-${tierIndex}`, 'z', -1, FH + 155, fasciaOffset, 3, height + 4, heightAcum, dark);
    addTierBox(`fascia-e-${tierIndex}`, 'z', 1, FH + 155, fasciaOffset, 3, height + 4, heightAcum, dark);

    const aisleCount = quality === 'high' ? 8 : 0;
    for (let i = 1; i < aisleCount; i++) {
      const x = -70 + (FW + 140) * (i / aisleCount);
      addRenderEntity(`aisle-n-${tierIndex}-${i}`, 'box', rail, [x, heightAcum + height / 2, -fasciaOffset - 0.8], [3, height, 4]);
      addRenderEntity(`aisle-s-${tierIndex}-${i}`, 'box', rail, [x, heightAcum + height / 2, FH + fasciaOffset + 0.8], [3, height, 4]);
      const z = -70 + (FH + 140) * (i / aisleCount);
      addRenderEntity(`aisle-w-${tierIndex}-${i}`, 'box', rail, [-fasciaOffset - 0.8, heightAcum + height / 2, z], [4, height, 3]);
      addRenderEntity(`aisle-e-${tierIndex}-${i}`, 'box', rail, [FW + fasciaOffset + 0.8, heightAcum + height / 2, z], [4, height, 3]);
    }
    depthAcum += depth;
    heightAcum += height;
  });

  if (quality === 'high') {
    const roofOffset = baseGap + depthAcum * 0.55;
    const roofDepth = depthAcum + 44;
    addRenderEntity('roof-n', 'box', roofMat, [FW / 2, heightAcum + 25, -roofOffset], [FW + 250, 8, roofDepth]);
    addRenderEntity('roof-s', 'box', roofMat, [FW / 2, heightAcum + 25, FH + roofOffset], [FW + 250, 8, roofDepth]);
    addRenderEntity('roof-w', 'box', roofMat, [-roofOffset, heightAcum + 25, FH / 2], [roofDepth, 8, FH + 250]);
    addRenderEntity('roof-e', 'box', roofMat, [FW + roofOffset, heightAcum + 25, FH / 2], [roofDepth, 8, FH + 250]);
    for (let x = -30; x <= FW + 30; x += 170) {
      addRenderEntity('support-n', 'cylinder', dark, [x, (heightAcum + 25) / 2, -baseGap - depthAcum], [4, heightAcum + 25, 4]);
      addRenderEntity('support-s', 'cylinder', dark, [x, (heightAcum + 25) / 2, FH + baseGap + depthAcum], [4, heightAcum + 25, 4]);
    }
    for (let z = 0; z <= FH; z += 170) {
      addRenderEntity('support-w', 'cylinder', dark, [-baseGap - depthAcum, (heightAcum + 25) / 2, z], [4, heightAcum + 25, 4]);
      addRenderEntity('support-e', 'cylinder', dark, [FW + baseGap + depthAcum, (heightAcum + 25) / 2, z], [4, heightAcum + 25, 4]);
    }

    const pylonH = heightAcum + 120;
    [[-55, -55], [FW + 55, -55], [-55, FH + 55], [FW + 55, FH + 55]].forEach(([px, pz], i) => {
      addRenderEntity(`flood-pole-${i}`, 'cylinder', dark, [px, pylonH / 2, pz], [7, pylonH, 7]);
      addRenderEntity(`flood-head-${i}`, 'box', dark, [px, pylonH - 12, pz], [52, 26, 12]);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          addRenderEntity(`flood-lamp-${i}-${row}-${col}`, 'box', lampMat, [px - 17 + col * 17, pylonH - 19 + row * 10, pz], [12, 6, 3]);
        }
      }
    });

    const screenZ = -baseGap - depthAcum - 14;
    addRenderEntity('screen-n-frame', 'box', dark, [FW / 2, heightAcum + 42, screenZ], [174, 96, 8]);
    const screenN = addRenderEntity('screen-n', 'plane', screenMaterial, [FW / 2, heightAcum + 42, screenZ + 5], [160, 1, 82]);
    screenN.setLocalEulerAngles(90, 0, 0);
    const screenS = addRenderEntity('screen-s', 'plane', screenMaterial, [FW / 2, heightAcum + 42, FH - screenZ], [160, 1, 82]);
    screenS.setLocalEulerAngles(-90, 0, 0);
  }

  [[20, 20], [FW - 20, 20], [20, FH - 20], [FW - 20, FH - 20]].forEach(([fx, fz], i) => {
    addRenderEntity(`corner-pole-${i}`, 'cylinder', rail, [fx, 11, fz], [0.8, 22, 0.8]);
    addRenderEntity(`corner-flag-${i}`, 'box', flagMat, [fx + 5, 18, fz], [10, 6, 0.5]);
  });

  // Player tunnels on the two long sides.
  addRenderEntity('tunnel-north', 'box', dark, [FW / 2, 24, -baseGap + 1], [78, 48, 3]);
  addRenderEntity('tunnel-south', 'box', dark, [FW / 2, 24, FH + baseGap - 1], [78, 48, 3]);

  const glass = makeMaterial('#8fd8ff', { gloss: 0.7, opacity: 0.24 });
  glass.blendType = BLEND_NORMAL;
  glass.depthWrite = false;
  glass.update();
  [FW * 0.3, FW * 0.7].forEach((x, i) => {
    const z = FH + 13;
    addRenderEntity(`dugout-back-${i}`, 'box', dark, [x, 10, z + 5], [116, 20, 3]);
    addRenderEntity(`dugout-glass-${i}`, 'box', glass, [x, 11, z], [114, 18, 1.2]);
    addRenderEntity(`dugout-roof-${i}`, 'box', dark, [x, 21, z + 2], [124, 3, 12]);
    if (quality === 'high') {
      for (let seat = -45; seat <= 45; seat += 18) {
        addRenderEntity(`dugout-seat-${i}-${seat}`, 'box', rail, [x + seat, 5, z + 2], [14, 2, 6]);
      }
    }
  });

  if (quality === 'high') {
    const cameraMat = makeMaterial('#d8dee6', { gloss: 0.32, metalness: 0.35 });
    const lensMat = makeMaterial('#111827', { gloss: 0.7, metalness: 0.25 });
    [[165, FH + 34], [FW - 165, FH + 34], [FW / 2, -34]].forEach(([x, z], i) => {
      addRenderEntity(`camera-body-${i}`, 'box', cameraMat, [x, 8, z], [13, 8, 9]);
      addRenderEntity(`camera-lens-${i}`, 'cylinder', lensMat, [x, 8, z + (z > 0 ? -7 : 7)], [4.5, 8, 4.5]).setLocalEulerAngles(90, 0, 0);
      addRenderEntity(`camera-leg-${i}`, 'cylinder', dark, [x, 3, z], [1.1, 7, 1.1]);
    });
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

function softTint(color) {
  return new Color(
    0.48 + color.r * 0.52,
    0.48 + color.g * 0.52,
    0.48 + color.b * 0.52,
  );
}

function upgradePlayersToModels() {
  if (!playerTemplateAsset || !playerTemplateAsset.resource || !players.length) return;
  const resource = playerTemplateAsset.resource;
  const animationAssets = resource.animations || [];
  if (!animationAssets.length) return;
  const animationName = animationAssets[0].name;
  const animationIds = animationAssets.map((asset) => asset.id);

  players.forEach((player, idx) => {
    if (player.model) return;
    const model = resource.instantiateModelEntity({ castShadows: false });
    model.name = `player-model-${idx}`;
    model.setLocalScale(13.23, 13.23, 13.23);
    model.addComponent('animation', {
      assets: animationIds,
      speed: 1,
      activate: true,
      loop: true,
    });
    model.animation.play(animationName);
    player.root.children.forEach((child) => {
      child.enabled = false;
    });
    player.root.addChild(model);
    player.model = model;

    const team = idx < 11 ? 0 : 1;
    const isGK = idx === 0 || idx === 11;
    const tint = softTint(playerMaterials[team][isGK ? 1 : 0].diffuse);
    model.model.meshInstances.forEach((meshInstance) => {
      const material = meshInstance.material.clone();
      material.diffuse = tint.clone();
      material.emissive = new Color(tint.r * 0.06, tint.g * 0.06, tint.b * 0.06);
      material.update();
      meshInstance.material = material;
    });
  });
  if (stageEl) {
    const tag = stageEl.querySelector('.stage3d-tag');
    if (tag) tag.textContent = 'PlayCanvas · 写实';
  }
}

function loadPlayerModels() {
  if (quality !== 'high' || playerTemplateAsset) return;
  app.assets.loadFromUrl(playerUrl, 'container', (error, asset) => {
    if (error) {
      console.warn('PlayCanvas 球员模型加载失败，保留低多边形球员', error);
      return;
    }
    playerTemplateAsset = asset;
    upgradePlayersToModels();
  });
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
  const screenMat = makeMaterial('#ffffff', { gloss: 0.22, emissive: '#122838', diffuseMap: makeTexture(makeScreenCanvas(), { anisotropy: 2 }) });
  buildStadium(crowdMat, screenMat);

  const postMat = makeMaterial('#f4f7fb', { gloss: 0.7, metalness: 0.55 });
  const netMat = makeMaterial('#ffffff', { gloss: 0.1, opacity: 0.72, diffuseMap: makeTexture(makeNetCanvas(), { anisotropy: 2 }) });
  netMat.blendType = BLEND_NORMAL;
  netMat.depthWrite = false;
  netMat.update();
  buildGoal(-1, postMat, netMat);
  buildGoal(1, postMat, netMat);

  const adCount = quality === 'low' ? 3 : 6;
  const adMaterials = Array.from({ length: adCount }, (_, i) => makeMaterial('#ffffff', {
    gloss: 0.22,
    emissive: '#091726',
    diffuseMap: makeTexture(makeAdCanvas(i), { anisotropy: 2 }),
  }));
  addAdBoards(adMaterials);
  buildPlayers();
  loadPlayerModels();
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
  if (import.meta.env.DEV) {
    window.__playCanvasApp = app;
    window.__playCanvasPlayerUrl = playerUrl;
  }
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
  playerTemplateAsset = null;
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
    if (player.model && player.model.animation) {
      player.model.animation.speed = Math.hypot(p.vx || 0, p.vy || 0) < 0.22
        ? 0
        : p.slide ? 0.25 : Math.max(0.65, Math.min(1.9, 0.65 + Math.hypot(p.vx || 0, p.vy || 0) * 0.7));
      player.model.setLocalEulerAngles(p.slide ? -28 : 0, 0, 0);
    }
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
