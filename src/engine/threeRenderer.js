import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import playerUrl from '../assets/player.glb?url';

// 3D 画面渲染器：只负责把引擎状态可视化，玩法/AI/物理仍在 engine.js 中。
const FW = 1389;
const FH = 900;
// 场地 1389×900 单位 ≈ 105m×68m，1 米 ≈ 13.23 单位
const UNIT_PER_M = FW / 105;
const PLAYER_HEIGHT = 2.35 * UNIT_PER_M; // 球员身高 ≈ 2.35m（略高于真人，兼顾可读性）
const BALL_RADIUS = 0.24 * UNIT_PER_M; // 足球半径 ≈ 0.24m（略有放大便于看清）
const BALL_Z_SCALE = 0.6;              // 引擎球高按比例映射到写实球员高度

let active = false;
let renderer = null;
let scene = null;
let camera = null;
let stageEl = null;
let ballMesh = null;
let ballShadow = null;
let playerMeshes = [];
let resizeHandler = null;
let sun = null;
let camX = FW / 2;
let camZ = FH / 2;
let lastBall = null;
let lastFrameTime = 0;
let lowSpec = false;

// ====== 真实球员模型（CC0 写实球员：跑步动画 + 骨骼）======
let playerTemplate = null;      // 载入后的模型模板，用于克隆
let playerClip = null;          // 跑步动画片段
let templateLoading = false;
let templateHeight = 1.7;
let templateBaseYaw = 0;
let templateCenter = new THREE.Vector3();
let templateMinY = 0;
let idleClipTime = 0;           // 跑步动画中最接近“站立”的帧
let kitMaskInfo = null;         // 球衣区域遮罩（上衣/短裤/球袜）
let kitBaseMat = null;          // 原材质（用于派生各队球衣材质）
let kitMaterials = null;        // [[主队, 主队门将], [客队, 客队门将]]
let kitCrestMats = [null, null]; // 每队队徽材质
let kitDefs = null;             // 当前对阵的球衣配置
let kitSig = '';                // 配置签名，变化时重建
let crestLocalMatrix = null;    // 队徽相对胸骨的局部变换
const crestGeo = new THREE.PlaneGeometry(0.135, 0.155);

