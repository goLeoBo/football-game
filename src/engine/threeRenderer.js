import * as THREE from 'three';

// 3D 画面渲染器：只负责把引擎状态可视化，玩法/AI/物理仍在 engine.js 中。
const FW = 1389;
const FH = 900;
const PITCH_R = 13; // 引擎中的球员碰撞半径，用作 3D 比例参考

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
let lastBall = null;
let lastFrameTime = 0;
let lowSpec = false;

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

  // 中圈
  x.beginPath();
  x.arc(cw / 2, ch / 2, mx(85), 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(cw / 2, ch / 2, 5, 0, Math.PI * 2);
  x.fill();

  // 禁区/小禁区（球场 x 方向按常见比例简化）
  const boxD = mx(160);
  const boxW = my(460);
  const goalD = mx(66);
  const goalW = my(240);
  x.strokeRect(8, (ch - boxW) / 2, boxD, boxW);
  x.strokeRect(cw - 8 - boxD, (ch - boxW) / 2, boxD, boxW);
  x.strokeRect(8, (ch - goalW) / 2, goalD, goalW);
  x.strokeRect(cw - 8 - goalD, (ch - goalW) / 2, goalD, goalW);

  // 点球点
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(boxD - mx(40), ch / 2, 5, 0, Math.PI * 2);
  x.arc(cw - boxD + mx(40), ch / 2, 5, 0, Math.PI * 2);
  x.fill();

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
  const half = 104;
  const h = 68;

  const postGeo = new THREE.CylinderGeometry(2.6, 2.6, h, 10);
  const p1 = new THREE.Mesh(postGeo, postMat);
  p1.position.set(gx, h / 2, zc - half);
  const p2 = new THREE.Mesh(postGeo, postMat);
  p2.position.set(gx, h / 2, zc + half);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, half * 2, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(gx, h, zc);
  g.add(p1, p2, bar);

  // 简化球网：两块侧面 + 顶面
  const nx = xSign < 0 ? gx + 16 : gx - 16;
  const side1 = new THREE.Mesh(new THREE.PlaneGeometry(16, h), netMat);
  side1.position.set(gx + (xSign < 0 ? 8 : -8), h / 2, zc - half);
  const side2 = side1.clone();
  side2.position.z = zc + half;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(16, half * 2), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(gx + (xSign < 0 ? 8 : -8), h, zc);
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
}

function buildCrowd() {
  const colors = [0xd7e3f4, 0xf2c14e, 0xdf5e5e, 0x6bbf8a, 0x4f86c6, 0xc08497, 0xffffff];
  const box = new THREE.BoxGeometry(3.4, 5.2, 3.4);
  const mat = new THREE.MeshLambertMaterial({ roughness: 0.9 });
  const crowd = new THREE.InstancedMesh(box, mat, 2600);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let idx = 0;
  const put = (x, y, z) => {
    if (idx >= crowd.count) return;
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    crowd.setMatrixAt(idx, dummy.matrix);
    color.setHex(colors[(idx * 7 + Math.floor(x) + Math.floor(z)) % colors.length]);
    crowd.setColorAt(idx, color);
    idx++;
  };

  // 底边与顶边看台
  for (let r = 0; r < 7; r++) {
    const y = 4 + r * 7.5;
    for (let x = -30; x <= FW + 30; x += 7) {
      put(x + (r % 2) * 2, y, -10 - r * 2.2);
      put(x + ((r + 1) % 2) * 2, y, FH + 10 + r * 2.2);
    }
  }
  // 左右两侧看台
  for (let r = 0; r < 5; r++) {
    const y = 4 + r * 7.5;
    for (let z = 0; z <= FH; z += 8) {
      put(-26 - r * 3.5, y, z + (r % 2) * 3);
      put(FW + 26 + r * 3.5, y, z + ((r + 1) % 2) * 3);
    }
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  return crowd;
}

function buildSoccerBall() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 20, 16),
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
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  );
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.4;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowSpec ? 1.75 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lowSpec;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c2418);
  scene.fog = new THREE.Fog(0x0c2418, 2300, 5200);

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
  scene.add(buildCrowd());

  ensurePlayerMeshes(22);
  ballMesh = buildSoccerBall();
  ballMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(ballMesh);
  ballShadow = ballMesh.userData.shadow;

  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 9000);
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
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
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

    // 跑步动画：腿摆动幅度随速度变化；脚在地面上
    const amp = Math.min(0.85, spd * 0.5);
    m.userData.speed = spd;
    m.userData.phase += (0.7 + spd * 4.5) * dt;
    const legL = m.userData.legL;
    const legR = m.userData.legR;
    if (legL && legR) {
      legL.rotation.x = Math.sin(m.userData.phase) * amp;
      legR.rotation.x = Math.sin(m.userData.phase + Math.PI) * amp;
    }
    m.position.y = Math.abs(Math.sin(now * 0.006 + i * 0.9)) * (0.35 + spd * 0.35);

    // 当前操控球员的金色光圈
    let ring = m.userData.ring;
    if (p.active) {
      if (!ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(PITCH_R + 5, PITCH_R + 9, 40),
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
  ballMesh.position.set(b.x, (b.z || 0) + 7.5, b.y);
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
    const h = Math.max(0, (b.z || 0) - 6);
    const s = Math.max(0.55, 1 - h * 0.012);
    ballShadow.scale.set(s, s, 1);
  }

  // 跟球镜头：横向平滑跟随，画面始终保持可容纳全场
  const pan = snap.camPanX || 0;
  const targetCamX = FW / 2 + pan * 0.55;
  camX += (targetCamX - camX) * Math.min(1, dt * 4);
  const fovY = camera.fov * (Math.PI / 180);
  const halfW = (FW * 1.06) / 2;
  const neededDist = halfW / (Math.tan(fovY / 2) * camera.aspect);
  const dist = Math.max(1350, neededDist);
  camera.position.set(camX, dist * 0.52, FH * 0.5 + dist * 0.86);
  camera.lookAt(camX, 0, FH * 0.5);
  renderer.render(scene, camera);
}