function makeFieldTexture() {
  const cw = 2048;
  const ch = Math.round(2048 * (FH / FW));
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const x = cv.getContext('2d');

  // 草皮：深浅条纹 + 轻微噪点，避免一片死绿
  const stripes = 18;
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 === 0 ? '#339a4e' : '#2f9048';
    x.fillRect((i * cw) / stripes, 0, cw / stripes + 1, ch);
  }
  const speck = x.createRadialGradient(cw / 2, ch / 2, 60, cw / 2, ch / 2, cw * 0.7);
  speck.addColorStop(0, 'rgba(255,255,255,.05)');
  speck.addColorStop(0.55, 'rgba(0,60,0,.06)');
  speck.addColorStop(1, 'rgba(0,40,0,.16)');
  x.fillStyle = speck;
  x.fillRect(0, 0, cw, ch);

  const mx = (v) => (v / FW) * cw;
  const my = (v) => (v / FH) * ch;
  const m = (meters) => meters * UNIT_PER_M; // 米 → 场地单位
  x.strokeStyle = 'rgba(255,255,255,.95)';
  x.lineWidth = 6;
  x.lineJoin = 'round';
  x.setLineDash([]);

  const line = (a, b, c, d) => {
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(c, d);
    x.stroke();
  };

  x.strokeRect(8, 8, cw - 16, ch - 16);
  line(0, ch / 2, cw, ch / 2);

  // 中圈 9.15m
  x.beginPath();
  x.arc(cw / 2, ch / 2, mx(m(9.15)), 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(cw / 2, ch / 2, 5, 0, Math.PI * 2);
  x.fill();

  // 禁区 16.5m×40.32m、小禁区 5.5m×18.32m（真实比例）
  const boxD = mx(m(16.5));
  const boxW = my(m(40.32));
  const goalD = mx(m(5.5));
  const goalW = my(m(18.32));
  x.strokeRect(8, (ch - boxW) / 2, boxD, boxW);
  x.strokeRect(cw - 8 - boxD, (ch - boxW) / 2, boxD, boxW);
  x.strokeRect(8, (ch - goalW) / 2, goalD, goalW);
  x.strokeRect(cw - 8 - goalD, (ch - goalW) / 2, goalD, goalW);

  // 点球点
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(boxD - mx(m(11)), ch / 2, 5, 0, Math.PI * 2);
  x.arc(cw - boxD + mx(m(11)), ch / 2, 5, 0, Math.PI * 2);
  x.fill();

  // 角球弧 1m
  const cr = mx(m(1));
  [[8, 8, 0], [cw - 8, 8, Math.PI / 2], [cw - 8, ch - 8, Math.PI], [8, ch - 8, -Math.PI / 2]].forEach(([cx0, cy0, a0]) => {
    x.beginPath();
    x.arc(cx0, cy0, cr, a0, a0 + Math.PI / 2);
    x.stroke();
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildGoal(xSign) {
  // 球门立在场地两端：xSign=-1 左门，1 右门
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6 });
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const gx = xSign < 0 ? 1 : FW - 1;
  const zc = FH / 2;
  const half = (7.32 / 2) * UNIT_PER_M;   // 球门半宽 3.66m
  const h = 2.44 * UNIT_PER_M;            // 横梁高 2.44m
  const postR = 1.3;                      // 门柱半径（略放大便于看清）
  const netDepth = 1.6 * UNIT_PER_M;

  const postGeo = new THREE.CylinderGeometry(postR, postR, h, 10);
  const p1 = new THREE.Mesh(postGeo, postMat);
  p1.position.set(gx, h / 2, zc - half);
  const p2 = new THREE.Mesh(postGeo, postMat);
  p2.position.set(gx, h / 2, zc + half);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, half * 2, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(gx, h, zc);
  g.add(p1, p2, bar);

  // 简化球网：两块侧面 + 顶面
  const side1 = new THREE.Mesh(new THREE.PlaneGeometry(netDepth, h), netMat);
  side1.position.set(gx + (xSign < 0 ? netDepth / 2 : -netDepth / 2), h / 2, zc - half);
  const side2 = side1.clone();
  side2.position.z = zc + half;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(netDepth, half * 2), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(gx + (xSign < 0 ? netDepth / 2 : -netDepth / 2), h, zc);
  g.add(side1, side2, top);
  return g;
}

function buildPlayer(team, isGK) {
  const g = new THREE.Group();
  const jersey = new THREE.MeshStandardMaterial({
    color: team === 0 ? 0xe63946 : 0x3a86ff,
    roughness: 0.45,
    metalness: 0.08,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.6 });
  const sock = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });

  const legGeo = new THREE.CylinderGeometry(3.4, 4, 14, 8);
  legGeo.translate(0, -7, 0);
  const legL = new THREE.Mesh(legGeo, sock);
  legL.position.set(-4.2, 14, 0);
  const legR = new THREE.Mesh(legGeo, sock);
  legR.position.set(4.2, 14, 0);
  g.add(legL, legR);

  // 上衣：肩膀略宽，腰略收
  const body = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 7, 26, 12), jersey);
  body.position.y = 28;
  const armGeo = new THREE.CylinderGeometry(3, 3.2, 14, 8);
  const armL = new THREE.Mesh(armGeo, jersey);
  armL.position.set(-9.5, 33, 0);
  const armR = new THREE.Mesh(armGeo, jersey);
  armR.position.set(9.5, 33, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(7.4, 16, 12), skin);
  head.position.y = 47.5;

  // 短裤
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 7.6, 10, 10), dark);
  shorts.position.y = 15.5;
  // 面朝方向小圆锥
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 8), jersey);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 30, 15);

  g.add(body, armL, armR, shorts, head, nose);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.speed = 0;
  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.isGK = isGK;
  g.visible = false;
  return g;
}

function ensurePlayerMeshes(n) {
  while (playerMeshes.length < n) {
    const idx = playerMeshes.length;
    const team = idx < 11 ? 0 : 1;
    const isGK = idx === 0 || idx === 11;
    const m = buildPlayer(team, isGK);
    m.castShadow = true;
    playerMeshes.push(m);
    scene.add(m);
  }
  loadPlayerTemplate();
}

const CREST_BONE = 'Spine';   // 队徽挂在胸骨上，随身体动作

function hexNum(hex) {
  const v = parseInt(String(hex || '').replace('#', ''), 16);
  return Number.isFinite(v) ? v : 0xffffff;
}

function findBone(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
  return found;
}

// 计算队徽相对胸骨的局部变换（模板绑定姿势下算一次，所有克隆共用）
function computeCrestMatrix(root, forward) {
  const bone = findBone(root, CREST_BONE);
  if (!bone) return null;
  bone.updateWorldMatrix(true, false);
  const f = forward.clone().setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, f).normalize();
  const p = bone.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Matrix4().makeBasis(right, up, f);
  target.setPosition(p.clone().addScaledVector(f, 0.17).addScaledVector(up, 0.02));
  return bone.matrixWorld.clone().invert().multiply(target);
}

// 按网格部位在贴图上生成“上衣 / 短裤 / 球袜”区域遮罩（1=球袜 2=短裤 3=上衣）
function buildKitMask(mesh, image) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const idx = geo.index;
  if (!pos || !uv || !idx) return null;
  const W = image.width;
  const H = image.height;
  mesh.updateWorldMatrix(true, false);
  const n = pos.count;
  const wp = new Float32Array(n * 3);
  const v3 = new THREE.Vector3();
  let mn = [Infinity, Infinity, Infinity];
  let mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    // 用 SkinnedMesh 自己的接口取绑定姿势顶点，自动处理量化与骨骼绑定
    mesh.getVertexPosition(i, v3);
    wp[i * 3] = v3.x; wp[i * 3 + 1] = v3.y; wp[i * 3 + 2] = v3.z;
    for (let c = 0; c < 3; c++) {
      const v = c === 0 ? v3.x : c === 1 ? v3.y : v3.z;
      if (v < mn[c]) mn[c] = v;
      if (v > mx[c]) mx[c] = v;
    }
  }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const up = ext.indexOf(Math.max(ext[0], ext[1], ext[2]));
  const latAxes = [0, 1, 2].filter((a) => a !== up);
  const ctr = latAxes.map((a) => (mn[a] + mx[a]) / 2);
  const height = ext[up] || 1;
  const mask = new Uint8Array(W * H);

  const fillTri = (p0, p1, p2, cls) => {
    const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
    if (Math.abs(den) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[1] - p2[1]) * (px - p2[0]) + (p2[0] - p1[0]) * (py - p2[1])) / den;
        const w1 = ((p2[1] - p0[1]) * (px - p2[0]) + (p0[0] - p2[0]) * (py - p2[1])) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.06 || w1 < -0.06 || w2 < -0.06) continue;
        mask[y * W + x] = cls;
      }
    }
  };

  const corner = (i) => [uv.getX(i) * W, uv.getY(i) * H];
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    const hs = (wp[a * 3 + up] + wp[b * 3 + up] + wp[c * 3 + up]) / 3;
    const tf = (hs - mn[up]) / height;
    let lateral = 0;
    for (const vi of [a, b, c]) {
      let s = 0;
      latAxes.forEach((ax, k) => {
        const d = wp[vi * 3 + ax] - ctr[k];
        s += d * d;
      });
      lateral += Math.sqrt(s);
    }
    lateral = lateral / 3 / height;

    let cls = 0;
    // 依据骨架比例分区：脚踝 0.05 / 膝 0.27 / 胯 0.54 / 肩 0.81 / 头 0.9
    if (tf >= 0.04 && tf < 0.22 && lateral < 0.20) cls = 1;             // 球袜
    else if (tf >= 0.36 && tf < 0.56 && lateral < 0.24) cls = 2;        // 短裤
    else if (tf >= 0.54 && tf < 0.86 && lateral < 0.23) cls = 3;        // 上衣躯干
    else if (tf >= 0.72 && tf < 0.86 && lateral < 0.36) cls = 3;        // 短袖
    if (!cls) continue;
    fillTri(corner(a), corner(b), corner(c), cls);
  }
  return { mask, W, H };
}

// 用遮罩给贴图上球衣颜色（保留原贴图的明暗/褶皱）
function makeKitTexture(image, maskInfo, palette) {
  const cvs = document.createElement('canvas');
  cvs.width = maskInfo.W;
  cvs.height = maskInfo.H;
  const cx = cvs.getContext('2d', { willReadFrequently: true });
  cx.drawImage(image, 0, 0, maskInfo.W, maskInfo.H);
  const img = cx.getImageData(0, 0, maskInfo.W, maskInfo.H);
  const d = img.data;
  const cols = [null, palette.socks, palette.shorts, palette.jersey];
  for (let i = 0; i < maskInfo.mask.length; i++) {
    const cls = maskInfo.mask[i];
    if (!cls) continue;
    const hex = cols[cls];
    const k = i * 4;
    const lum = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 255;
    const shade = Math.max(0.45, Math.min(1.16, lum / 0.66));
    d[k] = ((hex >> 16) & 255) * shade;
    d[k + 1] = ((hex >> 8) & 255) * shade;
    d[k + 2] = (hex & 255) * shade;
    d[k + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = lowSpec ? 2 : 8;
  return tex;
}

function preparePlayerTemplate(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  templateHeight = size.y || 1.7;
  templateCenter.copy(box.getCenter(new THREE.Vector3()));
  templateMinY = box.min.y;

  // 用脚尖相对脚踝的水平方向判断模型正面，避免球员倒退跑
  let foot = null;
  let toe = null;
  root.traverse((o) => {
    if (!o.isBone) return;
    if (!foot && o.name === 'LeftFoot') foot = o;
    if (!toe && o.name === 'LeftToeBase') toe = o;
  });
  if (foot && toe) {
    const f = foot.getWorldPosition(new THREE.Vector3());
    const t = toe.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3(t.x - f.x, 0, t.z - f.z);
    if (v.lengthSq() > 1e-8) templateBaseYaw = Math.atan2(v.x, v.z);
  }

  // 取原贴图与蒙皮网格，按身体部位生成三套球衣配色
  let baseMat = null;
  let srcImage = null;
  let skinMesh = null;
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (o.isSkinnedMesh && !skinMesh) skinMesh = o;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!srcImage && m && m.map && m.map.image) {
        srcImage = m.map.image;
        baseMat = m;
      }
    }
  });
  if (srcImage && baseMat && skinMesh) {
    try {
      kitMaskInfo = buildKitMask(skinMesh, srcImage);
    } catch (e) {
      console.warn('球衣区域识别失败，使用原贴图', e);
    }
    if (kitMaskInfo) {
      kitBaseMat = baseMat;
      const fwd = new THREE.Vector3(Math.sin(templateBaseYaw), 0, Math.cos(templateBaseYaw));
      crestLocalMatrix = computeCrestMatrix(root, fwd);
      if (kitDefs) buildKits(kitDefs);
    }
  }
  playerClip = gltf.animations && gltf.animations[0] ? gltf.animations[0] : null;
  idleClipTime = playerClip ? findIdleTime(root, playerClip) : 0;
  // 标记共享资源：模型模板会被 22 个球员克隆复用，切回 2D 时不能销毁
  root.traverse((o) => {
    if (o.geometry) o.geometry.userData.__shared = true;
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      if (!m.userData) m.userData = {};
      m.userData.__shared = true;
    });
  });
  if (kitMaterials) kitMaterials.forEach((pair) => pair.forEach((m) => { if (!m.userData) m.userData = {}; m.userData.__shared = true; }));
  playerTemplate = root;
  upgradePlayerMeshes();
}

// 在跑步动画里找一帧“双脚并拢”的姿势，静止时冻结到这一帧，避免原地跑步
function findIdleTime(root, clip) {
  try {
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    const bones = {};
    root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const lf = bones.LeftFoot;
    const rf = bones.RightFoot;
    if (!lf || !rf) return 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let best = 0;
    let bestScore = Infinity;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * clip.duration;
      mixer.setTime(t);
      root.updateMatrixWorld(true);
      lf.getWorldPosition(a);
      rf.getWorldPosition(b);
      const score = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 2.5;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    action.stop();
    mixer.setTime(0);
    root.updateMatrixWorld(true);
    return best;
  } catch (e) {
    return 0;
  }
}

function loadPlayerTemplate() {
  if (playerTemplate || templateLoading) return;
  templateLoading = true;
  new GLTFLoader().load(
    playerUrl,
    (gltf) => {
      try {
        preparePlayerTemplate(gltf);
      } catch (e) {
        console.warn('3D 球员模型初始化失败，使用简化球员', e);
      }
      templateLoading = false;
    },
    undefined,
    (err) => {
      templateLoading = false;
      console.warn('3D 球员模型加载失败，使用简化球员', err);
    }
  );
}

function makeAvatar() {
  const avatar = new THREE.Group();
  const body = cloneSkinned(playerTemplate);
  const s = PLAYER_HEIGHT / templateHeight;
  body.scale.setScalar(s);
  body.position.set(-templateCenter.x * s, -templateMinY * s, -templateCenter.z * s);
  body.rotation.y = -templateBaseYaw;
  body.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = !lowSpec;
    o.receiveShadow = false;
    o.frustumCulled = false; // 骨骼动画不会刷新包围盒，避免被误剔除
  });
  avatar.add(body);
  return { avatar, body };
}

// ====== 每队球衣（配色 + 队徽）======
function kitMaterialFor(idx) {
  if (!kitMaterials) return null;
  const team = idx < 11 ? 0 : 1;
  const isGK = idx === 0 || idx === 11;
  return kitMaterials[team][isGK ? 1 : 0] || null;
}

function applyKitMaterial(body, mat) {
  if (!mat) return;
  body.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map(() => mat);
    else o.material = mat;
  });
}

function makeFallbackCrest(name, jersey) {
  const cvs = document.createElement('canvas');
  cvs.width = 128;
  cvs.height = 128;
  const c = cvs.getContext('2d');
  c.beginPath();
  c.arc(64, 64, 58, 0, Math.PI * 2);
  c.fillStyle = jersey || '#1f2937';
  c.fill();
  c.lineWidth = 9;
  c.strokeStyle = '#ffffff';
  c.stroke();
  c.fillStyle = '#ffffff';
  c.font = 'bold 62px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText((name || '?').slice(0, 1), 64, 68);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function crestMaterial(name, jersey) {
  return new THREE.MeshBasicMaterial({
    map: makeFallbackCrest(name, jersey),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
}

function loadCrest(teamIdx, url, name, jersey) {
  if (!url) {
    kitCrestMats[teamIdx] = crestMaterial(name, jersey);
    attachCrestsToPlayers();
    return;
  }
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      kitCrestMats[teamIdx] = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      });
      attachCrestsToPlayers();
    },
    undefined,
    () => {
      kitCrestMats[teamIdx] = crestMaterial(name, jersey);
      attachCrestsToPlayers();
    }
  );
}

function buildKits(defs) {
  kitDefs = defs;
  kitMaterials = [0, 1].map((team) => {
    const t = defs[team] || {};
    const home = { jersey: hexNum(t.jersey), shorts: hexNum(t.shorts), socks: hexNum(t.socks) };
    const gk = { jersey: hexNum(t.gkJersey), shorts: hexNum(t.gkShorts), socks: hexNum(t.gkJersey) };
    return [home, gk].map((palette) => {
      const m = kitBaseMat.clone();
      m.map = makeKitTexture(kitBaseMat.map.image, kitMaskInfo, palette);
      m.roughness = 0.72;
      m.metalness = 0.02;
      m.needsUpdate = true;
      m.userData.__shared = true;
      return m;
    });
  });
  kitCrestMats = [null, null];
  defs.forEach((t, i) => loadCrest(i, t.crest, t.name, t.jersey));
  refreshPlayerKits();
}

// 对局配置变化时重建球衣（模板未就绪则先记住配置）
function ensureTeamKits(defs) {
  if (!defs || !defs[0] || !defs[1]) return;
  const sig = defs.map((t) => [t.name, t.jersey, t.shorts, t.socks, t.gkJersey, t.crest].join('|')).join('~');
  if (sig === kitSig && kitMaterials) return;
  kitSig = sig;
  kitDefs = defs;
  if (!playerTemplate || !kitMaskInfo || !kitBaseMat) return;
  buildKits(defs);
}

function refreshPlayerKits() {
  playerMeshes.forEach((container, idx) => {
    if (!container.userData.body) return;
    applyKitMaterial(container.userData.body, kitMaterialFor(idx));
  });
}

function attachCrest(container, idx) {
  const team = idx < 11 ? 0 : 1;
  const mat = kitCrestMats[team];
  if (!mat || !crestLocalMatrix || !container.userData.body) return;
  const old = container.userData.crest;
  if (old) {
    if (old.parent) old.parent.remove(old);
    container.userData.crest = null;
  }
  const bone = findBone(container.userData.body, CREST_BONE);
  if (!bone) return;
  const crest = new THREE.Mesh(crestGeo, mat);
  crest.matrixAutoUpdate = false;
  crest.matrix.copy(crestLocalMatrix);
  crest.renderOrder = 2;
  bone.add(crest);
  container.userData.crest = crest;
}

function attachCrestsToPlayers() {
  playerMeshes.forEach((container, idx) => {
    if (container.userData.avatar) attachCrest(container, idx);
  });
}

function upgradePlayerMeshes() {
  if (!playerTemplate) return;
  playerMeshes.forEach((container, idx) => {
    if (container.userData.avatar) return;
    [...container.children].forEach((c) => {
      if (c !== container.userData.ring) container.remove(c);
    });
    delete container.userData.legL;
    delete container.userData.legR;

    const { avatar, body } = makeAvatar();
    container.add(avatar);
    container.userData.avatar = avatar;
    container.userData.body = body;
    applyKitMaterial(body, kitMaterialFor(idx));
    attachCrest(container, idx);
    if (playerClip) {
      const mixer = new THREE.AnimationMixer(body);
      const action = mixer.clipAction(playerClip);
      action.play();
      action.time = Math.random() * playerClip.duration;
      mixer.update(0);
      container.userData.mixer = mixer;
      container.userData.action = action;
    }
  });
}

// 立体看台：混凝土台阶 + 顶棚 + 立体观众（身体 + 头）
function buildStadium() {
  const g = new THREE.Group();
  const rows = lowSpec ? 7 : 12;
  const rowH = 10;          // 每级台阶高 ≈0.75m
  const rowD = 11;          // 每级台阶深 ≈0.83m
  const baseGap = 26;       // 看台离边线的距离
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.95 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const longLen = FW + baseGap * 2;
  const shortLen = FH + baseGap * 2;
  const seatW = lowSpec ? 11 : 8.5;
  const seats = [];

  const addTier = (len, cx, cz, along, dir) => {
    for (let r = 0; r < rows; r++) {
      const y = r * rowH + rowH / 2;
      const out = baseGap + (r + 0.5) * rowD;
      const step = new THREE.Mesh(unitBox, r < rows - 1 ? concrete : dark);
      if (along === 'x') {
        step.scale.set(len, rowH, rowD);
        step.position.set(cx, y, cz + dir * out);
      } else {
        step.scale.set(rowD, rowH, len);
        step.position.set(cx + dir * out, y, cz);
      }
      g.add(step);
      const topY = (r + 1) * rowH;
      const n = Math.floor(len / seatW);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.07) continue; // 过道/空位
        const t = -len / 2 + (i + 0.5) * seatW + (Math.random() - 0.5) * 1.6;
        seats.push(along === 'x'
          ? [cx + t, topY, cz + dir * (out + 1.5)]
          : [cx + dir * (out + 1.5), topY, cz + t]);
      }
    }
  };

  addTier(longLen, FW / 2, 0, 'x', -1);
  addTier(longLen, FW / 2, FH, 'x', 1);
  addTier(shortLen, 0, FH / 2, 'z', -1);
  addTier(shortLen, FW, FH / 2, 'z', 1);

  // 顶棚 + 立柱
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide });
  const roofY = rows * rowH + 34;
  const roofDepth = rows * rowD + baseGap + 20;
  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(longLen + 40, 4, roofDepth), roofMat);
  roof1.position.set(FW / 2, roofY, FH + baseGap + rows * rowD - roofDepth / 2 + 10);
  const roof2 = roof1.clone();
  roof2.position.z = -(baseGap + rows * rowD - roofDepth / 2 + 10);
  const roof3 = new THREE.Mesh(new THREE.BoxGeometry(roofDepth, 4, shortLen + 40), roofMat);
  roof3.position.set(-(baseGap + rows * rowD - roofDepth / 2 + 10), roofY, FH / 2);
  const roof4 = roof3.clone();
  roof4.position.x = FW + (baseGap + rows * rowD - roofDepth / 2 + 10);
  g.add(roof1, roof2, roof3, roof4);

  const colMat = new THREE.MeshStandardMaterial({ color: 0x6f7680, roughness: 0.8 });
  const colGeo = new THREE.CylinderGeometry(3, 3, roofY, 8);
  for (let x = -40; x <= FW + 40; x += 190) {
    const c1 = new THREE.Mesh(colGeo, colMat);
    c1.position.set(x, roofY / 2, FH + baseGap + rows * rowD);
    const c2 = c1.clone();
    c2.position.z = -(baseGap + rows * rowD);
    g.add(c1, c2);
  }
  for (let z = 0; z <= FH; z += 190) {
    const c1 = new THREE.Mesh(colGeo, colMat);
    c1.position.set(-(baseGap + rows * rowD), roofY / 2, z);
    const c2 = c1.clone();
    c2.position.x = FW + baseGap + rows * rowD;
    g.add(c1, c2);
  }

  // 场边广告板
  const adColors = [0xffffff, 0x1f6feb, 0xe63946, 0x22c55e, 0xf2c14e];
  for (let i = 0; i < 22; i++) {
    const w = FW / 22;
    const board = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: adColors[i % adColors.length], roughness: 0.6 }));
    board.scale.set(w - 4, 4, 2);
    board.position.set(w * (i + 0.5), 2, -baseGap + 12);
    g.add(board);
    const board2 = board.clone();
    board2.position.z = FH + baseGap - 12;
    g.add(board2);
  }

  // 观众：身体 + 头部两个实例化网格
  const bodyGeo = new THREE.BoxGeometry(4.6, 8.2, 5.4);
  const headGeo = new THREE.SphereGeometry(2.1, 8, 6);
  const bodyMat = new THREE.MeshLambertMaterial({});
  const headMat = new THREE.MeshLambertMaterial({});
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, seats.length);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, seats.length);
  const shirtColors = [0xd7e3f4, 0xf2c14e, 0xdf5e5e, 0x6bbf8a, 0x4f86c6, 0xc08497, 0xffffff, 0x2b3a55, 0x8b5cf6];
  const skinColors = [0xf1c9a5, 0xd9a066, 0xa9714b, 0x7a4a2b, 0xf7ddc2];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  seats.forEach(([x, y, z], i) => {
    dummy.position.set(x, y + 4.1, z);
    dummy.rotation.y = (i % 2 ? 1 : -1) * 0.12;
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(shirtColors[(i * 7 + Math.floor(x) + Math.floor(z)) % shirtColors.length]);
    bodyMesh.setColorAt(i, color);

    dummy.position.set(x, y + 10.4, z);
    dummy.rotation.y = 0;
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(skinColors[(i * 3 + Math.floor(z)) % skinColors.length]);
    headMesh.setColorAt(i, color);
  });
  bodyMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
  g.add(bodyMesh, headMesh);
  return g;
}

function buildSoccerBall() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  );
  // 用少量色块贴出足球感觉
  const ctx = document.createElement('canvas');
  ctx.width = 256;
  ctx.height = 256;
  const c = ctx.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#222';
  const spots = [[45, 58, 32], [128, 28, 26], [205, 60, 30], [80, 132, 24], [175, 130, 24], [128, 202, 27], [45, 198, 22], [215, 205, 20]];
  spots.forEach(([sx, sy, r]) => {
    c.beginPath();
    c.arc(sx, sy, r, 0, Math.PI * 2);
    c.fill();
  });
  const tex = new THREE.CanvasTexture(ctx);
  tex.colorSpace = THREE.SRGBColorSpace;
  body.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
  g.add(body);

  const sh = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_RADIUS * 1.25, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.3;
  g.add(sh);
  g.userData.shadow = sh;
  return g;
}

export function start3D(container, onExit) {
  if (active) return true;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    console.error('WebGL 不可用', e);
    return false;
  }

  active = true;
  lowSpec = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowSpec ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lowSpec;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c2418);
  scene.fog = new THREE.Fog(0x0c2418, 1500, 4200);

  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x275f3a, 1.15));
  sun = new THREE.DirectionalLight(0xfff3d6, lowSpec ? 1.5 : 1.9);
  sun.position.set(FW * 0.55, 1600, FH * 0.25);
  if (!lowSpec) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -FW * 0.9;
    sun.shadow.camera.right = FW * 0.9;
    sun.shadow.camera.top = FH * 0.9;
    sun.shadow.camera.bottom = -FH * 0.9;
    sun.shadow.camera.near = 200;
    sun.shadow.camera.far = 3500;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);

  // 场地
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(FW, FH),
    new THREE.MeshStandardMaterial({ map: makeFieldTexture(), roughness: 0.96, metalness: 0 })
  );
  field.rotation.x = -Math.PI / 2;
  field.position.set(FW / 2, 0, FH / 2);
  field.receiveShadow = true;
  scene.add(field);

  // 球场外围
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(FW + 260, FH + 220),
    new THREE.MeshStandardMaterial({ color: 0x1a4a2f, roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(FW / 2, -0.6, FH / 2);
  apron.receiveShadow = true;
  scene.add(apron);

  scene.add(buildGoal(-1), buildGoal(1));
  scene.add(buildStadium());

  ensurePlayerMeshes(22);
  ballMesh = buildSoccerBall();
  ballMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(ballMesh);
  ballShadow = ballMesh.userData.shadow;

  camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 1, 9000);
  camX = FW / 2;

  stageEl = document.createElement('div');
  stageEl.id = 'stage3d';
  stageEl.appendChild(renderer.domElement);

  const tag = document.createElement('div');
  tag.className = 'stage3d-tag';
  tag.textContent = '3D 画面';
  stageEl.appendChild(tag);

  if (onExit) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage3d-exit';
    btn.textContent = '返回 2D';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onExit();
    });
    stageEl.appendChild(btn);
  }
  container.appendChild(stageEl);

  resizeHandler = () => {
    if (!active || !camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resizeHandler);
  resizeHandler();
  lastBall = null;
  lastFrameTime = 0;
  camZ = FH / 2;
  return true;
}

export function stop3D() {
  if (!active) return;
  active = false;
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
  if (stageEl && stageEl.parentNode) stageEl.parentNode.removeChild(stageEl);
  stageEl = null;
  if (scene) {
    scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData.__shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (m.userData && m.userData.__shared) return;
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  sun = null;
  playerMeshes = [];
  ballMesh = null;
  ballShadow = null;
  lastBall = null;
  lastFrameTime = 0;
}

export function render3DFrame(snap) {
  if (!active || !scene || !camera || !ballMesh) return;
  if (snap.teams) ensureTeamKits(snap.teams);

  ensurePlayerMeshes(snap.players.length);
  const now = performance.now();
  const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 1 / 60;
  lastFrameTime = now;

  snap.players.forEach((p, i) => {
    const m = playerMeshes[i];
    if (!m) return;
    const spd = Math.hypot(p.vx || 0, p.vy || 0);
    m.visible = true;
    m.position.set(p.x, 0, p.y);
    const fx = p.faceX || 0;
    const fy = p.faceY || (p.team === 0 ? 1 : -1);
    m.rotation.y = Math.atan2(fx, fy);

    m.userData.speed = spd;
    if (m.userData.avatar && m.userData.mixer) {
      const act = m.userData.action;
      if (spd < 0.22 && !p.slide) {
        // 站立/定位球准备：冻结到并拢姿势，避免原地跑步
        act.paused = true;
        if (playerClip) {
          const dur = playerClip.duration;
          let d = idleClipTime - act.time;
          if (d > dur / 2) d -= dur; else if (d < -dur / 2) d += dur;
          act.time += d * Math.min(1, dt * 5);
        }
        m.userData.mixer.update(dt);
      } else {
        // 真实骨骼跑步动画：播放速度随移动速度变化，铲球时压低身体
        act.paused = false;
        const ts = p.slide ? 0.25 : Math.max(0.5, Math.min(1.9, 0.55 + spd * 0.55 + (p.kick > 0 ? 0.5 : 0)));
        act.timeScale = ts;
        m.userData.mixer.update(dt);
      }
      m.userData.avatar.rotation.x = p.slide ? -0.55 : 0;
    } else {
      // 模型尚未加载完成：用简化球员的腿部摆动兜底
      const amp = Math.min(0.85, spd * 0.5);
      m.userData.phase += (0.7 + spd * 4.5) * dt;
      const legL = m.userData.legL;
      const legR = m.userData.legR;
      if (legL && legR) {
        legL.rotation.x = Math.sin(m.userData.phase) * amp;
        legR.rotation.x = Math.sin(m.userData.phase + Math.PI) * amp;
      }
      m.position.y = Math.abs(Math.sin(now * 0.006 + i * 0.9)) * (0.35 + spd * 0.35);
    }

    // 当前操控球员的金色光圈
    let ring = m.userData.ring;
    if (p.active) {
      if (!ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(8, 11, 40),
          new THREE.MeshBasicMaterial({
            color: 0xffd60a,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthTest: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.25;
        m.add(ring);
        m.userData.ring = ring;
      }
      ring.visible = true;
    } else if (ring) {
      ring.visible = false;
    }
  });

  // 足球：位置 + 旋转 + 地面阴影
  const b = snap.ball;
  ballMesh.position.set(b.x, (b.z || 0) * BALL_Z_SCALE + BALL_RADIUS, b.y);
  if (lastBall) {
    const speed = Math.hypot(b.vx || 0, b.vy || 0);
    if (speed > 0.01) {
      const axis = new THREE.Vector3(b.vy || 0, 0, -(b.vx || 0)).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, speed * dt * 0.16);
      ballMesh.quaternion.premultiply(q);
    }
  }
  lastBall = { x: b.x, y: b.y, z: b.z || 0 };
  if (ballShadow) {
    ballShadow.position.set(b.x, 0.4, b.y);
    const h = Math.max(0, (b.z || 0) * BALL_Z_SCALE);
    const s = Math.max(0.5, 1 - h * 0.03);
    ballShadow.scale.set(s, s, 1);
  }

  // 转播式跟随镜头：机位固定在近侧看台上方，用中长焦扫视球场
  // （球门在画面左右两侧，与 2D 视角一致）
  const focus = snap.focus || { x: snap.ball.x, y: snap.ball.y };
  const targetX = Math.max(FW * 0.14, Math.min(FW * 0.86, focus.x));
  const targetZ = Math.max(70, Math.min(FH - 70, focus.y));
  camX += (targetX - camX) * Math.min(1, dt * 3.2);
  camZ += (targetZ - camZ) * Math.min(1, dt * 2.8);
  camera.position.set(camX, 430, FH + 330);
  camera.lookAt(camX, 0, camZ);
  renderer.render(scene, camera);
}
