// engine.js — 游戏引擎（原单文件 IIFE 内的游戏逻辑 + Canvas 渲染 + 音频 + 输入）
// 数据常量见 data.js；UI 状态通过 store.js 的 commit 上报给 React。
import {
  FORMATIONS, RED_POOL, BLUE_POOL, CLUBS, PM_CLUBS, PM_FORMATIONS,
  NATIONAL_TEAMS, NT_STARS, NT_FLAG, CLUB_LOGO_BASE, CLUB_LOGO,
  FLAG_BASE, AVATAR_COLORS,
} from "./data.js";
import { commit, getState } from "./store.js";


let cv = null, ctx = null;

// ====== 场地参数 ======
const FW = 1389, FH = 900;  // 标准足球场比例 1.543:1（≈105m×68m）
const SX = FW/900, SY = FH/560;  // 场地缩放因子（阵型/AI 常量基于 900x560 设计）
const GOAL_H = 215;  // 球门高度随 FH 等比缩放（原 220×900/920≈215）

// ====== 慢动作回放系统 ======
let posHistory = [];      // 持续录制的位置快照
let replaySnapshots = []; // 回放用的快照
let replayIdx = 0;
let replayActive = false;
let replayFrameTime = 0;
let pendingCard = null;   // 回放结束后要出示的牌
function recordSnapshot(){
  posHistory.push({
    players: players.map(p=>({x:p.x,y:p.y,vx:p.vx,vy:p.vy,slide:p.slide,kick:p.kick,face:{x:p.face.x,y:p.face.y},slideDir:{x:p.slideDir.x,y:p.slideDir.y},slidePower:p.slidePower||0,diveTimer:p.diveTimer||0,diveDir:p.diveDir||0,diveTargetY:p.diveTargetY||0})),
    ball:{x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy}
  });
  if(posHistory.length>80) posHistory.shift();
}
function applySnapshot(s){
  s.players.forEach((sp,i)=>{ if(players[i]){players[i].x=sp.x;players[i].y=sp.y;players[i].vx=sp.vx;players[i].vy=sp.vy;players[i].slide=sp.slide;players[i].kick=sp.kick;players[i].face={x:sp.face.x,y:sp.face.y};players[i].slideDir={x:sp.slideDir.x,y:sp.slideDir.y};players[i].slidePower=sp.slidePower;players[i].diveTimer=sp.diveTimer;players[i].diveDir=sp.diveDir;players[i].diveTargetY=sp.diveTargetY;}});
  ball.x=s.ball.x;ball.y=s.ball.y;ball.vx=s.ball.vx;ball.vy=s.ball.vy;
}
function startReplay(cardInfo){
  replaySnapshots = [...posHistory];
  replayIdx = 0; replayFrameTime = 0; replayActive = true;
  pendingCard = cardInfo;
  posHistory = [];
}
function skipReplay(){
  if(!replayActive) return;
  if(replaySnapshots.length>0) applySnapshot(replaySnapshots[replaySnapshots.length-1]);
  replayActive = false;
  if(pendingCard){
    const {player,color,reason,foulX,foulY}=pendingCard; pendingCard=null;
    executeShowCard(player,color,reason,foulX,foulY);
  }
}
function updateReplay(dt){
  replayFrameTime += dt * 0.22; // 0.22x 慢放
  const target = Math.floor(replayFrameTime * 60);
  if(target >= replaySnapshots.length){
    // 回放结束，恢复到犯规瞬间并出示牌
    if(replaySnapshots.length>0) applySnapshot(replaySnapshots[replaySnapshots.length-1]);
    replayActive = false;
    if(pendingCard){
      const {player,color,reason,foulX,foulY}=pendingCard; pendingCard=null;
      executeShowCard(player,color,reason,foulX,foulY);
    }
    return;
  }
  while(replayIdx < target && replayIdx < replaySnapshots.length-1) replayIdx++;
  if(replayIdx < replaySnapshots.length) applySnapshot(replaySnapshots[replayIdx]);
}
const GOAL_D = 24;
const WALL = 12;
let scale = 1;

// ====== 电视转播视角投影 ======
// 模拟摄像机在球场一侧高处的斜视角，带透视和镜头跟随
const CAM_TILT = 0.82;   // y 压缩比（更平视角，最大化场地占比）
const CAM_OFFSET_Y = 10;  // 顶部留白
const PERSP = 0.00038;    // 透视强度（远端 x 向中心压缩）
let camPanX = 0;          // 镜头水平偏移（跟随球）
// project(x, y, z=0) 把世界坐标转成屏幕坐标
// 返回 {sx, sy, depth, dscale} dscale=深度缩放比（远=小，近=大）
function project(x, y, z=0){
  // 透视：远端（y小）x 向中心压缩
  const dscale = 1 - (FH * 0.5 - y) * PERSP; // 0.82~1.0
  const cx = FW/2 + camPanX;
  const sx = cx + (x - cx) * dscale;
  const sy = y * CAM_TILT + CAM_OFFSET_Y - z * (1 - CAM_TILT) * 1.19;
  return { sx, sy, depth: y, dscale };
}

let canvasOffsetX = 0, canvasOffsetY = 0;
function resize(){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  const visH = FH * CAM_TILT + CAM_OFFSET_Y + 30;
  // 16:9 转播宽屏感：优先适配宽度
  scale = Math.min(W/FW, H/visH);
  canvasOffsetX = (W - FW*scale)/2;
  canvasOffsetY = (H - visH*scale)/2;
  cv.width = W*dpr; cv.height = H*dpr;
  cv.style.width = W+'px'; cv.style.height = H+'px';
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*canvasOffsetX,dpr*canvasOffsetY);
}
// resize 与事件绑定延后到 init()（此时 React 已挂载 canvas 与控件 DOM）

// ====== 通用工具 ======
const rand = (a,b)=>a+Math.random()*(b-a);
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;

// ====== 音效（Web Audio API 合成） ======
let audioCtx = null;
function getAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
// 裁判哨声：高频振荡 + 颤音
function playWhistle(){
  try{
    const ac = getAudio();
    const t = ac.currentTime;
    const dur = 0.45;
    // 两个高频振荡器模拟哨声
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    const g = ac.createGain();
    o1.type='square'; o2.type='sawtooth';
    o1.frequency.setValueAtTime(2600, t);
    o2.frequency.setValueAtTime(3100, t);
    // 颤音效果
    const lfo = ac.createOscillator(), lfoGain = ac.createGain();
    lfo.frequency.value = 22; lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency); lfoGain.connect(o2.frequency);
    // 音量包络
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t+0.03);
    g.gain.linearRampToValueAtTime(0.15, t+dur*0.7);
    g.gain.linearRampToValueAtTime(0, t+dur);
    o1.connect(g); o2.connect(g); g.connect(ac.destination);
    o1.start(t); o2.start(t); lfo.start(t);
    o1.stop(t+dur); o2.stop(t+dur); lfo.stop(t+dur);
  }catch(e){}
}
// 出牌哨声：短-短（黄牌）或 长-长-长（红牌）
function playCardWhistle(color){
  try{
    const ac = getAudio();
    const now = ac.currentTime;
    if(color==='red'){
      // 红牌：三声长哨，越来越急促
      playSingleWhistle(now, 0.55, 0.20);
      playSingleWhistle(now+0.70, 0.50, 0.18);
      playSingleWhistle(now+1.35, 0.65, 0.22);
    } else {
      // 黄牌：两声短哨
      playSingleWhistle(now, 0.30, 0.16);
      playSingleWhistle(now+0.45, 0.35, 0.16);
    }
  }catch(e){}
}
function playSingleWhistle(start, dur, vol){
  const ac = getAudio();
  const o1=ac.createOscillator(), o2=ac.createOscillator(), g=ac.createGain();
  o1.type='square'; o2.type='sawtooth';
  o1.frequency.setValueAtTime(2600, start);
  o2.frequency.setValueAtTime(3100, start);
  const lfo=ac.createOscillator(), lfoG=ac.createGain();
  lfo.frequency.value=22; lfoG.gain.value=180;
  lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start+0.03);
  g.gain.linearRampToValueAtTime(vol*0.85, start+dur*0.7);
  g.gain.linearRampToValueAtTime(0, start+dur);
  o1.connect(g); o2.connect(g); g.connect(ac.destination);
  o1.start(start); o2.start(start); lfo.start(start);
  o1.stop(start+dur); o2.stop(start+dur); lfo.stop(start+dur);
}
// ====== 观众音效系统 ======
let crowdNoiseNode = null; // 背景人群噪声节点（持续）
let crowdNoiseGain = null;
// 启动低沉背景人群噪声（比赛开始时调用一次）
function startCrowdAmbience(){
  try{
    if(crowdNoiseNode) return; // 已启动
    const ac = getAudio();
    // 白噪声缓冲区
    const bufferSize = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0; i<bufferSize; i++) data[i] = Math.random()*2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buffer; noise.loop = true;
    // 带通滤波器 → 模拟人群低频嗡嗡声
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
    // 低通再过滤高频
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800;
    crowdNoiseGain = ac.createGain();
    crowdNoiseGain.gain.value = 0.04; // 很低的基础音量
    noise.connect(bp); bp.connect(lp); lp.connect(crowdNoiseGain);
    crowdNoiseGain.connect(ac.destination);
    noise.start();
    crowdNoiseNode = noise;
  }catch(e){}
}
// 停止背景人群噪声
function stopCrowdAmbience(){
  try{
    if(crowdNoiseNode){ crowdNoiseNode.stop(); crowdNoiseNode=null; crowdNoiseGain=null; }
  }catch(e){}
}
// 观众欢呼（进球/精彩射门）：白噪声爆发 + 上升包络
function playCrowdCheer(intensity=1.0, duration=2.5){
  try{
    const ac = getAudio();
    const t = ac.currentTime;
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    // 生成带高频的噪声（欢呼有高频成分）
    for(let i=0; i<bufferSize; i++){
      const env = Math.min(1, i / (ac.sampleRate * 0.3)); // 上升
      data[i] = (Math.random()*2 - 1) * env;
    }
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    // 带通：中高频为主（人声欢呼频段）
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 300;
    const g = ac.createGain();
    // 包络：快速上升 → 持续 → 缓慢衰减
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15 * intensity, t + 0.25);
    g.gain.linearRampToValueAtTime(0.12 * intensity, t + duration * 0.5);
    g.gain.linearRampToValueAtTime(0.06 * intensity, t + duration * 0.75);
    g.gain.linearRampToValueAtTime(0, t + duration);
    noise.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ac.destination);
    noise.start(t); noise.stop(t + duration);
    // 同时升高背景噪声
    if(crowdNoiseGain){
      crowdNoiseGain.gain.cancelScheduledValues(t);
      crowdNoiseGain.gain.setValueAtTime(crowdNoiseGain.gain.value, t);
      crowdNoiseGain.gain.linearRampToValueAtTime(0.10 * intensity, t + 0.2);
      crowdNoiseGain.gain.linearRampToValueAtTime(0.04, t + duration);
    }
  }catch(e){}
}
// 观众嘘声/惊叹（犯规/失误）：短促低频噪声
function playCrowdGroan(duration=0.8){
  try{
    const ac = getAudio();
    const t = ac.currentTime;
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0; i<bufferSize; i++) data[i] = Math.random()*2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.1);
    g.gain.linearRampToValueAtTime(0.07, t + duration * 0.6);
    g.gain.linearRampToValueAtTime(0, t + duration);
    noise.connect(lp); lp.connect(g); g.connect(ac.destination);
    noise.start(t); noise.stop(t + duration);
  }catch(e){}
}
// 观众掌声/鼓掌（精彩拼抢或扑救）
function playCrowdClap(duration=1.2){
  try{
    const ac = getAudio();
    const t = ac.currentTime;
    const clapCount = Math.floor(duration / 0.12);
    for(let i=0; i<clapCount; i++){
      const ct = t + i * 0.12;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square'; o.frequency.value = 200 + Math.random()*100;
      g.gain.setValueAtTime(0.06, ct);
      g.gain.exponentialRampToValueAtTime(0.001, ct + 0.06);
      o.connect(g); g.connect(ac.destination);
      o.start(ct); o.stop(ct + 0.06);
    }
  }catch(e){}
}
// 进球呐喊：播放真实录音 crowd_cheer.mp3（Mixkit CC0 授权，放入同目录）
const goalCheerAudio = new Audio('crowd_cheer.mp3');
goalCheerAudio.volume = 0.85;
function preloadGoalCheer(){
  goalCheerAudio.load();
}
function playGoalRoar(){
  try{
    goalCheerAudio.currentTime = 0;
    goalCheerAudio.play().catch(()=>{});
    // 背景人群噪声暴涨（配合录音增强现场感）
    if(crowdNoiseGain){
      const ac = getAudio();
      const t = ac.currentTime;
      crowdNoiseGain.gain.cancelScheduledValues(t);
      crowdNoiseGain.gain.setValueAtTime(crowdNoiseGain.gain.value, t);
      crowdNoiseGain.gain.linearRampToValueAtTime(0.14, t+0.1);
      crowdNoiseGain.gain.linearRampToValueAtTime(0.04, t+4.0);
    }
  }catch(e){}
}

// ====== 比赛模式状态 ======
const TEAM_RED = 0, TEAM_BLUE = 1;
let mode = 'match';           // match | penalty
let state = 'menu';
let score = [0,0];
let matchTime = 90;           // 比赛时长（秒），可在菜单选择
let timer = matchTime;
let lastT = 0;
let goalTimer = 0;
let scorer = null;
let setPiece = null;        // null | 'corner' | 'goalkick' | 'throwin'  定位球类型
let setPieceTimer = 0;      // 定位球提示倒计时
let setPieceMsg = '';       // 定位球提示文字
let offsideCheck = null;    // 越位检测：{ team, lineX, attackDir, passerIdx }
// 任意球主罚系统（direct=true 直接/ false 间接）
let freeKick = null;        // { takerIdx, team, timer, isAI, charging, power, spaceLatch, direct, wall:[], touched }
let goalKick = null;        // 球门球蓄力系统 { takerIdx, team, isAI, charging, power, spaceLatch, timer }
let longPassAim = null;     // 长传瞄准模式 { tx, ty } tx/ty=落点目标坐标

const ball = { x: FW/2, y: FH/2, vx:0, vy:0, vz:0, z:0, r:9, owner:null, lastTeam:0 };
const GRAVITY = 28; // 重力加速度（z轴向下）
const BALL_BOUNCE = 0.55; // 地面反弹系数
let players = [];
let activeIdx = 0;

// ====== 点球大战状态 ======
const PEN_SPOT_L = { x: 200, y: FH/2 };      // 玩家罚点球（攻左门）
const PEN_SPOT_R = { x: FW-200, y: FH/2 };   // 不用，玩家始终攻左门方向
let penState = 'aim';        // aim | shoot | result | ai-aim | ai-shoot | ai-result | over
let penScore = [0,0];
let penShots = [0,0];
let penRound = 1;
let penTimer = 0;
let aimY = FH/2;             // 瞄准光标 y
let aimDir = 1;
let aimSpeed = 2.6;
let penTargetY = FH/2;       // 锁定的射门目标 y
let keeperDiveY = FH/2;      // 门将扑救 y
let keeperX = 0;
let penBall = {x:0,y:0,vx:0,vy:0,vz:0,z:0};
let penResult = '';
let penSuddenDeath = false;

// ====== 比赛模式：球队 ======
let selectedFormation = '4-3-3';
let selectedTime = 90;

// 阵型定义：[x, y, 角色]（红队坐标，蓝队自动镜像）
// 坐标基于 900×560 设计，buildTeam 会乘以 SX/SY 缩放到实际场地

// 著名球星名单（按角色分组，按阵型所需人数依次取用）

// 俱乐部数据库（每队随机抽取一个俱乐部，使用其球星）

let teamMode = 'club';   // 'club' = 俱乐部随机, 'allstar' = 全明星随机
let redClub = null, blueClub = null;

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// 随机抽签：俱乐部模式下抽两个不同俱乐部
// 自选俱乐部：用户选主队，对手随机
function pickClub(name){
  const found = CLUBS.find(c=>c.name===name);
  if(!found) return;
  redClub = found;
  // 随机选一个不同的对手
  let b;
  do{ b=Math.floor(Math.random()*CLUBS.length); }while(CLUBS[b].name===name);
  blueClub = CLUBS[b];
  updateMatchupPreview(); updateTeamNames();
}
function rollTeams(){
  if(teamMode==='club'){
    if(!redClub){
      const a=Math.floor(Math.random()*CLUBS.length); let b;
      do{ b=Math.floor(Math.random()*CLUBS.length); }while(b===a);
      redClub=CLUBS[a]; blueClub=CLUBS[b];
    } else {
      let b;
      do{ b=Math.floor(Math.random()*CLUBS.length); }while(CLUBS[b].name===redClub.name);
      blueClub=CLUBS[b];
    }
  } else { redClub=null; blueClub=null; }
  updateMatchupPreview(); updateTeamNames();
}
function updateMatchupPreview(){
  const red = (teamMode==='club' && redClub) ? redClub.name : '世界明星';
  const blue = (teamMode==='club' && blueClub) ? blueClub.name : '传奇明星';
  commit({ matchup: { red, blue } });
}
function updateTeamNames(){
  commit({
    redName: (teamMode==='club'&&redClub) ? redClub.name : '世界明星',
    blueName: (teamMode==='club'&&blueClub) ? blueClub.name : '传奇明星',
  });
}

function makePlayer(x,y,team,gk=false,role='FWD'){
  return {x,y,vx:0,vy:0,team,gk,role,name:'',r:13,stamina:100,homeX:x,homeY:y,face:{x:0,y:team===TEAM_RED?1:-1},kick:0,
    slide:0, slideDir:{x:0,y:0}, slidePower:0, cards:0, sentOff:false};
}
function buildTeam(team, form){
  const src = (teamMode==='club' && redClub) ? (team===TEAM_RED?redClub:blueClub) : (team===TEAM_RED?RED_POOL:BLUE_POOL);
  const pool = { GK:shuffle([...src.GK]), DEF:shuffle([...src.DEF]), MID:shuffle([...src.MID]), FWD:shuffle([...src.FWD]) };
  const cnt = {GK:0,DEF:0,MID:0,FWD:0};
  form.forEach(f=>{
    const [x,y,role] = f;
    const name = pool[role][cnt[role] % pool[role].length];
    cnt[role]++;
    const sx=x*SX, sy=y*SY;
    const px = team===TEAM_RED ? sx : FW-sx;
    const p = makePlayer(px, sy, team, role==='GK', role);
    p.name = name;
    players.push(p);
  });
}
function setupTeams(){
  players = [];
  const form = FORMATIONS[selectedFormation] || FORMATIONS['4-3-3'];
  buildTeam(TEAM_RED, form);
  buildTeam(TEAM_BLUE, form);
  activeIdx = players.findIndex(p=>p.team===TEAM_RED && p.role==='FWD');
  if(activeIdx<0) activeIdx = 0;
}
function kickoff(){
  ball.x = FW/2; ball.y = FH/2; ball.vx=0; ball.vy=0; ball.vz=0; ball.z=0; ball.owner=null;
  camPanX = 0; // 重置镜头
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  offsideCheck=null; freeKick=null; longPassAim=null;
  // 全体回本方半区阵型位置
  players.forEach(p=>{ p.x=p.homeX; p.y=p.homeY; p.vx=0; p.vy=0; p.kick=0; });
  // 开球队员（红队）站到中点持球
  let best=-1,bd=1e9;
  players.forEach((p,i)=>{
    if(p.team===TEAM_RED && !p.gk){ const d=dist(p,ball); if(d<bd){bd=d;best=i;} }
  });
  if(best>=0){
    const p=players[best];
    p.x=FW/2-18; p.y=FH/2; p.vx=0; p.vy=0;
    p.face={x:1,y:0};
    ball.owner=p;
    activeIdx=best;
  }
  state='kickoff'; goalTimer=0.8;
}

// ====== 输入 ======
const keys = {};
window.addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  keys[k]=true;
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
  if(mode==='match'){
    if(k==='x') switchPlayer();
    if(k==='q') actionLongPass();
    if(k==='p' && (state==='playing'||state==='paused')){ state = state==='playing'?'paused':'playing'; }
    if(replayActive && (k===' '||k==='enter')) skipReplay();
  } else if(mode==='penalty'){
    if(k===' ' && penState==='aim') lockPenShot();
  }
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

let mvx=0,mvy=0;
function readMove(){
  let x=0,y=0;
  if(keys['arrowleft']||keys['a']) x-=1;
  if(keys['arrowright']||keys['d']) x+=1;
  if(keys['arrowup']||keys['w']) y-=1;
  if(keys['arrowdown']||keys['s']) y+=1;
  x+=stick.dx; y+=stick.dy;
  const m=Math.hypot(x,y);
  if(m>1){x/=m;y/=m;}
  return {x,y};
}
function switchPlayer(){
  let best=-1,bd=1e9;
  players.forEach((p,i)=>{
    if(p.team===TEAM_RED && !p.gk && i!==activeIdx){ const d=dist(p,ball); if(d<bd){bd=d;best=i;} }
  });
  if(best>=0) activeIdx=best;
}

// 摇杆
const stick={dx:0,dy:0,active:false,id:0,cx:0,cy:0};
let stickEl = null, knobEl = null;
let stickBound = false;
function bindStick(sEl, kEl){
  if(stickEl) stickEl.removeEventListener('pointerdown', stickStart);
  stickEl = sEl; knobEl = kEl;
  if(stickEl && !stickBound){
    stickEl.addEventListener('pointerdown', stickStart);
    stickBound = true;
  }
}
function stickStart(e){ stick.active=true; const r=stickEl.getBoundingClientRect(); stick.cx=r.left+r.width/2; stick.cy=r.top+r.height/2; stick.id=e.pointerId||0; stickMove(e); }
function stickMove(e){ if(!stick.active || !knobEl) return; let dx=e.clientX-stick.cx, dy=e.clientY-stick.cy; const R=50,m=Math.hypot(dx,dy); if(m>R){dx=dx/m*R;dy=dy/m*R;} stick.dx=dx/R; stick.dy=dy/R; knobEl.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
function stickEnd(){stick.active=false;stick.dx=0;stick.dy=0;if(knobEl) knobEl.style.transform='translate(-50%,-50%)';}

// 触屏按钮动作（React 组件直接调用）
function touchShoot(){
  if(mode==='match') actionShoot();
  else if(mode==='penalty' && penState==='aim') lockPenShot();
}
function touchPass(){ if(mode==='match') actionPass(); }
function touchLong(){ if(mode==='match') actionLongPass(); }
function touchTackle(){ if(mode==='match') actionTackle(); }
function setSprint(on){ keys['z']=on; }

function actionShoot(){
  if(freeKick && !freeKick.isAI){ triggerFreeKickShoot(); return; }
  if(goalKick && !goalKick.isAI){
    // 球门球：按一次射门键开始蓄力，再按一次踢出
    if(!goalKick.charging){
      goalKick.charging=true; goalKick.power=10;
    } else {
      const taker=players[goalKick.takerIdx];
      if(taker) doGoalKickLong(taker, Math.max(0.25, goalKick.power/100));
    }
    return;
  }
  if(state!=='playing') return; const p=players[activeIdx]; if(ball.owner===p||dist(p,ball)<26) doShoot(p);
}
function triggerFreeKickShoot(){
  if(!freeKick || freeKick.isAI) return;
  if(!freeKick.charging){
    freeKick.charging=true; freeKick.power=0;
  } else {
    const t=players[freeKick.takerIdx];
    doFreeKickShoot(t, freeKick.power/100);
    freeKick=null;
  }
}
function actionPass(){
  if(freeKick && !freeKick.isAI){ const t=players[freeKick.takerIdx]; doFreeKickPass(t); freeKick=null; return; }
  if(goalKick && !goalKick.isAI){ const t=players[goalKick.takerIdx]; if(t) doGoalKickShort(t); return; }
  if(state!=='playing') return; const p=players[activeIdx]; if(ball.owner===p||dist(p,ball)<26) doPass(p);
}
// ====== 长传系统：可自由调节落点，高抛弧线，虚线预览轨迹 ======
function actionLongPass(){
  if(state!=='playing') return;
  // 任意球/球门球期间不触发长传
  if(freeKick || goalKick) return;
  const p=players[activeIdx];
  if(!p) return;
  const hasBall = ball.owner===p || dist(p,ball)<26;
  if(longPassAim){
    // 已在瞄准模式 → 执行长传
    if(hasBall){ doLongPass(p, longPassAim.tx, longPassAim.ty); }
    longPassAim=null;
    return;
  }
  if(!hasBall) return;
  // 进入瞄准模式：初始落点设在球员朝向方向 350 像素处
  const initDist = 350;
  let tx=p.x+p.face.x*initDist, ty=p.y+p.face.y*initDist;
  tx=clamp(tx, WALL+30, FW-WALL-30);
  ty=clamp(ty, WALL+30, FH-WALL-30);
  longPassAim={ tx, ty };
}
// 执行高抛长传：球沿弧线飞向目标落点
function doLongPass(p, tx, ty){
  const dx=tx-p.x, dy=ty-p.y, d=Math.hypot(dx,dy)||1;
  // 力度随距离自适应：近距离偏软，远距离更猛
  const power = clamp(d/700, 0.3, 1.0);
  const sp = 5 + power*9;            // 水平速度 5~14
  const vz0 = 9 + power*15;          // 垂直初速度，形成高抛弧线
  // 小偏差（长传精度略低于短传）
  const accDev = 0.04 + power*0.05;
  const ox=(Math.random()-0.5)*accDev, oy=(Math.random()-0.5)*accDev;
  ball.vx=(dx/d+ox)*sp; ball.vy=(dy/d+oy)*sp;
  ball.vz=vz0; ball.z=0;
  ball.owner=null; p.kick=0.3; ball.lastTeam=p.team;
  recordOffside(p);
}
// AI 长传：找前场空当或队友，高抛长传
function doAILongPass(p, attackDir){
  // 优先找前场队友作为目标
  let best=null, bd=-1;
  players.forEach(q=>{
    if(q.team===p.team && q!==p && !q.gk){
      const forward = (q.x-p.x)*attackDir;
      if(forward>200 && forward>bd){ bd=forward; best=q; }
    }
  });
  let tx, ty;
  if(best && Math.random()<0.6){
    tx = best.x + attackDir*50 + (Math.random()-0.5)*60;
    ty = best.y + (Math.random()-0.5)*60;
  } else {
    tx = p.x + attackDir*(FW*0.5);
    ty = FH/2 + (Math.random()-0.5)*FH*0.5;
  }
  tx=clamp(tx, WALL+30, FW-WALL-30); ty=clamp(ty, WALL+30, FH-WALL-30);
  const fdx=tx-p.x, fdy=ty-p.y, fl=Math.hypot(fdx,fdy)||1;
  p.face={x:fdx/fl, y:fdy/fl};
  doLongPass(p, tx, ty);
}
function actionTackle(){
  if(state!=='playing') return;
  const p=players[activeIdx];
  if(p.slide>0||p.stamina<15) return;
  // 玩家铲球：强度随机 0.4~0.9（中等偏高，模拟真实铲球力度）
  const power = 0.4 + Math.random()*0.5;
  doSlideTackle(p, p.face, power);
}
// 通用铲球触发：统一动画+物理+强度
function doSlideTackle(p, dir, power){
  if(p.slide>0||p.stamina<15) return;
  const len=Math.hypot(dir.x,dir.y)||1;
  const ndx=dir.x/len, ndy=dir.y/len;
  p.slide=0.5; p.stamina-=15;
  p.slideDir={x:ndx,y:ndy};
  p.slidePower=power; // 0~1 铲球强度
  // 强度决定滑行速度：弱铲 2.0，强铲 6.0
  const sp = 2.0 + power*4.0;
  p.vx=ndx*sp; p.vy=ndy*sp;
}
// ====== 犯规与红黄牌系统 ======// 普通犯规：仅任意球，不出牌不回放。direct: true直接任意球(射门可直接得分)/false间接
function callFoul(tackler, fx, fy, direct=true){
  const defTeam = tackler.team===TEAM_RED ? TEAM_BLUE : TEAM_RED;
  const fkX = clamp(fx!==undefined?fx:tackler.x, WALL+30, FW-WALL-30);
  const fkY = clamp(fy!==undefined?fy:tackler.y, WALL+30, FH-WALL-30);
  playWhistle();
  playCrowdGroan(0.8); // 犯规 → 观众嘘声
  startFreeKick(fkX, fkY, defTeam, direct);
}
function checkTackleFoul(tackler, victim){
  if(replayActive) return false;
  const dx=victim.x-tackler.x, dy=victim.y-tackler.y, dl=Math.hypot(dx,dy)||1;
  const vFace = victim.face;
  const dotBack = (dx/dl)*vFace.x + (dy/dl)*vFace.y; // >0=正面, <0=背后
  const speed = Math.hypot(tackler.vx, tackler.vy);
  const power = tackler.slidePower || 0.5;
  if(!tackler.fouls) tackler.fouls=0;
  tackler.fouls++;
  const foulX = (tackler.x + victim.x) / 2;
  const foulY = (tackler.y + victim.y) / 2;
  const isBehind = dotBack < -0.3;
  const isSide = dotBack >= -0.3 && dotBack < 0.3;
  // —— 红牌：背后高强度铲球 —— 回放
  if(isBehind && power > 0.75){
    startReplay({player:tackler, color:'red', reason:'暴力背后铲球', foulX, foulY}); return true;
  }
  // 两黄变红
  if(tackler.cards >= 1 && isBehind && power > 0.6){
    startReplay({player:tackler, color:'red', reason:'两黄变一红', foulX, foulY}); return true;
  }
  // —— 黄牌：背后中高强度铲球 ——
  if(isBehind && power > 0.55){
    executeShowCard(tackler, 'yellow', '背后危险铲球', foulX, foulY);
    return true;
  }
  // —— 累计犯规达 8 次才出黄牌 ——
  if(tackler.fouls >= 8){
    executeShowCard(tackler, 'yellow', '累计犯规', foulX, foulY);
    return true;
  }
  // —— 背后中等及以上强度判直接任意球（犯规后即任意球，不出牌）——
  if(isBehind && power > 0.5){
    callFoul(tackler, foulX, foulY, true); // 直接任意球
    return true;
  }
  // —— 侧面中等强度以上判间接任意球（如阻挡、战术犯规）——
  if(isSide && power > 0.6){
    callFoul(tackler, foulX, foulY, false); // 间接任意球
    return true;
  }
  // 正常铲球拼抢：不犯规
  return false;
}
function executeShowCard(player, color, reason, foulX, foulY){
  player.cards += 1;
  const cardText = color==='red' ? '红牌罚下！' : '黄牌警告';
  showMsg(`${player.name} ${cardText}（${reason}）`, 2200);
  playCardWhistle(color);
  if(color==='red' || player.cards >= 2){
    player.sentOff = true;
    const side = player.team===TEAM_RED ? -60 : FW+60;
    player.x = side; player.y = FH/2; player.vx=0; player.vy=0;
    if(players[activeIdx] === player){
      const next = players.findIndex(p=>p.team===player.team && !p.sentOff && !p.gk);
      if(next>=0) activeIdx = next;
    }
  }
  // 对方任意球：带牌犯规 = 直接任意球 + 摆人墙
  const defTeam = player.team===TEAM_RED ? TEAM_BLUE : TEAM_RED;
  const fkX = clamp(foulX!==undefined?foulX:player.x, WALL+30, FW-WALL-30);
  const fkY = clamp(foulY!==undefined?foulY:player.y, WALL+30, FH-WALL-30);
  startFreeKick(fkX, fkY, defTeam, true);
  setPieceMsg = color==='red' ? '红牌·直接任意球' : '黄牌·直接任意球';
}
function doShoot(p){
  const d=p.face, len=Math.hypot(d.x,d.y)||1, sp=13;
  ball.vx=d.x/len*sp; ball.vy=d.y/len*sp; ball.vz=0; ball.z=0;
  ball.owner=null; p.kick=0.3; ball.lastTeam=p.team; recordOffside(p);
  // 射门朝向对方球门时触发门将扑救
  triggerGKDive(p);
  // 射门 → 观众小欢呼
  const goalX = p.team===TEAM_RED ? FW : 0;
  const towardGoal = (p.team===TEAM_RED && ball.vx > 1) || (p.team===TEAM_BLUE && ball.vx < -1);
  if(towardGoal) playCrowdCheer(0.35, 1.0);
}
function doPass(p){
  let best=null,bd=1e9; const fx=p.face.x,fy=p.face.y;
  players.forEach(q=>{ if(q.team===p.team&&q!==p&&!q.gk){ const dx=q.x-p.x,dy=q.y-p.y,dot=dx*fx+dy*fy; if(dot<=0) return; const d=Math.hypot(dx,dy); if(d<bd){bd=d;best=q;} } });
  let tx,ty; if(best){tx=best.x;ty=best.y;} else {tx=p.x+fx*200;ty=p.y+fy*200;}
  const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy)||1,sp=7;
  ball.vx=dx/d*sp; ball.vy=dy/d*sp; ball.vz=0; ball.z=0; ball.owner=null; p.kick=0.2; ball.lastTeam=p.team;
  recordOffside(p);
}
// ====== 任意球主罚系统 ======
// direct: true=直接任意球(射门可直接得分+摆人墙)，false=间接任意球(需至少一脚传递)
function startFreeKick(x, y, team, direct=true){
  // 找最近的本方球员作为主罚者
  let best=-1, bd=1e9;
  players.forEach((p,i)=>{
    if(p.team!==team||p.sentOff) return;
    const d=dist(p,{x,y}); if(d<bd){bd=d;best=i;}
  });
  if(best<0) return;
  const taker=players[best];
  taker.x=x; taker.y=y; taker.vx=0; taker.vy=0;
  // 默认瞄向对方球门
  const goalX = team===TEAM_RED ? FW : 0;
  const goalY = FH/2;
  const dx=goalX-x, dy=goalY-y, len=Math.hypot(dx,dy)||1;
  taker.face={x:dx/len, y:dy/len};
  ball.x=x; ball.y=y; ball.vx=0; ball.vy=0; ball.vz=0; ball.z=0;
  ball.owner=taker; ball.lastTeam=team;

  const DEF_DIST = 85; // 人墙距离（9.15m 约对应 85 像素）
  const wallList = [];

  if(direct){
    // —— 直接任意球：摆人墙 ——
    // 选对方距离球较近的后卫/中场组成人墙（3~5人）
    const wallers = players.filter(p=>p.team!==team && !p.sentOff && !p.gk)
      .map(p=>({p, d:dist(p,{x,y})}))
      .sort((a,b)=>a.d-b.d)
      .slice(0,4).map(o=>o.p);
    // 计算球→球门中心连线，人墙沿此连线的法向分布
    const fdx = (goalX-x)/len, fdy = (goalY-y)/len; // 单位方向（球→球门）
    const npx = -fdy, npy = fdx; // 法向（人墙站位方向）
    const wallCX = x + fdx*DEF_DIST; // 人墙中心
    const wallCY = y + fdy*DEF_DIST;
    const wallCount = wallers.length;
    const spacing = 24; // 人墙队员间距
    wallers.forEach((p,i)=>{
      const off = (i - (wallCount-1)/2) * spacing;
      p.x = wallCX + npx*off;
      p.y = wallCY + npy*off;
      // 朝向球（准备起跳封堵）
      const f2x=x-p.x, f2y=y-p.y, l2=Math.hypot(f2x,f2y)||1;
      p.face={x:f2x/l2, y:f2y/l2};
      p.vx=0; p.vy=0;
      wallList.push(players.indexOf(p));
    });
    // 对方门将位置已在防守位；其余防守球员后退至少 9.15m 远离球
    players.forEach(p=>{
      if(p.team!==team && !p.sentOff && !p.gk && wallList.indexOf(players.indexOf(p))<0){
        const pd=dist(p,{x,y});
        if(pd < DEF_DIST + 10){
          const px=p.x-x, py=p.y-y, pl=Math.hypot(px,py)||1;
          p.x=x+px/pl*(DEF_DIST+10); p.y=y+py/pl*(DEF_DIST+10); p.vx=0; p.vy=0;
        }
      }
    });
  } else {
    // —— 间接任意球：不摆人墙，仅统一后退 9.15m ——
    players.forEach(p=>{
      if(p.team!==team && !p.sentOff){
        const pd=dist(p,{x,y});
        if(pd < DEF_DIST){
          const px=p.x-x, py=p.y-y, pl=Math.hypot(px,py)||1;
          p.x=x+px/pl*DEF_DIST; p.y=y+py/pl*DEF_DIST; p.vx=0; p.vy=0;
        }
      }
    });
  }

  freeKick={ takerIdx:best, team, timer:4.0, isAI: team!==TEAM_RED, direct, wall:wallList, touched:false };
  if(team===TEAM_RED) activeIdx=best;
  setPiece='foul'; setPieceTimer=99; setPieceMsg = (direct?'直接':'间接') + '任意球';
  offsideCheck=null;
}
function doFreeKickShoot(taker, power=1.0){
  const d=taker.face, len=Math.hypot(d.x,d.y)||1;
  const sp = 8 + power*11; // 力度 8~19
  const accDev = (1-power)*0.04 + power*0.09;
  const ox=(Math.random()-0.5)*accDev, oy=(Math.random()-0.5)*accDev;
  ball.vx=(d.x/len+ox)*sp; ball.vy=(d.y/len+oy)*sp; ball.vz=0; ball.z=0;
  ball.owner=null; taker.kick=0.3; ball.lastTeam=taker.team;
  recordOffside(taker);
  // 间接任意球：需至少一次传球才能得分，标记 touched=false
  const indirectPenalty = !(freeKick && freeKick.direct);
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  // 直接任意球：人墙起跳封堵（标记起跳人墙，物理中处理球到人墙反弹）
  if(freeKick && freeKick.direct && Array.isArray(freeKick.wall)){
    const jumpChance = 0.55 + power*0.2; // 力度越大越容易跳起封堵
    freeKick.wall.forEach(wi=>{
      const wp=players[wi]; if(!wp||wp.sentOff) return;
      if(Math.random() < jumpChance){
        wp.slide = 0.35; // 用 slide 短暂模拟起跳（视觉压缩 + 遮挡）
        wp.slideDir = {x:taker.face.x/len, y:taker.face.y/len};
        wp.slidePower = 0.2;
      }
    });
  }
  freeKick=null;
  // 间接任意球：若进球则无效 → 用球速反向微扰方式标记
  if(indirectPenalty){
    ball._indirect = true;
  }
  // 触发门将扑救
  triggerGKDive(taker);
  // 任意球射门 → 观众期待欢呼
  playCrowdCheer(0.5, 1.5);
}
function triggerGKDive(taker){
  const defTeam = taker.team===TEAM_RED ? TEAM_BLUE : TEAM_RED;
  const gk = players.find(p=>p.team===defTeam && p.gk && !p.sentOff);
  if(!gk) return;
  const goalX = taker.team===TEAM_RED ? FW : 0;
  // 球必须朝球门方向飞行才触发扑救
  const towardGoal = (taker.team===TEAM_RED && ball.vx > 1) || (taker.team===TEAM_BLUE && ball.vx < -1);
  if(!towardGoal) return;
  const t = Math.abs((goalX-ball.x)/(ball.vx||0.1));
  if(t > 60 || t < 0) return; // 太慢或方向错误不触发
  const predY = ball.y + ball.vy*t;
  // 射门偏离球门太远不触发
  if(predY < FH/2-GOAL_H/2-30 || predY > FH/2+GOAL_H/2+30) return;
  // 门将判断有误差，力度越大越难扑，远射额外增加反应时间
  const power = Math.hypot(ball.vx, ball.vy);
  const shotDist = Math.abs(goalX - taker.x);
  const isLongShot = shotDist > 500; // 远射判定
  const errorAmt = 30 + power*4 + Math.random()*60 + (isLongShot ? 20 : 0);
  const diveTargetY = clamp(predY + (Math.random()-0.5)*errorAmt, FH/2-GOAL_H/2+5, FH/2+GOAL_H/2-5);
  gk.diveDir = diveTargetY < FH/2-15 ? -1 : (diveTargetY > FH/2+15 ? 1 : 0);
  gk.diveTimer = isLongShot ? 0.85 : 0.7; // 远射给门将更多反应时间
  gk.diveTargetY = diveTargetY;
}
function doFreeKickPass(taker){
  let best=null,bd=1e9; const fx=taker.face.x,fy=taker.face.y;
  players.forEach(q=>{
    if(q.team===taker.team&&q!==taker&&!q.sentOff&&!q.gk){
      const dx=q.x-taker.x,dy=q.y-taker.y,dot=dx*fx+dy*fy;
      if(dot<=0) return; const d=Math.hypot(dx,dy); if(d<bd){bd=d;best=q;}
    }
  });
  let tx,ty;
  if(best){tx=best.x;ty=best.y;} else {tx=taker.x+fx*200;ty=taker.y+fy*200;}
  const dx=tx-taker.x,dy=ty-taker.y,d=Math.hypot(dx,dy)||1,sp=9;
  ball.vx=dx/d*sp; ball.vy=dy/d*sp; ball.vz=0; ball.z=0;
  ball.owner=null; taker.kick=0.2; ball.lastTeam=taker.team;
  delete ball._indirect; // 传球/短传视作已触碰，后续进球有效
  recordOffside(taker);
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  freeKick=null;
}
function updateFreeKick(dt){
  freeKick.timer-=dt;
  const taker=players[freeKick.takerIdx];
  if(!taker||taker.sentOff){ freeKick=null; setPiece=null; setPieceTimer=0; return; }
  taker.vx=0; taker.vy=0;
  if(!freeKick.isAI){
    // 人类玩家：方向键瞄准
    const mv=readMove();
    if(Math.abs(mv.x)>0.1||Math.abs(mv.y)>0.1){
      taker.face={x:mv.x,y:mv.y};
    }
    // 力量条：按一次空格开始蓄力，再按一次射门
    if(keys[' '] && !freeKick.spaceLatch){
      freeKick.spaceLatch=true;
      triggerFreeKickShoot();
      if(!freeKick) return;
    }
    if(!keys[' ']) freeKick.spaceLatch=false;
    // 力量条蓄力中
    if(freeKick.charging){
      freeKick.power += dt*85; // ~1.2秒满
      if(freeKick.power>=100){
        doFreeKickShoot(taker, 1.0);
        freeKick=null; return;
      }
    }
    // 传球（无需蓄力）
    if(keys['shift'] && !freeKick.shiftLatch){
      freeKick.shiftLatch=true;
      doFreeKickPass(taker);
      freeKick=null; return;
    }
    if(!keys['shift']) freeKick.shiftLatch=false;
  } else {
    // AI 主罚
    if(freeKick.timer < 2.5){
      const goalX = taker.team===TEAM_RED ? FW : 0;
      const goalY=FH/2;
      const offset=(Math.random()-0.5)*100;
      const dx=goalX-taker.x, dy=(goalY+offset)-taker.y, len=Math.hypot(dx,dy)||1;
      taker.face={x:dx/len, y:dy/len};
    }
    if(freeKick.timer < 2.0){
      const goalX = taker.team===TEAM_RED ? FW : 0;
      const goalDist=Math.abs(taker.x - goalX);
      if(freeKick.direct){
        // 直接任意球：禁区外距离合适 → 射门；太远 → 传球
        if(goalDist > 820 || goalDist < 180){
          doFreeKickPass(taker);
        } else {
          doFreeKickShoot(taker, 0.65+Math.random()*0.35);
        }
      } else {
        // 间接任意球：必须先传递，严禁直接射门得分
        doFreeKickPass(taker);
      }
      return;
    }
  }
  // 持续保持对方退让
  players.forEach(p=>{
    if(p.team!==freeKick.team && !p.sentOff){
      const d=dist(p, ball);
      if(d<55){
        const dx=p.x-ball.x, dy=p.y-ball.y, dl=Math.hypot(dx,dy)||1;
        p.x=ball.x+dx/dl*58; p.y=ball.y+dy/dl*58;
      }
    }
  });
  if(freeKick.timer<=0){
    doFreeKickPass(taker); freeKick=null;
  }
}
// ====== 球门球开大脚系统 ======
// 开大脚：高抛长传
function doGoalKickLong(taker, power=1.0){
  const d=taker.face, len=Math.hypot(d.x,d.y)||1;
  const sp = 5 + power*10; // 水平速度 5~15
  const vz0 = 8 + power*18; // 垂直初速度，形成高抛弧线
  // 小偏差
  const accDev = (1-power)*0.03 + power*0.06;
  const ox=(Math.random()-0.5)*accDev, oy=(Math.random()-0.5)*accDev;
  ball.vx=(d.x/len+ox)*sp; ball.vy=(d.y/len+oy)*sp;
  ball.vz=vz0; ball.z=0;
  ball.owner=null; taker.kick=0.3; ball.lastTeam=taker.team;
  recordOffside(taker);
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  goalKick=null;
}
// 球门球短传（交给附近队友）
function doGoalKickShort(taker){
  let best=null,bd=1e9;
  players.forEach(q=>{
    if(q.team===taker.team&&q!==taker&&!q.gk){
      const dx=q.x-taker.x,dy=q.y-taker.y,d=Math.hypot(dx,dy);
      if(d<bd&&d<300){bd=d;best=q;}
    }
  });
  let tx,ty;
  if(best){tx=best.x;ty=best.y;}
  else{tx=taker.x+taker.face.x*200;ty=taker.y+taker.face.y*200;}
  const dx=tx-taker.x,dy=ty-taker.y,d=Math.hypot(dx,dy)||1,sp=6.5;
  ball.vx=dx/d*sp; ball.vy=dy/d*sp; ball.vz=0; ball.z=0;
  ball.owner=null; taker.kick=0.2; ball.lastTeam=taker.team;
  recordOffside(taker);
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  goalKick=null;
}
function updateGoalKick(dt){
  goalKick.timer-=dt;
  const taker=players[goalKick.takerIdx];
  if(!taker||taker.sentOff){ goalKick=null; setPiece=null; setPieceTimer=0; return; }
  taker.vx=0; taker.vy=0;
  if(!goalKick.isAI){
    // 人类玩家：方向键瞄准
    const mv=readMove();
    if(Math.abs(mv.x)>0.1||Math.abs(mv.y)>0.1){
      taker.face={x:mv.x,y:mv.y};
    }
    // 空格/射门键：蓄力开大脚（按一次开始蓄力，再按一次踢出）
    if(keys[' '] && !goalKick.spaceLatch){
      goalKick.spaceLatch=true;
      if(!goalKick.charging){
        goalKick.charging=true; goalKick.power=10;
      } else {
        doGoalKickLong(taker, Math.max(0.25, goalKick.power/100));
        return;
      }
    }
    if(!keys[' ']) goalKick.spaceLatch=false;
    // 蓄力中
    if(goalKick.charging){
      goalKick.power += dt*90; // ~1.1秒满
      if(goalKick.power>=100){
        doGoalKickLong(taker, 1.0); return;
      }
    }
    // Shift/传球键：短传给附近队友
    if(keys['shift']){
      doGoalKickShort(taker); return;
    }
  } else {
    // AI 门将：2.0~3.0秒后自动开球
    if(goalKick.timer < 2.2){
      // 80%概率开大脚，20%概率短传
      const attackDir = taker.team===TEAM_RED ? 1 : -1;
      if(Math.random() < 0.82){
        // 找前场队友作为目标方向（或空当）
        let best=null,bd=-1;
        players.forEach(q=>{
          if(q.team===taker.team&&q!==taker){
            const forward = (q.x - taker.x)*attackDir;
            if(forward > 200 && forward > bd){bd=forward;best=q;}
          }
        });
        let tx,ty;
        if(best && Math.random()<0.6){
          // 瞄准前场队友附近，带提前量
          tx = best.x + attackDir*60 + (Math.random()-0.5)*80;
          ty = best.y + (Math.random()-0.5)*80;
        } else {
          // 直接朝前场空当开
          tx = taker.x + attackDir*(FW*0.55);
          ty = FH/2 + (Math.random()-0.5)*FH*0.55;
        }
        const dx=tx-taker.x, dy=ty-taker.y, len=Math.hypot(dx,dy)||1;
        taker.face={x:dx/len, y:dy/len};
        const power = 0.65 + Math.random()*0.35;
        setTimeout(()=>{ if(goalKick && players[goalKick.takerIdx]===taker) doGoalKickLong(taker, power); }, 180);
        goalKick.timer = 999; // 防止重复触发
      } else {
        setTimeout(()=>{ if(goalKick && players[goalKick.takerIdx]===taker) doGoalKickShort(taker); }, 180);
        goalKick.timer = 999;
      }
    }
  }
  // 持续保持对方退让
  players.forEach(p=>{
    if(p.team!==goalKick.team && !p.sentOff){
      const d=dist(p, ball);
      if(d<55){
        const dx=p.x-ball.x, dy=p.y-ball.y, dl=Math.hypot(dx,dy)||1;
        p.x=ball.x+dx/dl*58; p.y=ball.y+dy/dl*58;
      }
    }
  });
  if(goalKick.timer<=0 && goalKick.timer !== 999){
    doGoalKickLong(taker, 0.7);
  }
}
// 越位线：对方倒数第二名防守队员（含门将）的 x
function getOffsideLine(attackingTeam){
  const defTeam = attackingTeam===TEAM_RED ? TEAM_BLUE : TEAM_RED;
  const goalX = attackingTeam===TEAM_RED ? FW : 0;
  const defs = players.filter(p=>p.team===defTeam)
    .map(p=>({x:p.x, d:Math.abs(p.x-goalX)}))
    .sort((a,b)=>a.d-b.d);
  if(defs.length>=2) return defs[1].x;
  return goalX;
}
// 传球/射门时记录越位检测数据
function recordOffside(passer){
  offsideCheck = {
    team: passer.team,
    lineX: getOffsideLine(passer.team),
    attackDir: passer.team===TEAM_RED ? 1 : -1,
    passerIdx: players.indexOf(passer)
  };
}
// 判罚越位
function callOffside(offender){
  const defTeam = offender.team===TEAM_RED ? TEAM_BLUE : TEAM_RED;
  const fkX=clamp(offender.x,WALL+20,FW-WALL-20), fkY=clamp(offender.y,WALL+20,FH-WALL-20);
  ball.owner=null; ball.vx=0; ball.vy=0;
  offsideCheck=null;
  setPiece='offside'; setPieceTimer=2.0; setPieceMsg='越位';
  // 任意球给防守方，在越位位置发球
  let best=-1,bd=1e9;
  players.forEach((p,i)=>{
    if(p.team!==defTeam) return;
    const d=dist(p,{x:fkX,y:fkY});
    if(d<bd){bd=d;best=i;}
  });
  if(best>=0){
    const p=players[best];
    p.x=fkX; p.y=fkY; p.vx=0; p.vy=0;
    p.face={x: defTeam===TEAM_RED?1:-1, y:0};
    ball.x=fkX; ball.y=fkY; ball.owner=p; ball.lastTeam=defTeam;
    if(defTeam===TEAM_RED) activeIdx=best;
  }
  // 越位方队员退让（至少 9.15 米）
  players.forEach(p=>{
    if(p.team===defTeam) return;
    const d=dist(p,{x:fkX,y:fkY});
    if(d<55){
      const dx=p.x-fkX, dy=p.y-fkY, dl=Math.hypot(dx,dy)||1;
      p.x=fkX+dx/dl*55; p.y=fkY+dy/dl*55;
      p.x=clamp(p.x,WALL,FW-WALL); p.y=clamp(p.y,WALL,FH-WALL);
    }
  });
  showMsg('越位！', 1500);
  playWhistle();
}

// ====== 比赛模式 AI（角色化：各司其职）======
// 将 x 限制在以本方球门为基准的区域内（near/far 为距本方球门的距离，正向进攻方向）
function clampBand(v, ownGoalX, attackDir, near, far){
  const lo = ownGoalX + attackDir*near, hi = ownGoalX + attackDir*far;
  return clamp(v, Math.min(lo,hi), Math.max(lo,hi));
}
// 找到本队中"该去追球"的球员：优先球落在其防区内的最近队员，否则全局最近
function getTeamChaser(team){
  let best=-1, bd=1e9, anyInZone=false;
  players.forEach((q,i)=>{
    if(q.team===team && !q.gk){
      const range = (q.role==='DEF'?110 : q.role==='MID'?160 : 120)*SX;
      if(Math.abs(ball.x - q.homeX) < range+80*SX){
        anyInZone=true; const d=dist(q,ball); if(d<bd){bd=d;best=i;}
      }
    }
  });
  if(anyInZone) return best;
  bd=1e9;
  players.forEach((q,i)=>{ if(q.team===team&&!q.gk){ const d=dist(q,ball); if(d<bd){bd=d;best=i;} } });
  return best;
}
// 协防：对方持球深入我方半场时，第二名防守者上抢
function getTeamPressers(team){
  const primary = getTeamChaser(team);
  const ballInDefZone = team===TEAM_RED ? ball.x < FW*0.35 : ball.x > FW*0.65;
  const oppHasBall = ball.owner && ball.owner.team !== team;
  if(ballInDefZone && oppHasBall){
    let second=-1, bd=1e9;
    players.forEach((q,i)=>{ if(q.team===team&&!q.gk&&i!==primary){ const d=dist(q,ball); if(d<bd){bd=d;second=i;} } });
    return [primary, second];
  }
  return [primary, -1];
}
function aiUpdate(p, dt, idx, chaserIdx, secIdx){
  const attackDir = p.team===TEAM_RED ? 1 : -1;
  const goalX = p.team===TEAM_RED ? FW : 0;
  const ownGoalX = p.team===TEAM_RED ? 0 : FW;

  // —— 门将：预判球路、快速扑救、大脚解围 ——
  if(p.gk){
    const gx = p.team===TEAM_RED ? 100*SX : FW-100*SX;
    // 扑救动画
    if(p.diveTimer && p.diveTimer>0){
      p.diveTimer-=dt;
      const dty = p.diveTargetY || FH/2;
      // 快速扑向目标位置
      const dy = dty - p.y;
      p.y += dy * 0.18;
      p.vx = 0; p.vy = 0;
      // 扑到球
      if(dist(p,ball)<32 && ball.owner===null && Math.abs(ball.x-gx)<80){
        p.kick=0.2; const dir=attackDir;
        ball.vx=dir*8+rand(-2,2); ball.vy=(ball.y<FH/2?-1:1)*5+rand(-2,2); ball.vz=0; ball.z=0;
        ball.owner=null; ball.lastTeam=p.team; recordOffside(p);
        p.diveTimer=0;
        playCrowdClap(1.5); // 门将扑救 → 掌声
      }
      return;
    }
    const predY = ball.y + ball.vy*3;
    const ty = clamp(predY, FH/2-GOAL_H/2+8, FH/2+GOAL_H/2-8);
    moveToward(p, gx, ty, 0.85);
    if(Math.abs(ball.x-goalX)<165*SX) moveToward(p, clamp(ball.x,gx-30*SX,gx+30*SX), clamp(predY, FH/2-GOAL_H/2, FH/2+GOAL_H/2), 1.7);
    if(dist(p,ball)<26 && ball.owner===null){ p.kick=0.2; const dir=attackDir; ball.vx=dir*9+rand(-1,1); ball.vy=(ball.y<FH/2?-1:1)*4+rand(-2,2); ball.vz=0; ball.z=0; ball.owner=null; ball.lastTeam=p.team; recordOffside(p); }
    return;
  }

  // —— 自己带球：向前推进，近门则射，否则偶尔传 ——
  if(ball.owner===p){
    moveToward(p, goalX, FH/2+rand(-40,40), 0.72);
    p.face.x=attackDir;
    if(Math.abs(ball.x-goalX)<300*SX && Math.random()<0.05){
      const gy=FH/2+rand(-GOAL_H/2+20,GOAL_H/2-20); const dx=goalX-p.x,dy=gy-p.y,d=Math.hypot(dx,dy)||1,sp=12;
      ball.vx=dx/d*sp; ball.vy=dy/d*sp; ball.vz=0; ball.z=0; ball.owner=null; p.kick=0.25; ball.lastTeam=p.team; recordOffside(p);
      triggerGKDive(p);
    } else if(Math.random()<0.012){ doPass(p); }
    else if(Math.random()<0.006){ doAILongPass(p, attackDir); }
    return;
  }

  // —— 负责追球 / 协防上抢的人 ——
  if(idx===chaserIdx || idx===secIdx){
    const px=ball.x+ball.vx*4, py=ball.y+ball.vy*4;
    // AI 铲球：接近持球对方球员时有概率铲断
    if(p.slide<=0 && p.stamina>20 && ball.owner && ball.owner.team!==p.team){
      const d = dist(p, ball.owner);
      if(d < 32 && Math.random() < 0.025){
        // 追球者铲球强度：0.3~0.8，后卫偏强
        const power = p.role==='DEF' ? 0.4+Math.random()*0.45 : 0.3+Math.random()*0.4;
        const ddx=ball.owner.x-p.x, ddy=ball.owner.y-p.y;
        doSlideTackle(p, {x:ddx,y:ddy}, power);
      }
    }
    moveToward(p, px, py, idx===chaserIdx?0.85:0.78);
    return;
  }

  // —— 各司其职：按角色保持阵型，不乱跑 ——
  // 所有球员：对方持球靠近时均可铲球
  if(p.slide<=0 && p.stamina>20 && ball.owner && ball.owner.team!==p.team){
    const d = dist(p, ball.owner);
    if(d < 30 && Math.random() < 0.012){
      // 非追球者铲球强度：后卫最强(0.4~0.85)，中场中等(0.3~0.6)，前锋较弱(0.25~0.5)
      let power;
      if(p.role==='DEF') power = 0.4 + Math.random()*0.45;
      else if(p.role==='MID') power = 0.3 + Math.random()*0.3;
      else power = 0.25 + Math.random()*0.25;
      const ddx=ball.owner.x-p.x, ddy=ball.owner.y-p.y;
      doSlideTackle(p, {x:ddx,y:ddy}, power);
      return;
    }
  }
  let tx, ty;
  const dby = ball.y - p.homeY;
  if(p.role==='DEF'){
    // 后卫：以homeX为锚，球影响深度，个体偏移打破对称不站一排
    const ballDistY = Math.abs(p.homeY - ball.y);
    const pressFactor = Math.max(0, 1 - ballDistY / 200); // 0~1，离球越近越大
    // 每个后卫独特的深度偏移，打破左右对称
    const idx = p.homeY < 300 ? 0 : (p.homeY < 500 ? 1 : (p.homeY < 700 ? 2 : 3));
    const personalOffset = [-20, 40, -10, -40][idx] * SX;
    // 球的位置拉扯深度：近球后卫被球拉得更远
    const ballDelta = (ball.x - p.homeX) * (0.15 + pressFactor * 0.15);
    tx = clampBand(p.homeX + ballDelta + personalOffset, ownGoalX, attackDir, 100*SX, 450*SX);
    // y 方向：近球后卫跟随球，远球后卫保持阵型
    ty = p.homeY + dby*(0.12 + pressFactor*0.38);
  } else if(p.role==='MID'){
    // 中场：略落后于球，在中场带活动
    tx = clampBand(ball.x - attackDir*60*SX, ownGoalX, attackDir, 300*SX, 580*SX);
    ty = p.homeY + dby*0.4;
  } else {
    // 前锋：智能跑位，有回撤接应有前插空当，不扎堆
    const ballDistY = Math.abs(p.homeY - ball.y);
    const isNearBall = ballDistY < 180;
    const teamHasBall = ball.lastTeam === p.team;
    if(isNearBall && teamHasBall){
      // 近球 + 有球权：回撤接应创造短传点
      tx = clampBand(ball.x + attackDir*40*SX, ownGoalX, attackDir, 380*SX, 680*SX);
      ty = p.homeY + dby*0.5;
    } else if(teamHasBall){
      // 远球 + 有球权：前插跑空当拉开纵深
      tx = clampBand(ball.x + attackDir*190*SX, ownGoalX, attackDir, 550*SX, 820*SX);
      ty = p.homeY + dby*0.15;
    } else {
      // 无球权：保持前压中线附近等反击
      tx = clampBand(ball.x + attackDir*120*SX, ownGoalX, attackDir, 460*SX, 760*SX);
      ty = p.homeY + dby*0.25;
    }
  }
  moveToward(p, tx, ty, 0.7);
}
function moveToward(p,tx,ty,sp){
  const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy)||1,acc=0.32,max=1.4*sp;
  p.vx+=dx/d*acc; p.vy+=dy/d*acc; const v=Math.hypot(p.vx,p.vy); if(v>max){p.vx=p.vx/v*max;p.vy=p.vy/v*max;}
  if(Math.abs(dx)>2||Math.abs(dy)>2){p.face.x=dx/d;p.face.y=dy/d;}
}

// ====== 定位球（角球/球门球/边线球） ======
// placeBall(type, x, y, awardTeam)：把球放到 (x,y)，由 awardTeam 球员跑到位置持球
function placeBall(type, x, y, awardTeam){
  setPiece = type;
  setPieceTimer = 1.8;
  offsideCheck = null;
  ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0; ball.owner = null;
  ball.lastTeam = awardTeam;
  // 球门球优先由门将主罚
  let best=-1, bd=1e9;
  if(type==='goalkick'){
    players.forEach((p,i)=>{ if(p.team===awardTeam && p.gk) best=i; });
  }
  // 其他定位球找最近球员
  if(best<0){
    players.forEach((p,i)=>{
      if(p.team!==awardTeam) return;
      const d=dist(p, ball);
      if(d<bd){bd=d; best=i;}
    });
  }
  if(best>=0){
    const p=players[best];
    // 球员移动到球的位置
    p.x=x; p.y=y; p.vx=0; p.vy=0;
    // 面向进攻方向
    p.face={x: awardTeam===TEAM_RED?1:-1, y:0};
    ball.owner=p; ball.lastTeam=awardTeam;
    if(awardTeam===TEAM_RED) activeIdx=best;
  }
  // 对方队员退让（至少 9.15 米 ≈ 55 单位）
  players.forEach(p=>{
    if(p.team===awardTeam) return;
    const d=dist(p,{x,y});
    if(d<55){
      const dx=p.x-x, dy=p.y-y, dl=Math.hypot(dx,dy)||1;
      p.x=x+dx/dl*55; p.y=y+dy/dl*55;
      p.x=clamp(p.x,WALL,FW-WALL); p.y=clamp(p.y,WALL,FH-WALL);
    }
  });
  const labels = {corner:'角球', goalkick:'球门球', throwin:'边线球', offside:'越位 · 任意球'};
  setPieceMsg = labels[type]||'';
  // 球门球：初始化开大脚蓄力状态
  if(type==='goalkick' && best>=0){
    goalKick = { takerIdx:best, team:awardTeam, isAI: awardTeam!==TEAM_RED, charging:false, power:0, spaceLatch:false, timer:3.5 };
  } else {
    goalKick = null;
  }
}

// 边线球：发球队员跑到边线，持球，对方退让
function doThrowIn(x, y, awardTeam){
  setPiece = 'throwin';
  setPieceTimer = 2.2;
  offsideCheck = null;
  ball.lastTeam = awardTeam;
  // 找最近的本方球员
  let best=-1, bd=1e9;
  players.forEach((p,i)=>{
    if(p.team!==awardTeam) return;
    const d=dist(p,{x,y});
    if(d<bd){bd=d;best=i;}
  });
  if(best>=0){
    const p=players[best];
    // 球员移动到边线发球点
    p.x=x; p.y=y; p.vx=0; p.vy=0;
    // 面向场内
    p.face={x: awardTeam===TEAM_RED?1:-1, y:0};
    // 球放到发球点，由该队员持有
    ball.x=x; ball.y=y; ball.vx=0; ball.vy=0; ball.owner=p;
    if(awardTeam===TEAM_RED) activeIdx=best;
  } else {
    ball.x=x; ball.y=y; ball.vx=0; ball.vy=0; ball.owner=null;
  }
  // 对方队员退让（真实规则：至少 2 米）
  players.forEach(p=>{
    if(p.team===awardTeam) return;
    const d=dist(p,{x,y});
    if(d<55){
      const dx=p.x-x, dy=p.y-y, dl=Math.hypot(dx,dy)||1;
      p.x=x+dx/dl*55; p.y=y+dy/dl*55;
      p.x=clamp(p.x,WALL,FW-WALL); p.y=clamp(p.y,WALL,FH-WALL);
    }
  });
  setPieceMsg='边线球';
}

// ====== 比赛模式物理 ======
function physicsStep(dt, fullAI){
  // 任意球主罚模式：优先处理
  if(freeKick){
    updateFreeKick(dt);
    // 仍更新球员位置（摩擦力等）
    players.forEach(p=>{
      if(p.sentOff) return;
      p.x+=p.vx; p.y+=p.vy; p.vx*=0.82; p.vy*=0.82; p.kick=Math.max(0,p.kick-dt);
    });
    // 球的物理（球是静止的，但保持位置）
    if(ball.owner){
      const op=ball.owner;
      ball.x=op.x+op.face.x*12; ball.y=op.y+op.face.y*12;
    }
    return;
  }
  // 球门球开大脚模式：优先处理
  if(goalKick){
    updateGoalKick(dt);
    players.forEach(p=>{
      if(p.sentOff) return;
      p.x+=p.vx; p.y+=p.vy; p.vx*=0.82; p.vy*=0.82; p.kick=Math.max(0,p.kick-dt);
    });
    if(ball.owner){
      const op=ball.owner;
      ball.x=op.x+op.face.x*12; ball.y=op.y+op.face.y*12;
    }
    return;
  }
  const mv=readMove();
  const ap=players[activeIdx];
  // 丢球时自动取消长传瞄准
  if(longPassAim && ap && ball.owner!==ap && dist(ap,ball)>40) longPassAim=null;
  if(ap){
    if(longPassAim){
      // —— 长传瞄准模式：方向键/摇杆移动落点，球员原地转向 ——
      const aimSpeed = 7.5;
      longPassAim.tx += mv.x * aimSpeed;
      longPassAim.ty += mv.y * aimSpeed;
      longPassAim.tx = clamp(longPassAim.tx, WALL+30, FW-WALL-30);
      longPassAim.ty = clamp(longPassAim.ty, WALL+30, FH-WALL-30);
      // 球员面向落点
      const fdx=longPassAim.tx-ap.x, fdy=longPassAim.ty-ap.y, fl=Math.hypot(fdx,fdy)||1;
      ap.face={x:fdx/fl, y:fdy/fl};
      ap.vx*=0.6; ap.vy*=0.6; // 瞄准时减速
      ap.stamina=Math.min(100, ap.stamina+0.32);
      // 空格 = 执行长传；Shift = 取消瞄准改短传
      if(keys[' ']) actionLongPass();
      if(keys['shift']){ longPassAim=null; actionPass(); }
    } else {
      let max=1.4, acc=0.4;
      const moving = Math.abs(mv.x)>0.1||Math.abs(mv.y)>0.1;
      const sprinting = keys['z'] && ap.stamina>10 && moving;
      if(sprinting){ max=2.2; acc=0.62; ap.stamina=Math.max(0,ap.stamina-0.85); }
      else { ap.stamina=Math.min(100,ap.stamina+0.32); }
      ap.vx+=mv.x*acc; ap.vy+=mv.y*acc;
      const v=Math.hypot(ap.vx,ap.vy); if(v>max){ap.vx=ap.vx/v*max;ap.vy=ap.vy/v*max;}
      if(moving) ap.face={x:mv.x,y:mv.y};
      if(keys[' ']) actionShoot();
      if(keys['shift']) actionPass();
      if(keys['c']) actionTackle();
    }
  }
  const [chaserRed, secRed] = getTeamPressers(TEAM_RED);
  const [chaserBlue, secBlue] = getTeamPressers(TEAM_BLUE);
  players.forEach((p,i)=>{ if(i===activeIdx) return; if(fullAI||!p.gk) aiUpdate(p,dt,i, p.team===TEAM_RED?chaserRed:chaserBlue, p.team===TEAM_RED?secRed:secBlue); });
  players.forEach(p=>{
    if(p.sentOff) return;
    p.x+=p.vx; p.y+=p.vy; p.vx*=0.82; p.vy*=0.82; p.kick=Math.max(0,p.kick-dt);
    if(p.slide>0){
      p.slide-=dt;
      // 铲球碰撞检测
      players.forEach(q=>{
        if(q===p||q.sentOff||q.team===p.team) return;
        if(dist(p,q) < p.r+q.r+2){
          // 铲到对方球员
          if(ball.owner===q || dist(p,ball)>30){
            // 没铲到球，铲到人 → 犯规
            checkTackleFoul(p, q);
            q.vx += p.slideDir.x*2; q.vy += p.slideDir.y*2; // 被铲球员被撞飞
            p.slide=0; p.vx=0; p.vy=0;
          } else {
            // 铲到球 → 成功断球
            ball.vx = p.slideDir.x*6; ball.vy = p.slideDir.y*6; ball.vz=0; ball.z=0;
            ball.owner=null; ball.lastTeam=p.team;
          }
        }
      });
    }
    p.x=clamp(p.x,20,FW-20); p.y=clamp(p.y,20,FH-20);
  });
  // z 轴物理：重力 + 反弹
  ball.vz -= GRAVITY * dt;
  ball.z += ball.vz * dt * 60;
  if(ball.z <= 0){
    ball.z = 0;
    if(ball.vz < -2){
      ball.vz = -ball.vz * BALL_BOUNCE;
      ball.vx *= 0.88; ball.vy *= 0.88;
    } else {
      ball.vz = 0;
    }
  }
  ball.x+=ball.vx; ball.y+=ball.vy; ball.vx*=0.992; ball.vy*=0.992;
  // 定位球冷却倒计时
  if(setPieceTimer>0){ setPieceTimer-=dt; if(setPieceTimer<=0){ setPiece=null; setPieceMsg=''; } }
  const goalTop=FH/2-GOAL_H/2, goalBot=FH/2+GOAL_H/2;
  const canSetPiece = state==='playing' && setPieceTimer<=0 && !freeKick;
  // 上下边线 → 边线球（发球队员跑到边线掷球）
  if(ball.y<WALL+ball.r){
    if(canSetPiece){ const t = ball.lastTeam===TEAM_RED?TEAM_BLUE:TEAM_RED; doThrowIn(clamp(ball.x,WALL+20,FW-WALL-20), WALL+18, t); }
    else { ball.y=WALL+ball.r; ball.vy*=-0.6; }
  }
  if(ball.y>FH-WALL-ball.r){
    if(canSetPiece){ const t = ball.lastTeam===TEAM_RED?TEAM_BLUE:TEAM_RED; doThrowIn(clamp(ball.x,WALL+20,FW-WALL-20), FH-WALL-18, t); }
    else { ball.y=FH-WALL-ball.r; ball.vy*=-0.6; }
  }
  // 左侧球门线（蓝队攻此门，红队守）
  if(ball.x<WALL+ball.r){
    if(ball.y>goalTop&&ball.y<goalBot&&state==='playing'){
      // 间接任意球直接射门无效 → 球门球（不进球）
      if(ball._indirect && ball.lastTeam===TEAM_BLUE){
        showMsg('间接任意球未经过传递，进球无效！', 1500);
        placeBall('goalkick', WALL+30, FH/2, TEAM_RED);
      } else { onGoal(TEAM_BLUE); }
    } else if(canSetPiece){
      if(ball.lastTeam===TEAM_BLUE){ placeBall('goalkick', WALL+30, FH/2, TEAM_RED); }
      else { const cy = ball.y<FH/2 ? WALL+18 : FH-WALL-18; placeBall('corner', WALL+18, cy, TEAM_BLUE); }
    } else { ball.x=WALL+ball.r; ball.vx*=-0.6; }
  }
  // 右侧球门线（红队攻此门，蓝队守）
  if(ball.x>FW-WALL-ball.r){
    if(ball.y>goalTop&&ball.y<goalBot&&state==='playing'){
      if(ball._indirect && ball.lastTeam===TEAM_RED){
        showMsg('间接任意球未经过传递，进球无效！', 1500);
        placeBall('goalkick', FW-WALL-30, FH/2, TEAM_BLUE);
      } else { onGoal(TEAM_RED); }
    } else if(canSetPiece){
      if(ball.lastTeam===TEAM_RED){ placeBall('goalkick', FW-WALL-30, FH/2, TEAM_BLUE); }
      else { const cy = ball.y<FH/2 ? WALL+18 : FH-WALL-18; placeBall('corner', FW-WALL-18, cy, TEAM_RED); }
    } else { ball.x=FW-WALL-ball.r; ball.vx*=-0.6; }
  }
  let oc=null,od=1e9;
  // 空中球(z>30)无法被地面球员直接拦截，只有接近地面(z<30)才能碰
  const canHead = ball.z < 45;
  players.forEach(p=>{
    if(p.kick>0) return;
    if(!canHead && !ball.owner) return;
    const d=dist(p,ball);
    if(d<p.r+ball.r+4 && d<od){od=d;oc=p;}
  });
  if(oc){
    const p=oc;
    // 球接触到任意球员 → 清除间接任意球标记
    delete ball._indirect;
    if(Math.hypot(ball.vx,ball.vy)<8 || ball.lastTeam===p.team || ball.owner===p){
      if(offsideCheck && p.team===offsideCheck.team && players.indexOf(p)!==offsideCheck.passerIdx){
        const inOppHalf = offsideCheck.attackDir>0 ? p.x>FW/2 : p.x<FW/2;
        const pastLine = offsideCheck.attackDir>0 ? p.x>offsideCheck.lineX : p.x<offsideCheck.lineX;
        if(inOppHalf && pastLine && state==='playing'){
          callOffside(p); return;
        }
      }
      offsideCheck=null;
      const fx=p.face.x,fy=p.face.y,fl=Math.hypot(fx,fy)||1;
      const tx=p.x+fx/fl*(p.r+ball.r+2), ty=p.y+fy/fl*(p.r+ball.r+2);
      ball.x+=(tx-ball.x)*0.35; ball.y+=(ty-ball.y)*0.35;
      ball.vx=p.vx*0.9+(fx/fl)*0.5; ball.vy=p.vy*0.9+(fy/fl)*0.5;
      ball.owner=p; ball.lastTeam=p.team;
    } else { const dx=ball.x-p.x,dy=ball.y-p.y,d=Math.hypot(dx,dy)||1; ball.vx+=dx/d*1.5; ball.vy+=dy/d*1.5; ball.owner=null; }
  }
  for(let i=0;i<players.length;i++) for(let j=i+1;j<players.length;j++){
    const a=players[i],b=players[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;
    if(d<min&&d>0){const push=(min-d)/2,nx=dx/d,ny=dy/d; a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
  }
}
function onGoal(team){
  score[team]++;
  commit({ score: [score[TEAM_RED], score[TEAM_BLUE]] });
  scorer=team; state='goal'; goalTimer=2.2;
  showMsg(team===TEAM_RED?'进球！红队得分':'进球！蓝队得分',1500);
  playGoalRoar(); // 进球 → 万人呐喊
}
function endMatch(){
  state='over';
  stopCrowdAmbience(); // 比赛结束 → 停止背景噪声
  if(wc && wc._matchCallback){ const cb=wc._matchCallback; wc._matchCallback=null; cb(score); return; }
  let res,cls;
  if(score[TEAM_RED]>score[TEAM_BLUE]){res='红队获胜';cls='red';}
  else if(score[TEAM_RED]<score[TEAM_BLUE]){res='蓝队获胜';cls='blue';}
  else{res='平局';cls='draw';}
  commit({
    screen: 'match-end',
    screenData: { res, cls, red: score[TEAM_RED], blue: score[TEAM_BLUE] },
  });
}

// ====== 点球大战 ======
function startPenalty(){
  mode='penalty';
  penScore=[0,0]; penShots=[0,0]; penRound=1; penSuddenDeath=false; penResult='';
  commit({
    score: [0, 0],
    timerText: 'PEN',
    penHud: { visible: true, redScore: 0, redShots: 0, blueScore: 0, blueShots: 0 },
    debug: false,
  });
  renderPenHUD();
  beginPlayerPen();
  hideOverlay();
  if('ontouchstart' in window||navigator.maxTouchPoints>0) commit({ touch: true });
}
function beginPlayerPen(){
  penState='aim';
  penBall.x=PEN_SPOT_L.x; penBall.y=PEN_SPOT_L.y; penBall.vx=0; penBall.vy=0;
  aimY=FH/2; aimDir=Math.random()<0.5?1:-1;
  keeperX=WALL+GOAL_D;
  showMsg('你的回合：瞄准并射门',1200);
}
function lockPenShot(){
  penTargetY=aimY;
  // 门将扑救方向：随机选三区之一
  const zones=[FH/2-GOAL_H/2+30, FH/2, FH/2+GOAL_H/2-30];
  keeperDiveY=zones[Math.floor(Math.random()*3)]+rand(-10,10);
  const dx=0-PEN_SPOT_L.x, dy=penTargetY-PEN_SPOT_L.y, d=Math.hypot(dx,dy)||1, sp=10;
  penBall.vx=dx/d*sp; penBall.vy=dy/d*sp;
  penState='shoot';
}
function updatePenalty(dt){
  if(penState==='aim'){
    aimY+=aimDir*aimSpeed;
    const top=FH/2-GOAL_H/2+18, bot=FH/2+GOAL_H/2-18;
    if(aimY<top){aimY=top;aimDir=1;} if(aimY>bot){aimY=bot;aimDir=-1;}
  } else if(penState==='shoot'){
    penBall.x+=penBall.vx; penBall.y+=penBall.vy;
    if(penBall.x<=WALL+GOAL_D+6){
      const saved = Math.abs(penBall.y-keeperDiveY)<32;
      penResult = saved?'saved':'goal';
      penBall.vx=0; penBall.vy=0;
      if(!saved) penScore[TEAM_RED]++;
      penShots[TEAM_RED]++;
      commitPenHud();
      showMsg(saved?'被扑出！':'进球！',1200);
      penState='result'; penTimer=1.4;
    }
  } else if(penState==='result'){
    penTimer-=dt; if(penTimer<=0){ if(checkPenOver()) return; beginAIPen(); }
  } else if(penState==='ai-aim'){
    penTimer-=dt; if(penTimer<=0){
      // AI 选择射门点
      penTargetY=FH/2+rand(-GOAL_H/2+25,GOAL_H/2-25);
      // 玩家门将扑救
      const zones=[FH/2-GOAL_H/2+30,FH/2,FH/2+GOAL_H/2-30];
      keeperDiveY=zones[Math.floor(Math.random()*3)]+rand(-10,10);
      const dx=FW-PEN_SPOT_R.x, dy=penTargetY-PEN_SPOT_R.y, d=Math.hypot(dx,dy)||1, sp=10;
      penBall.vx=dx/d*sp; penBall.vy=dy/d*sp;
      penState='ai-shoot';
    }
  } else if(penState==='ai-shoot'){
    penBall.x+=penBall.vx; penBall.y+=penBall.vy;
    if(penBall.x>=FW-WALL-GOAL_D-6){
      const saved=Math.abs(penBall.y-keeperDiveY)<32;
      penResult=saved?'saved':'goal';
      penBall.vx=0; penBall.vy=0;
      if(!saved) penScore[TEAM_BLUE]++;
      penShots[TEAM_BLUE]++;
      commitPenHud();
      showMsg(saved?'扑出！':'失球！',1200);
      penState='ai-result'; penTimer=1.4;
    }
  } else if(penState==='ai-result'){
    penTimer-=dt; if(penTimer<=0){ if(checkPenOver()) return; penRound++; beginPlayerPen(); }
  }
}
function beginAIPen(){
  penState='ai-aim'; penTimer=0.8;
  penBall.x=PEN_SPOT_R.x; penBall.y=PEN_SPOT_R.y; penBall.vx=0; penBall.vy=0;
  keeperX=FW-WALL-GOAL_D;
  showMsg('蓝队回合',900);
}
function checkPenOver(){
  // 标准 5 轮 + 突然死亡
  const maxRound = penSuddenDeath ? penRound : 5;
  if(penRound>=5 && !penSuddenDeath){
    // 判断是否已分胜负（剩余轮次无法追平）
    const remR=5-penRound;
    // 玩家已射 penShots[0]，蓝队已射 penShots[1]
    if(Math.abs(penScore[0]-penScore[1])>remR) { endPenalty(); return true; }
    if(penShots[0]>=5 && penShots[1]>=5 && penScore[0]!==penScore[1]){ endPenalty(); return true; }
    if(penShots[0]>=5 && penShots[1]>=5){ penSuddenDeath=true; }
  }
  if(penSuddenDeath && penShots[0]>=5+ (penRound-5) && penShots[1]>=5+(penRound-5)){
    if(penScore[0]!==penScore[1]){ endPenalty(); return true; }
  }
  return false;
}
function endPenalty(){
  penState='over';
  let res,cls;
  if(penScore[0]>penScore[1]){res='红队夺冠';cls='red';}
  else if(penScore[0]<penScore[1]){res='蓝队夺冠';cls='blue';}
  else{res='平局';cls='draw';}
  commit({
    screen: 'penalty-end',
    screenData: { res, cls, red: penScore[0], blue: penScore[1] },
  });
}
function commitPenHud(){
  commit({
    penHud: {
      visible: true,
      redScore: penScore[0], redShots: penShots[0],
      blueScore: penScore[1], blueShots: penShots[1],
    },
  });
}
function renderPenHUD(){ commitPenHud(); }

// ====== 渲染 ======
function draw(){
  // 重置变换填充全屏背景，再恢复游戏坐标系
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(0,0,cv.width,cv.height);
  ctx.restore();
  drawStadium();
  drawField();
  if(mode==='match') drawPlayers();
  else drawPenalty();
  drawBallObj(mode==='penalty'?penBall:ball);
  // 定位球提示
  if(mode==='match' && setPieceTimer>0 && setPieceMsg){
    ctx.fillStyle='#ffd60a'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
    ctx.fillText(setPieceMsg, FW/2, project(0, WALL+30).sy);
  }
  if(mode==='match' && state==='paused'){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.restore();
    ctx.fillStyle='#fff'; ctx.font='bold 48px sans-serif'; ctx.textAlign='center';
    const pauseY = CAM_OFFSET_Y + FH*CAM_TILT/2;
    ctx.fillText('暂停',FW/2,pauseY); ctx.font='16px sans-serif';
    ctx.fillText('按 P 继续',FW/2,pauseY+40);
  }
  // 慢动作回放指示
  if(replayActive){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    // 画面边缘红色暗角
    const grad = ctx.createRadialGradient(cv.width/2, cv.height/2, cv.height*0.3, cv.width/2, cv.height/2, cv.height*0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(120,0,0,.35)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,cv.width,cv.height);
    // 回放文字
    ctx.fillStyle='#e63946'; ctx.font='bold 28px sans-serif'; ctx.textAlign='left';
    ctx.fillText('▶ 慢动作回放', 20, 70);
    ctx.fillStyle='#ccc'; ctx.font='14px sans-serif';
    ctx.fillText('0.22x', 20, 92);
    // 跳过按钮
    const btnW=130, btnH=44, btnX=cv.width-btnW-20, btnY=20;
    ctx.fillStyle='rgba(230,57,70,.85)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(btnX,btnY,btnW,btnH,10);
    else ctx.rect(btnX,btnY,btnW,btnH);
    ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText('跳过回放 ⏭', btnX+btnW/2, btnY+btnH/2+5);
    ctx.fillStyle='#999'; ctx.font='12px sans-serif';
    ctx.fillText('按空格/回车', btnX+btnW/2, btnY+btnH+16);
    ctx.restore();
  }
  // 任意球瞄准线（仅人类玩家）
  if(freeKick && !freeKick.isAI){
    const taker=players[freeKick.takerIdx];
    if(taker){
      const s=project(ball.x, ball.y);
      const ex=ball.x+taker.face.x*180, ey=ball.y+taker.face.y*180;
      const e=project(ex, ey);
      // 瞄准虚线
      ctx.strokeStyle='rgba(255,214,10,.6)'; ctx.lineWidth=2.5;
      ctx.setLineDash([10,8]);
      ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(e.sx, e.sy); ctx.stroke();
      ctx.setLineDash([]);
      // 箭头
      const ang=Math.atan2(e.sy-s.sy, e.sx-s.sx);
      ctx.fillStyle='rgba(255,214,10,.8)';
      ctx.beginPath();
      ctx.moveTo(e.sx, e.sy);
      ctx.lineTo(e.sx-Math.cos(ang-0.4)*14, e.sy-Math.sin(ang-0.4)*14);
      ctx.lineTo(e.sx-Math.cos(ang+0.4)*14, e.sy-Math.sin(ang+0.4)*14);
      ctx.closePath(); ctx.fill();
      // 提示文字（区分直接/间接任意球）
      ctx.fillStyle=freeKick.direct?'#ffd60a':'#64dcff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
      if(!freeKick.charging){
        if(freeKick.direct){
          ctx.fillText('【直接任意球】方向键瞄准 · 按射门蓄力 · 传球直接传出', FW/2, project(0, WALL+50).sy);
        } else {
          ctx.fillText('【间接任意球】需先传球再射门 · 建议按传球键传递', FW/2, project(0, WALL+50).sy);
        }
      } else {
        if(freeKick.direct) ctx.fillText('再按射门射门！(直接任意球可直接得分)', FW/2, project(0, WALL+50).sy);
        else ctx.fillText('再按射门踢出！(间接任意球直接射门无效)', FW/2, project(0, WALL+50).sy);
      }
    }
    // 力量条
    if(freeKick.charging){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      const bx=cv.width/2-120, by=cv.height-70, bw=240, bh=18;
      // 背景
      ctx.fillStyle='rgba(0,0,0,.7)';
      ctx.fillRect(bx-3, by-3, bw+6, bh+6);
      // 力量填充（绿→黄→红）
      const pct=freeKick.power/100;
      const r=pct<0.5?255*pct*2:255;
      const g=pct<0.5?255:255*(1-(pct-0.5)*2);
      ctx.fillStyle=`rgb(${Math.floor(r)},${Math.floor(g)},0)`;
      ctx.fillRect(bx, by, bw*pct, bh);
      // 刻度线
      ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=1;
      for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(bx+bw*i/4,by); ctx.lineTo(bx+bw*i/4,by+bh); ctx.stroke(); }
      // 文字
      ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
      ctx.fillText(`力量 ${Math.floor(freeKick.power)}%`, cv.width/2, by-6);
      ctx.restore();
    }
  }
  // ====== 球门球开大脚 UI ======
  if(goalKick && !goalKick.isAI){
    const taker=players[goalKick.takerIdx];
    if(taker){
      const s=project(ball.x, ball.y);
      // 瞄准方向线（显示高抛弧线）
      const ex=ball.x+taker.face.x*380, ey=ball.y+taker.face.y*180;
      const e=project(ex, ey);
      // 弧线轨迹预览（3段贝塞尔效果近似）
      ctx.strokeStyle='rgba(100,220,255,.55)'; ctx.lineWidth=2.5;
      ctx.setLineDash([9,7]);
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      const midX=(s.sx+e.sx)/2, midY=Math.min(s.sy,e.sy)-90; // 向上拱起模拟高抛
      ctx.quadraticCurveTo(midX, midY, e.sx, e.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      // 落点标记
      ctx.fillStyle='rgba(100,220,255,.8)';
      ctx.beginPath(); ctx.arc(e.sx, e.sy, 7, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(e.sx, e.sy, 7, 0, Math.PI*2); ctx.stroke();
      // 提示文字
      ctx.fillStyle='#64dcff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
      if(!goalKick.charging){
        ctx.fillText('球门球：方向键瞄准 · 射门键蓄力开大脚 · 传球键短传', FW/2, project(0, WALL+50).sy);
      } else {
        ctx.fillText('再按射门键开大脚！', FW/2, project(0, WALL+50).sy);
      }
    }
    // 球门球力量条
    if(goalKick.charging){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      const bx=cv.width/2-120, by=cv.height-70, bw=240, bh=18;
      // 背景
      ctx.fillStyle='rgba(0,0,0,.7)';
      ctx.fillRect(bx-3, by-3, bw+6, bh+6);
      // 力量填充（青→蓝→紫，开大脚颜色）
      const pct=goalKick.power/100;
      const r=Math.floor(pct*140);
      const g=Math.floor(200-pct*60);
      const b=Math.floor(255);
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillRect(bx, by, bw*pct, bh);
      // 刻度线
      ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=1;
      for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(bx+bw*i/4,by); ctx.lineTo(bx+bw*i/4,by+bh); ctx.stroke(); }
      // 文字
      ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
      ctx.fillText(`开球力量 ${Math.floor(goalKick.power)}%`, cv.width/2, by-6);
      ctx.restore();
    }
  }
  // ====== 长传瞄准 UI：虚线弧线轨迹 + 落点准星 ======
  if(longPassAim){
    const ap=players[activeIdx];
    if(ap){
      const s=project(ball.x, ball.y);
      const e=project(longPassAim.tx, longPassAim.ty);
      // —— 虚线弧线轨迹预览 ——
      ctx.strokeStyle='rgba(100,220,255,.7)'; ctx.lineWidth=3;
      ctx.setLineDash([12,8]);
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      const arcH = Math.min(110, Math.hypot(longPassAim.tx-ball.x, longPassAim.ty-ball.y)*0.22);
      const midX=(s.sx+e.sx)/2, midY=Math.min(s.sy,e.sy)-arcH;
      ctx.quadraticCurveTo(midX, midY, e.sx, e.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      // —— 落点准星 ——
      ctx.fillStyle='rgba(100,220,255,.9)';
      ctx.beginPath(); ctx.arc(e.sx, e.sy, 8, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(e.sx, e.sy, 8, 0, Math.PI*2); ctx.stroke();
      // 准星十字
      ctx.beginPath();
      ctx.moveTo(e.sx-14, e.sy); ctx.lineTo(e.sx-10, e.sy);
      ctx.moveTo(e.sx+10, e.sy); ctx.lineTo(e.sx+14, e.sy);
      ctx.moveTo(e.sx, e.sy-14); ctx.lineTo(e.sx, e.sy-10);
      ctx.moveTo(e.sx, e.sy+10); ctx.lineTo(e.sx, e.sy+14);
      ctx.stroke();
      // 距离标注
      const passDist=Math.hypot(longPassAim.tx-ball.x, longPassAim.ty-ball.y);
      ctx.fillStyle='#64dcff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
      ctx.fillText(Math.round(passDist/10)+'m', e.sx, e.sy-18);
      // 提示文字
      ctx.fillStyle='#64dcff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
      ctx.fillText('长传瞄准：方向键调节落点 · 再按 Q/长传 或 空格 确认 · 传球键取消', FW/2, project(0, WALL+50).sy);
    }
  }
}
function fillTrap(tl, tr, br, bl, style){
  ctx.fillStyle=style;
  ctx.beginPath();
  ctx.moveTo(tl.sx,tl.sy); ctx.lineTo(tr.sx,tr.sy); ctx.lineTo(br.sx,br.sy); ctx.lineTo(bl.sx,bl.sy);
  ctx.closePath(); ctx.fill();
}
// ====== 体育场环境：多层看台 + 逼真观众 + LED电子广告牌 + 摄像机 + 替补席 ======
// —— 多层看台参数 ——
const TIER_COUNT = 2;
const TIER_CONFIG = {
  far:  { rows:[6,5], rowH:[13,11], yStart:-1, yDir:-1, stepH:[13,11], crowdPerRow:[58,48] },
  near: { rows:[6,5], rowH:[13,11], yStart:FH-1, yDir:1, stepH:[13,11], crowdPerRow:[58,48] },
  left: { rows:[4,4], rowH:[14,12], yStart:-4, yDir:-1, xStart:-5, xDir:-1, stepW:[14,12], crowdPerRow:[55,45] },
  right:{ rows:[4,4], rowH:[14,12], yStart:-4, yDir:-1, xStart:FW+5, xDir:1, stepW:[14,12], crowdPerRow:[55,45] },
};

let stadiumCrowd = null;
function initStadiumCrowd(){
  const arr = [];
  const homeColor = '#dc052d', awayColor = '#ffffff';
  const crowdColors = [homeColor, homeColor, homeColor, awayColor, awayColor, '#e60000','#ff1a33','#b80020','#ffffff','#ff2d4a','#ff4460','#cc0000','#ff5555','#f0f0f0','#ff6b6b','#c0392b','#e74c3c'];
  const skinColors = ['#f0c0a0','#d4a373','#e8b894','#c89270','#ba8766','#ffdead','#cd9358','#ffe0bd','#e0a880','#f5d0b0'];
  const hairColors = ['#1a1a1a','#3a1a0a','#d4a340','#4a4a4a','#222','#8B4513','#5a3a1a','#0a0a0a','#6b3a1a','#c4a040'];
  const pantsColors = ['#1a1a2a','#2a2a3a','#1a2a1a','#3a2a1a','#222233','#1a1a1a','#2a2a2a','#1a2a2a','#252535','#121220'];
  const hatColors = ['#1a1a1a','#dc052d','#3a86ff','#222','#555','#a01818','#1a4a99','#333','#ffd60a','#444'];

  // 远端看台（2层）
  const farCumulDepths = [0, TIER_CONFIG.far.rows[0]*TIER_CONFIG.far.stepH[0]];
  for(let tier=0; tier<TIER_COUNT; tier++){
    const rows = TIER_CONFIG.far.rows[tier];
    const rowH = TIER_CONFIG.far.rowH[tier];
    const yOffset = farCumulDepths[tier];
    // 主场色占比随层变化
    const homeBias = tier===0 ? 0.65 : 0.50;
    for(let r=0; r<rows; r++){
      const y = TIER_CONFIG.far.yStart - yOffset + r*rowH*TIER_CONFIG.far.yDir;
      const density = TIER_CONFIG.far.crowdPerRow[tier] + Math.floor(r*1.5);
      const sectionColor = r<rows/2 ? homeColor : crowdColors[Math.floor(Math.random()*crowdColors.length)];
      for(let i=0; i<density; i++){
        const x = 4 + (i/(density-1))*(FW-8) + (Math.random()-0.5)*5;
        arr.push({
          x, y, tier,
          shirt: Math.random()<homeBias ? sectionColor : crowdColors[Math.floor(Math.random()*crowdColors.length)],
          skin: skinColors[Math.floor(Math.random()*skinColors.length)],
          h: 12 + Math.random()*5 + tier*1.5,
          w: 7 + Math.random()*3.5,
          jitter: Math.random()*Math.PI*2,
          clap: Math.random()<0.10,
          stand: Math.random()<0.04,
          hasScarf: Math.random()<0.12,
          hatType: Math.random()<0.06 ? (Math.random()<0.5 ? 'cap' : 'beanie') : null,
          hatColor: hatColors[Math.floor(Math.random()*hatColors.length)],
          // 新增动作属性
          action: pickAction(),
          actionFreq: 2.5 + Math.random()*4,
          actionPhase: Math.random()*Math.PI*2,
          actionAmp: 0.3 + Math.random()*0.7,
        });
      }
    }
  }
  // 近端看台（2层）
  const nearCumulDepths = [0, TIER_CONFIG.near.rows[0]*TIER_CONFIG.near.stepH[0]];
  for(let tier=0; tier<TIER_COUNT; tier++){
    const rows = TIER_CONFIG.near.rows[tier];
    const rowH = TIER_CONFIG.near.rowH[tier];
    const yOffset = nearCumulDepths[tier];
    const homeBias = tier===0 ? 0.65 : 0.50;
    for(let r=0; r<rows; r++){
      const y = TIER_CONFIG.near.yStart + yOffset + r*rowH;
      const density = TIER_CONFIG.near.crowdPerRow[tier] + Math.floor(r*1.2);
      const sectionColor = tier===0 ? homeColor : crowdColors[Math.floor(Math.random()*crowdColors.length)];
      for(let i=0; i<density; i++){
        const x = 4 + (i/(density-1))*(FW-8) + (Math.random()-0.5)*5;
        arr.push({
          x, y, tier: tier+2,
          shirt: Math.random()<homeBias ? sectionColor : crowdColors[Math.floor(Math.random()*crowdColors.length)],
          skin: skinColors[Math.floor(Math.random()*skinColors.length)],
          h: 12 + Math.random()*4.5 + tier*1.4,
          w: 8 + Math.random()*3.5,
          jitter: Math.random()*Math.PI*2,
          clap: Math.random()<0.12,
          stand: Math.random()<0.05,
          hasScarf: Math.random()<0.14,
          hatType: Math.random()<0.08 ? (Math.random()<0.5 ? 'cap' : 'beanie') : null,
          hatColor: hatColors[Math.floor(Math.random()*hatColors.length)],
          action: pickAction(),
          actionFreq: 2.5 + Math.random()*4,
          actionPhase: Math.random()*Math.PI*2,
          actionAmp: 0.3 + Math.random()*0.7,
        });
      }
    }
  }
  // 左侧看台（2层，纵向排列）
  const leftCumulDepths = [0, TIER_CONFIG.left.rows[0]*TIER_CONFIG.left.stepW[0]];
  for(let tier=0; tier<TIER_COUNT; tier++){
    const rows = TIER_CONFIG.left.rows[tier];
    const rowH = TIER_CONFIG.left.rowH[tier];
    const xBase = TIER_CONFIG.left.xStart - leftCumulDepths[tier];
    for(let r=0; r<rows; r++){
      const x = xBase + r*rowH*TIER_CONFIG.left.xDir;
      const density = TIER_CONFIG.left.crowdPerRow[tier];
      for(let i=0; i<density; i++){
        const y = 15 + (i/(density-1))*(FH-30) + (Math.random()-0.5)*6;
        arr.push({
          x, y, tier: tier+4,
          shirt: crowdColors[Math.floor(Math.random()*crowdColors.length)],
          skin: skinColors[Math.floor(Math.random()*skinColors.length)],
          h: 9.5 + Math.random()*5 + tier*1.2,
          w: 6.5 + Math.random()*3.5,
          jitter: Math.random()*Math.PI*2,
          clap: Math.random()<0.07,
          stand: Math.random()<0.03,
          hasScarf: Math.random()<0.05,
          hatType: Math.random()<0.04 ? (Math.random()<0.5 ? 'cap' : 'beanie') : null,
          hatColor: hatColors[Math.floor(Math.random()*hatColors.length)],
          action: pickAction(),
          actionFreq: 2 + Math.random()*3.5,
          actionPhase: Math.random()*Math.PI*2,
          actionAmp: 0.25 + Math.random()*0.6,
        });
      }
    }
  }
  // 右侧看台（2层，纵向排列）
  for(let tier=0; tier<TIER_COUNT; tier++){
    const rows = TIER_CONFIG.right.rows[tier];
    const rowH = TIER_CONFIG.right.rowH[tier];
    const xBase = TIER_CONFIG.right.xStart + leftCumulDepths[tier];
    for(let r=0; r<rows; r++){
      const x = xBase + r*rowH;
      const density = TIER_CONFIG.right.crowdPerRow[tier];
      for(let i=0; i<density; i++){
        const y = 15 + (i/(density-1))*(FH-30) + (Math.random()-0.5)*6;
        arr.push({
          x, y, tier: tier+6,
          shirt: crowdColors[Math.floor(Math.random()*crowdColors.length)],
          skin: skinColors[Math.floor(Math.random()*skinColors.length)],
          h: 9.5 + Math.random()*5 + tier*1.2,
          w: 6.5 + Math.random()*3.5,
          jitter: Math.random()*Math.PI*2,
          clap: Math.random()<0.07,
          stand: Math.random()<0.03,
          hasScarf: Math.random()<0.05,
          hatType: Math.random()<0.04 ? (Math.random()<0.5 ? 'cap' : 'beanie') : null,
          hatColor: hatColors[Math.floor(Math.random()*hatColors.length)],
          action: pickAction(),
          actionFreq: 2 + Math.random()*3.5,
          actionPhase: Math.random()*Math.PI*2,
          actionAmp: 0.25 + Math.random()*0.6,
        });
      }
    }
  }
  // 增强属性：旗帜、头发、裤子
  const flagColorsHome = ['#e63946','#e63946','#e63946','#ffd60a','#ffffff'];
  const flagColorsAway = ['#3a86ff','#3a86ff','#3a86ff','#ffd60a','#ffffff'];
  arr.forEach(c=>{
    c.h *= 1.15;
    const isHomeSection = c.tier < 4;
    const flagPool = isHomeSection ? flagColorsHome : flagColorsAway;
    const flagChance = (c.tier>=2 && c.tier<4) ? 0.10 : 0.04;
    c.hasFlag = Math.random() < flagChance;
    c.flagColor = flagPool[Math.floor(Math.random()*flagPool.length)];
    c.flagPhase = Math.random()*Math.PI*2;
    c.flagSide = Math.random()<0.5 ? -1 : 1;
    c.hair = hairColors[Math.floor(Math.random()*hairColors.length)];
    c.pants = pantsColors[Math.floor(Math.random()*pantsColors.length)];
    // 帽子 40% 不给头发
    c.hasHat = c.hatType && Math.random()<0.6;
  });
  stadiumCrowd = arr;
}

function pickAction(){
  const r = Math.random();
  if(r<0.45) return 'idle';       // 自然下垂
  if(r<0.70) return 'wave';       // 挥手
  if(r<0.85) return 'clap';       // 鼓掌
  return 'bothArms';              // 双手高举
}

// —— LED电子广告牌 ——
const AD_LED_TEXTS = [
  'GOLEOBO', 'SPORT+ LIVE', 'UEFA CHAMPIONS', 'FAIR PLAY', 'GOAL!!!',
  'WORLD CUP 2026', 'PRO LEAGUE', 'DREAM TEAM', 'VICTORY', 'SOCCER LIVE',
  'PREMIER LEAGUE', 'CHAMPIONS LEAGUE', 'FOOTBALL', 'STAR PLAYERS', 'ELITE SPORT'
];
const AD_LED_COLORS = ['#ff3333','#33ff33','#3399ff','#ffcc00','#ff66cc','#00ffcc','#ff6600','#cc33ff'];
let adData = null;
function initAds(){
  adData = [];
  const countPerSide = 12;
  // 远端（上方）
  for(let i=0; i<countPerSide; i++){
    const w = FW/countPerSide;
    adData.push({
      x: i*w+w/2, y: -24, w: w*0.9, h: 16,
      text: AD_LED_TEXTS[(i+Math.floor(Math.random()*AD_LED_TEXTS.length))%AD_LED_TEXTS.length],
      bg: AD_LED_COLORS[i%AD_LED_COLORS.length],
      side:'far', index:i, glowColor: AD_LED_COLORS[i%AD_LED_COLORS.length],
    });
  }
  // 近端（下方）
  for(let i=0; i<countPerSide; i++){
    const w = FW/countPerSide;
    adData.push({
      x: i*w+w/2, y: FH+16, w: w*0.9, h: 16,
      text: AD_LED_TEXTS[(i+5)%AD_LED_TEXTS.length],
      bg: AD_LED_COLORS[(i+3)%AD_LED_COLORS.length],
      side:'near', index:i, glowColor: AD_LED_COLORS[(i+3)%AD_LED_COLORS.length],
    });
  }
  // 左侧纵向
  const leftCount = 8;
  for(let i=0; i<leftCount; i++){
    const hh = FH/leftCount;
    adData.push({
      x: -24, y: i*hh+hh/2, w: 16, h: hh*0.85,
      text: AD_LED_TEXTS[(i+8)%AD_LED_TEXTS.length],
      bg: AD_LED_COLORS[(i+6)%AD_LED_COLORS.length],
      side:'left', index:i, glowColor: AD_LED_COLORS[(i+6)%AD_LED_COLORS.length],
    });
  }
  // 右侧纵向
  for(let i=0; i<leftCount; i++){
    const hh = FH/leftCount;
    adData.push({
      x: FW+24, y: i*hh+hh/2, w: 16, h: hh*0.85,
      text: AD_LED_TEXTS[(i+12)%AD_LED_TEXTS.length],
      bg: AD_LED_COLORS[(i+1)%AD_LED_COLORS.length],
      side:'right', index:i, glowColor: AD_LED_COLORS[(i+1)%AD_LED_COLORS.length],
    });
  }
}

// —— 主渲染函数 ——
function drawStadium(){
  if(!stadiumCrowd) initStadiumCrowd();
  if(!adData) initAds();
  const t = performance.now()/1000;

  // ========== 第一阶段：看台建筑结构 ==========

  // --- 远端两层看台 ---
  const farBaseY = TIER_CONFIG.far.yStart;
  const farTierDepth = [0, TIER_CONFIG.far.rows[0]*TIER_CONFIG.far.stepH[0]];
  for(let tier=TIER_COUNT-1; tier>=0; tier--){
    const rows = TIER_CONFIG.far.rows[tier];
    const stepH = TIER_CONFIG.far.stepH[tier];
    const yStart = farBaseY - farTierDepth[tier];
    for(let r=rows-1; r>=0; r--){
      const y0 = yStart + r*stepH*(-1);
      const y1 = yStart + (r+1)*stepH*(-1);
      const shade = 16 + tier*10 + r*3;
      const tl=project(-50, y1), tr=project(FW+50, y1);
      const bl=project(-50, y0), br=project(FW+50, y0);
      fillTrap(tl,tr,br,bl, `rgb(${shade},${shade+3},${shade+14})`);
    }
    // 层间分隔栏杆
    const rY = yStart + rows*stepH*(-1);
    const rtl=project(-48,rY), rtr=project(FW+48,rY);
    const rbl=project(-48,rY-2), rbr=project(FW+48,rY-2);
    fillTrap(rtl,rtr,rbr,rbl, '#4a4a5a');
    // 看台后墙
    if(tier===TIER_COUNT-1){
      const wY = yStart;
      const wtl=project(-50,wY), wtr=project(FW+50,wY);
      const wbl=project(-50,wY-12), wbr=project(FW+50,wY-12);
      fillTrap(wtl,wtr,wbr,wbl, '#252535');
    }
  }

  // --- 近端两层看台 ---
  const nearBaseY = TIER_CONFIG.near.yStart;
  const nearTierDepth = [0, TIER_CONFIG.near.rows[0]*TIER_CONFIG.near.stepH[0]];
  for(let tier=TIER_COUNT-1; tier>=0; tier--){
    const rows = TIER_CONFIG.near.rows[tier];
    const stepH = TIER_CONFIG.near.stepH[tier];
    const yStart = nearBaseY + nearTierDepth[tier];
    for(let r=rows-1; r>=0; r--){
      const y0 = yStart + r*stepH;
      const y1 = yStart + (r+1)*stepH;
      const shade = 14 + tier*8 + r*4;
      const tl=project(-50, y0), tr=project(FW+50, y0);
      const bl=project(-50, y1), br=project(FW+50, y1);
      fillTrap(tl,tr,br,bl, `rgb(${shade},${shade+2},${shade+10})`);
    }
    const rY = yStart + rows*stepH;
    const rtl=project(-48,rY), rtr=project(FW+48,rY);
    const rbl=project(-48,rY+2), rbr=project(FW+48,rY+2);
    fillTrap(rtl,rtr,rbr,rbl, '#4a4a5a');
  }

  // --- 左侧多层看台 ---
  const leftTierDepth = [0, TIER_CONFIG.left.rows[0]*TIER_CONFIG.left.stepW[0]];
  for(let tier=TIER_COUNT-1; tier>=0; tier--){
    const xStart = TIER_CONFIG.left.xStart - leftTierDepth[tier];
    const rows = TIER_CONFIG.left.rows[tier];
    const stepW = TIER_CONFIG.left.stepW[tier];
    for(let r=rows-1; r>=0; r--){
      const x0 = xStart + r*stepW*(-1);
      const x1 = xStart + (r+1)*stepW*(-1);
      const shade = 10 + tier*6 + r*2;
      const tl=project(x1, -50), tr=project(x0, -50);
      const bl=project(x1, FH+50), br=project(x0, FH+50);
      fillTrap(tl,tr,br,bl, `rgb(${shade},${shade+3},${shade+12})`);
    }
    const rx = xStart + rows*stepW*(-1);
    const rtl=project(rx,-48), rtr=project(rx+2,-48);
    const rbl=project(rx,FH+48), rbr=project(rx+2,FH+48);
    fillTrap(rtl,rtr,rbr,rbl, '#4a4a5a');
  }

  // --- 右侧多层看台 ---
  for(let tier=TIER_COUNT-1; tier>=0; tier--){
    const xStart = TIER_CONFIG.right.xStart + leftTierDepth[tier];
    const rows = TIER_CONFIG.right.rows[tier];
    const stepW = TIER_CONFIG.right.stepW[tier];
    for(let r=rows-1; r>=0; r--){
      const x0 = xStart + r*stepW;
      const x1 = xStart + (r+1)*stepW;
      const shade = 10 + tier*6 + r*2;
      const tl=project(x0, -50), tr=project(x1, -50);
      const bl=project(x0, FH+50), br=project(x1, FH+50);
      fillTrap(tl,tr,br,bl, `rgb(${shade},${shade+3},${shade+12})`);
    }
    const rx = xStart + rows*stepW;
    const rtl=project(rx-2,-48), rtr=project(rx,-48);
    const rbl=project(rx-2,FH+48), rbr=project(rx,FH+48);
    fillTrap(rtl,rtr,rbr,rbl, '#4a4a5a');
  }

  // --- 角落连接（四角看台融合） ---
  const corners = [
    {x:-50,y:-50,xw:20,yw:20}, // 左上
    {x:FW+30,y:-50,xw:20,yw:20}, // 右上
    {x:-50,y:FH+30,xw:20,yw:20}, // 左下
    {x:FW+30,y:FH+30,xw:20,yw:20}, // 右下
  ];
  corners.forEach(c=>{
    const tl=project(c.x, c.y), tr=project(c.x+c.xw, c.y);
    const bl=project(c.x, c.y+c.yw), br=project(c.x+c.xw, c.y+c.yw);
    fillTrap(tl,tr,br,bl, '#1a1a28');
  });

  // ========== 第二阶段：LED电子广告牌（带发光效果） ==========
  const ledGlow = 0.6 + Math.sin(t*2.5)*0.3;
  adData.forEach(ad=>{
    const isHorizontal = ad.side==='far' || ad.side==='near';
    let tl, tr, bl, br;
    if(isHorizontal){
      tl=project(ad.x-ad.w/2, ad.y-ad.h, 6);
      tr=project(ad.x+ad.w/2, ad.y-ad.h, 6);
      bl=project(ad.x-ad.w/2, ad.y, 0);
      br=project(ad.x+ad.w/2, ad.y, 0);
    } else {
      tl=project(ad.x-ad.w, ad.y-ad.h/2, 6);
      tr=project(ad.x, ad.y-ad.h/2, 6);
      bl=project(ad.x-ad.w, ad.y+ad.h/2, 0);
      br=project(ad.x, ad.y+ad.h/2, 0);
    }
    // 发光背景
    ctx.save();
    try{ctx.shadowColor=ad.glowColor;ctx.shadowBlur=12*ledGlow*(tl.dscale||0.85);}catch(e){}
    // 面板底色
    fillTrap(tl,tr,br,bl, '#111');
    // LED 网格纹理（像素点阵感）
    const mid = isHorizontal ? project(ad.x, ad.y-ad.h*0.5, 4) : project(ad.x-ad.w*0.5, ad.y, 4);
    const midDS = mid.dscale||0.85;
    ctx.restore();
    // 底色面板
    fillTrap(tl,tr,br,bl, ad.bg);
    // 发光边框
    ctx.strokeStyle = ad.glowColor;
    ctx.lineWidth = 2*midDS;
    ctx.save();
    try{ctx.shadowColor=ad.glowColor;ctx.shadowBlur=8*ledGlow*midDS;}catch(e){}
    ctx.beginPath();
    ctx.moveTo(tl.sx,tl.sy); ctx.lineTo(tr.sx,tr.sy);
    ctx.lineTo(br.sx,br.sy); ctx.lineTo(bl.sx,bl.sy);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    // 文字（LED点阵风格）
    ctx.fillStyle = '#fff';
    const fs = Math.max(5, (isHorizontal?11:8)*midDS);
    ctx.font = `bold ${fs}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 文字发光
    ctx.save();
    try{ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=4*ledGlow*midDS;}catch(e){}
    ctx.fillText(ad.text, mid.sx, mid.sy);
    ctx.restore();
    // 底部LED小灯珠装饰
    const dotCount = isHorizontal ? 6 : 4;
    for(let d=0; d<dotCount; d++){
      const frac = (d+0.5)/dotCount;
      const dx = isHorizontal ? tl.sx+(tr.sx-tl.sx)*frac : tl.sx+(tr.sx-tl.sx)*0.5;
      const dy = isHorizontal ? bl.sy+(br.sy-bl.sy)*0.85 : tl.sy+(bl.sy-tl.sy)*frac;
      const dotOn = Math.sin(t*8+d*1.7)>0;
      ctx.fillStyle = dotOn ? ad.glowColor : '#333';
      ctx.beginPath(); ctx.arc(dx, dy, 2*midDS, 0, Math.PI*2); ctx.fill();
    }
  });

  // ========== 第三阶段：观众人群（分级渲染 + 人浪 + 动作动画） ==========
  // 人浪参数（墨西哥波浪 wave）
  const wavePeriod = 7.2;          // 完整周期（秒），从左到右
  const waveWidth = 95;            // 波浪半峰宽（世界坐标）
  const waveAmplitude = 0.28;      // 起立高度倍率
  const wavePhase = (t % wavePeriod) / wavePeriod; // 0→1 循环
  // 进球后额外触发的加速人浪
  const boosted = (typeof goalTimer!=='undefined' && goalTimer>0 && goalTimer<2.0);

  // 按深度排序（远的先画）
  const sorted = [...stadiumCrowd].sort((a,b)=>a.y - b.y);
  sorted.forEach(c=>{
    const pos = project(c.x, c.y);
    const ds = pos.dscale;
    // 性能优化：极远处跳过
    if(ds<0.12) return;

    // === 人浪计算 ===
    // 波浪沿 x 从左到右传播：以世界坐标 x 为准
    const waveCenter = wavePhase * FW;
    let inWave = 0;
    if(!boosted){
      const dx = c.x - waveCenter;
      // 处理循环边界
      const dxWrapped = Math.min(Math.abs(dx), Math.abs(dx - FW), Math.abs(dx + FW));
      if(dxWrapped < waveWidth){
        inWave = Math.max(0, 1 - dxWrapped/waveWidth) * (0.5 + 0.5*Math.cos(dxWrapped/waveWidth*Math.PI));
      }
    } else {
      // 进球后：全场随机爆发
      const cx = c.x + c.jitter*120;
      const bx = ((cx / FW) * wavePeriod + t*3.5) % wavePeriod;
      inWave = Math.max(0, Math.sin(bx/wavePeriod*Math.PI*2)*0.5+0.5);
      if(inWave<0.3) inWave=0;
    }
    // 人浪使人物升高（起立举臂）
    const waveRise = inWave * waveAmplitude * c.h * ds;
    // 正常微动
    const idleBob = Math.sin(t*2.2 + c.jitter)*0.9;

    const bodyW = c.w*ds, bodyH = c.h*ds;
    const px = pos.sx, py = pos.sy + idleBob - waveRise;
    ctx.globalAlpha = Math.min(1, 0.40 + ds*0.60);

    // 动作动画强度（用于手臂动画）
    const actStrength = Math.abs(Math.sin(t*c.actionFreq + c.actionPhase)) * c.actionAmp;

    if(ds<0.35){
      // ===== 远景简化：色块躯干 + 圆头 + 单臂 =====
      // 双腿
      ctx.fillStyle = c.pants;
      const lLegX = px-bodyW*0.18, rLegX = px+bodyW*0.04;
      ctx.fillRect(lLegX, py-bodyH*0.40, bodyW*0.15, bodyH*0.40);
      ctx.fillRect(rLegX, py-bodyH*0.40, bodyW*0.15, bodyH*0.40);
      // 躯干（球衣梯形）
      ctx.fillStyle = c.shirt;
      ctx.beginPath();
      ctx.moveTo(px-bodyW*0.28, py-bodyH*0.40);
      ctx.lineTo(px+bodyW*0.28, py-bodyH*0.40);
      ctx.lineTo(px+bodyW*0.20, py-bodyH*0.76);
      ctx.lineTo(px-bodyW*0.20, py-bodyH*0.76);
      ctx.closePath(); ctx.fill();
      // 头
      ctx.fillStyle = c.skin;
      ctx.beginPath();ctx.arc(px, py-bodyH*0.86, bodyW*0.22, 0, Math.PI*2);ctx.fill();
      // 头发
      if(!c.hasHat){
        ctx.fillStyle = c.hair;
        ctx.beginPath();
        ctx.arc(px, py-bodyH*0.86-bodyW*0.04, bodyW*0.20, Math.PI*0.88, Math.PI*2.12);
        ctx.fill();
      }
      // 帽子
      if(c.hasHat && c.hatType==='cap'){
        ctx.fillStyle = c.hatColor;
        ctx.beginPath();
        ctx.ellipse(px, py-bodyH*0.86-bodyW*0.06, bodyW*0.24, bodyW*0.06, 0, Math.PI, Math.PI*2);
        ctx.fill();
      }
      // 手臂动作
      if((c.action==='wave'||c.action==='bothArms') || inWave>0.5){
        const armRaise = Math.max(actStrength, inWave);
        ctx.strokeStyle=c.skin;ctx.lineWidth=bodyW*0.10;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(px+bodyW*0.16,py-bodyH*0.70);
        ctx.lineTo(px+bodyW*0.30,py-bodyH*0.92-armRaise*bodyH*0.12);ctx.stroke();
        if(c.action==='bothArms' || inWave>0.7){
          ctx.beginPath();ctx.moveTo(px-bodyW*0.16,py-bodyH*0.70);
          ctx.lineTo(px-bodyW*0.30,py-bodyH*0.92-armRaise*bodyH*0.12);ctx.stroke();
        }
      }
      // 远处旗帜
      if(c.hasFlag && ds>0.20){
        const fp = px + c.flagSide*bodyW*0.32;
        ctx.strokeStyle='#8B6914';ctx.lineWidth=bodyW*0.05;
        ctx.beginPath();ctx.moveTo(fp,py-bodyH*0.70);ctx.lineTo(fp,py-bodyH*1.50);ctx.stroke();
        const fw=bodyW*0.8, fh=bodyW*0.55;
        ctx.fillStyle=c.flagColor;
        ctx.beginPath();
        ctx.moveTo(fp,py-bodyH*1.50);
        ctx.lineTo(fp+c.flagSide*fw,py-bodyH*1.43+Math.sin(t*4+c.flagPhase)*fh*0.12);
        ctx.lineTo(fp+c.flagSide*fw,py-bodyH*1.43-fh+Math.sin(t*4+c.flagPhase)*fh*0.12);
        ctx.lineTo(fp,py-bodyH*1.50-fh);
        ctx.closePath();ctx.fill();
      }
    } else {
      // ===== 近景精细：双腿 + 躯干 + 头/发/帽 + 眼睛 + 双臂动作 + 围巾 + 旗帜 =====
      const headR = bodyH*0.072;
      const headCY = py-bodyH*0.87;
      const neckTop = py-bodyH*0.80;
      const shoulderY = py-bodyH*0.76;
      const waistY = py-bodyH*0.47;
      const hipY = py-bodyH*0.43;
      const legBottomY = py;
      const shoulderW = bodyW*0.48;
      const waistW = bodyW*0.36;

      // 双腿（裤）
      ctx.fillStyle = c.pants;
      ctx.beginPath();
      ctx.moveTo(px-bodyW*0.15, hipY);
      ctx.lineTo(px-bodyW*0.02, hipY);
      ctx.lineTo(px-bodyW*0.05, legBottomY);
      ctx.lineTo(px-bodyW*0.19, legBottomY);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px+bodyW*0.02, hipY);
      ctx.lineTo(px+bodyW*0.15, hipY);
      ctx.lineTo(px+bodyW*0.19, legBottomY);
      ctx.lineTo(px+bodyW*0.05, legBottomY);
      ctx.closePath(); ctx.fill();
      // 鞋
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(px-bodyW*0.20, legBottomY-bodyH*0.03, bodyW*0.16, bodyH*0.035);
      ctx.fillRect(px+bodyW*0.04, legBottomY-bodyH*0.03, bodyW*0.16, bodyH*0.035);

      // 躯干（球衣）—— 肩宽腰窄梯形
      ctx.fillStyle = c.shirt;
      ctx.beginPath();
      ctx.moveTo(px-shoulderW, shoulderY);
      ctx.lineTo(px+shoulderW, shoulderY);
      ctx.lineTo(px+waistW, waistY);
      ctx.lineTo(px-waistW, waistY);
      ctx.closePath(); ctx.fill();
      // 球衣号码/条纹暗示
      if(ds>0.55){
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(px-bodyW*0.04, shoulderY, bodyW*0.08, waistY-shoulderY);
      }
      // 领口
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      ctx.ellipse(px, shoulderY+bodyH*0.01, bodyW*0.11, bodyH*0.02, 0, 0, Math.PI*2);
      ctx.fill();
      // 颈
      ctx.fillStyle = c.skin;
      ctx.fillRect(px-bodyW*0.06, neckTop, bodyW*0.12, shoulderY-neckTop+1);

      // 头
      ctx.fillStyle = c.skin;
      ctx.beginPath();ctx.arc(px, headCY, headR, 0, Math.PI*2);ctx.fill();
      // 头发
      if(!c.hasHat){
        ctx.fillStyle = c.hair;
        ctx.beginPath();
        ctx.arc(px, headCY-headR*0.22, headR*0.92, Math.PI*0.88, Math.PI*2.12);
        ctx.fill();
      }
      // 帽子
      if(c.hasHat){
        if(c.hatType==='cap'){
          // 鸭舌帽：帽檐 + 帽冠
          ctx.fillStyle = c.hatColor;
          ctx.beginPath();
          ctx.ellipse(px, headCY-headR*0.55, headR*1.05, headR*0.32, 0, Math.PI, Math.PI*2);
          ctx.fill();
          // 帽檐
          ctx.fillStyle = c.hatColor;
          ctx.beginPath();
          ctx.moveTo(px-headR*0.9, headCY-headR*0.55);
          ctx.quadraticCurveTo(px+headR*0.4, headCY-headR*0.35, px+headR*0.9, headCY-headR*0.45);
          ctx.lineTo(px+headR*0.7, headCY-headR*0.60);
          ctx.quadraticCurveTo(px, headCY-headR*0.55, px-headR*0.7, headCY-headR*0.60);
          ctx.closePath(); ctx.fill();
        } else {
          // 毛线帽（beanie）：紧贴头部的半圆
          ctx.fillStyle = c.hatColor;
          ctx.beginPath();
          ctx.arc(px, headCY-headR*0.2, headR*0.88, Math.PI*0.92, Math.PI*2.08);
          ctx.fill();
          // 顶部小球
          ctx.beginPath();
          ctx.arc(px, headCY-headR*1.02, headR*0.18, 0, Math.PI*2);
          ctx.fill();
        }
      }
      // 眼睛
      if(ds>0.48){
        ctx.fillStyle='#1a1a1a';
        ctx.beginPath();ctx.arc(px-headR*0.32, headCY+headR*0.02, headR*0.14,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(px+headR*0.32, headCY+headR*0.02, headR*0.14,0,Math.PI*2);ctx.fill();
        // 嘴巴
        if(ds>0.6){
          ctx.strokeStyle='rgba(180,100,80,.6)';ctx.lineWidth=headR*0.08;
          ctx.beginPath();
          ctx.arc(px, headCY+headR*0.28, headR*0.18, 0, Math.PI);
          ctx.stroke();
        }
      }

      // —— 手臂动作（动画 + 人浪） ——
      ctx.strokeStyle=c.skin;ctx.lineWidth=bodyW*0.12;ctx.lineCap='round';
      const shoulderLX=px-shoulderW*0.82, shoulderRX=px+shoulderW*0.82;

      if(inWave>0.5 || c.action==='bothArms'){
        // 人浪或双臂高举
        const raise = inWave>0.5 ? inWave : actStrength;
        const armUp = bodyH*0.28 + raise*bodyH*0.12;
        ctx.beginPath();ctx.moveTo(shoulderLX,shoulderY);
        ctx.lineTo(shoulderLX-bodyW*0.08,shoulderY-armUp);ctx.stroke();
        ctx.beginPath();ctx.moveTo(shoulderRX,shoulderY);
        ctx.lineTo(shoulderRX+bodyW*0.08,shoulderY-armUp);ctx.stroke();
        ctx.fillStyle=c.skin;
        ctx.beginPath();ctx.arc(shoulderLX-bodyW*0.08,shoulderY-armUp,bodyW*0.09,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(shoulderRX+bodyW*0.08,shoulderY-armUp,bodyW*0.09,0,Math.PI*2);ctx.fill();
      } else if(c.action==='wave'){
        // 单臂 (右) 挥手
        const armAng = Math.sin(t*3.2+c.jitter)*0.5+0.5;
        const handX = shoulderRX+Math.cos(armAng)*bodyW*0.60;
        const handY = shoulderY-Math.sin(armAng)*bodyW*0.60;
        ctx.beginPath();ctx.moveTo(shoulderRX,shoulderY);ctx.lineTo(handX,handY);ctx.stroke();
        ctx.beginPath();ctx.moveTo(shoulderLX,shoulderY);ctx.lineTo(shoulderLX-bodyW*0.03,shoulderY+bodyH*0.18);ctx.stroke();
        ctx.fillStyle=c.skin;
        ctx.beginPath();ctx.arc(handX,handY,bodyW*0.09,0,Math.PI*2);ctx.fill();
      } else if(c.action==='clap'){
        // 鼓掌：双手胸前合击
        const clapP = Math.abs(Math.sin(t*5.5+c.jitter));
        const cx1=px-bodyW*0.04-clapP*bodyW*0.07, cy1=shoulderY+bodyH*0.09;
        const cx2=px+bodyW*0.04+clapP*bodyW*0.07, cy2=shoulderY+bodyH*0.09;
        ctx.beginPath();ctx.moveTo(shoulderLX,shoulderY);ctx.lineTo(cx1,cy1);ctx.stroke();
        ctx.beginPath();ctx.moveTo(shoulderRX,shoulderY);ctx.lineTo(cx2,cy2);ctx.stroke();
        ctx.fillStyle=c.skin;
        ctx.beginPath();ctx.arc(cx1,cy1,bodyW*0.08,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(cx2,cy2,bodyW*0.08,0,Math.PI*2);ctx.fill();
      } else {
        // idle：自然下垂（微动）
        const dangle = Math.sin(t*1.8+c.jitter)*0.04;
        ctx.beginPath();ctx.moveTo(shoulderLX,shoulderY);ctx.lineTo(shoulderLX-bodyW*0.03+dangle*bodyW*0.02,shoulderY+bodyH*0.18);ctx.stroke();
        ctx.beginPath();ctx.moveTo(shoulderRX,shoulderY);ctx.lineTo(shoulderRX+bodyW*0.03-dangle*bodyW*0.02,shoulderY+bodyH*0.18);ctx.stroke();
      }

      // 围巾
      if(c.hasScarf){
        ctx.fillStyle = '#ffd60a';
        ctx.beginPath();
        ctx.ellipse(px, shoulderY+bodyH*0.02, bodyW*0.28, bodyW*0.09, -0.15, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.ellipse(px+bodyW*0.02, shoulderY+bodyH*0.02-bodyW*0.02, bodyW*0.24, bodyW*0.07, -0.15, 0, Math.PI*2);
        ctx.fill();
      }

      // 旗帜
      if(c.hasFlag){
        const handX = c.flagSide<0 ? shoulderLX-bodyW*0.03 : shoulderRX+bodyW*0.03;
        const handY = shoulderY+bodyH*0.09;
        const poleTop = py - bodyH*1.55;
        ctx.strokeStyle='#8B6914';ctx.lineWidth=bodyW*0.055;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(handX,handY);ctx.lineTo(handX,poleTop);ctx.stroke();
        const flagW = bodyW*1.5, flagH = bodyW*0.95;
        const wvPhase = t*3.8 + c.flagPhase;
        ctx.fillStyle = c.flagColor;
        ctx.beginPath();
        ctx.moveTo(handX, poleTop);
        for(let i=0;i<=8;i++){
          const f=i/8;
          const fx = handX + c.flagSide*flagW*f;
          const fy = poleTop + Math.sin(wvPhase + f*Math.PI*2.2)*flagH*0.16*f;
          ctx.lineTo(fx, fy);
        }
        for(let i=8;i>=0;i--){
          const f=i/8;
          const fx = handX + c.flagSide*flagW*f;
          const fy = poleTop + flagH + Math.sin(wvPhase + f*Math.PI*2.2)*flagH*0.16*f;
          ctx.lineTo(fx, fy);
        }
        ctx.closePath();ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.14)';
        ctx.beginPath();
        ctx.moveTo(handX, poleTop);
        for(let i=0;i<=8;i++){
          const f=i/8;
          const fx = handX + c.flagSide*flagW*f;
          const fy = poleTop + Math.sin(wvPhase + f*Math.PI*2.2)*flagH*0.16*f;
          ctx.lineTo(fx, fy);
        }
        for(let i=8;i>=0;i--){
          const f=i/8;
          const fx = handX + c.flagSide*flagW*f;
          const fy = poleTop + flagH*0.5 + Math.sin(wvPhase + f*Math.PI*2.2)*flagH*0.16*f;
          ctx.lineTo(fx, fy);
        }
        ctx.closePath();ctx.fill();
      }
    }
  });
  ctx.globalAlpha=1;

  // ========== 第四阶段：场边细节 ==========
  // 场边摄像机
  [FW*0.2, FW*0.4, FW*0.6, FW*0.8].forEach(cx=>{ drawCamera(cx, -18); });
  [FW*0.3, FW*0.7].forEach(cx=>{ drawCamera(cx, FH+14); });

  // 替补席
  drawBench(-18, FH/2-70, true);
  drawBench(FW+18, FH/2-70, false);

  // 角旗
  [[WALL,WALL],[FW-WALL,WALL],[WALL,FH-WALL],[FW-WALL,FH-WALL]].forEach(([cx,cy])=>{
    const cp=project(cx,cy);
    ctx.strokeStyle='#fff';ctx.lineWidth=1.5*cp.dscale;
    ctx.beginPath();ctx.moveTo(cp.sx,cp.sy);ctx.lineTo(cp.sx,cp.sy-12*cp.dscale);ctx.stroke();
    ctx.fillStyle='#ffd60a';
    ctx.beginPath();ctx.arc(cp.sx,cp.sy-13*cp.dscale,3*cp.dscale,0,Math.PI*2);ctx.fill();
    // 小三角旗
    ctx.fillStyle='#e63946';
    ctx.beginPath();
    ctx.moveTo(cp.sx,cp.sy-13*cp.dscale);
    ctx.lineTo(cp.sx+7*cp.dscale,cp.sy-17*cp.dscale);
    ctx.lineTo(cp.sx,cp.sy-20*cp.dscale);
    ctx.closePath();ctx.fill();
  });
}
// 场边摄像机
function drawCamera(cx, cy){
  const pos = project(cx, cy);
  const ds = pos.dscale;
  const sz = 7 * ds;
  const sx = pos.sx, sy = pos.sy;
  // 三脚架
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5*ds; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(sx - sz*0.8, sy + sz*1.5);
  ctx.moveTo(sx, sy); ctx.lineTo(sx + sz*0.8, sy + sz*1.5);
  ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + sz*1.5);
  ctx.stroke();
  // 摄像机机身
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.ellipse(sx, sy - sz*0.3, sz*0.7, sz*0.5, 0, 0, Math.PI*2); ctx.fill();
  // 镜头
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.ellipse(sx, sy - sz*0.3, sz*0.3, sz*0.22, 0, 0, Math.PI*2); ctx.fill();
  // 镜头反光
  ctx.fillStyle = 'rgba(100,180,255,.4)';
  ctx.beginPath(); ctx.arc(sx - sz*0.1, sy - sz*0.4, sz*0.12, 0, Math.PI*2); ctx.fill();
  // 红色录制指示灯
  ctx.fillStyle = '#ff3333';
  ctx.beginPath(); ctx.arc(sx + sz*0.35, sy - sz*0.4, sz*0.1, 0, Math.PI*2); ctx.fill();
}
function drawBench(bx, by, isLeft){
  const len = 120, bw = 14;
  // 替补席顶棚
  const tl=project(bx, by, 22), tr=project(bx+len, by, 22);
  const bl=project(bx, by+bw, 0), br=project(bx+len, by+bw, 0);
  fillTrap(tl,tr,br,bl, isLeft?'rgba(60,70,90,.9)':'rgba(90,70,60,.9)');
  // 座位
  const sl=project(bx, by+bw, 0), sr=project(bx+len, by+bw, 0);
  const sbl=project(bx, by+bw+8, 0), sbr=project(bx+len, by+bw+8, 0);
  fillTrap(sl,sr,sbr,sbl, 'rgba(40,45,55,.95)');
  // 替补球员（4人坐成一排）
  for(let i=0; i<4; i++){
    const px = bx + 18 + i*28, py = by + bw + 4;
    const pos = project(px, py);
    const dr = 6 * pos.dscale;
    const teamColor = isLeft ? '#3a86ff' : '#e63946';
    ctx.fillStyle = teamColor;
    ctx.beginPath(); ctx.ellipse(pos.sx, pos.sy - dr*0.5, dr*0.8, dr*0.6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath(); ctx.arc(pos.sx, pos.sy - dr*1.1, dr*0.4, 0, Math.PI*2); ctx.fill();
  }
  // 教练（站姿，靠边）
  const cx = isLeft ? bx + len - 8 : bx + 8;
  const cpos = project(cx, by + bw + 4);
  const cdr = 7 * cpos.dscale;
  ctx.fillStyle = isLeft ? '#1a4a99' : '#a01818';
  ctx.beginPath(); ctx.ellipse(cpos.sx, cpos.sy - cdr*0.6, cdr*0.7, cdr*0.9, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f0c0a0';
  ctx.beginPath(); ctx.arc(cpos.sx, cpos.sy - cdr*1.4, cdr*0.42, 0, Math.PI*2); ctx.fill();
}
function drawField(){
  // 草地基础色（梯形）
  const ftl=project(0,0), ftr=project(FW,0), fbl=project(0,FH), fbr=project(FW,FH);
  fillTrap(ftl,ftr,fbr,fbl,'#2f8a2f');
  // 竖向割草条纹（每条为梯形）
  const stripes=14;
  for(let i=0;i<stripes;i++){
    const x0=i*FW/stripes, x1=(i+1)*FW/stripes;
    const s0t=project(x0,0), s1t=project(x1,0), s0b=project(x0,FH), s1b=project(x1,FH);
    fillTrap(s0t,s1t,s1b,s0b, i%2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)');
  }
  // 深度渐变（远端暗→近端亮）
  const grad=ctx.createLinearGradient(0, ftl.sy, 0, fbl.sy);
  grad.addColorStop(0,'rgba(0,0,0,.32)');
  grad.addColorStop(0.5,'rgba(0,0,0,0)');
  grad.addColorStop(1,'rgba(255,255,255,.06)');
  fillTrap(ftl,ftr,fbr,fbl,grad);
  // 边角虚化
  const vg=ctx.createRadialGradient(FW/2,(ftl.sy+fbl.sy)/2,FW*0.3,FW/2,(ftl.sy+fbl.sy)/2,FW*0.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,0,.25)');
  fillTrap(ftl,ftr,fbr,fbl,vg);
  // 边线（梯形描边）
  ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=WALL;
  const tl = project(WALL/2, WALL/2), tr = project(FW-WALL/2, WALL/2);
  const bl = project(WALL/2, FH-WALL/2), br = project(FW-WALL/2, FH-WALL/2);
  ctx.beginPath();
  ctx.moveTo(tl.sx,tl.sy); ctx.lineTo(tr.sx,tr.sy); ctx.lineTo(br.sx,br.sy); ctx.lineTo(bl.sx,bl.sy);
  ctx.closePath(); ctx.stroke();
  // 中线
  ctx.lineWidth=3;
  if(mode==='match'){
    const mt = project(FW/2, WALL), mb = project(FW/2, FH-WALL);
    ctx.beginPath(); ctx.moveTo(mt.sx, mt.sy); ctx.lineTo(mb.sx, mb.sy); ctx.stroke();
    // 中圈（透视椭圆）
    const mc=project(FW/2,FH/2);
    ctx.beginPath(); ctx.ellipse(mc.sx, mc.sy, 125*mc.dscale, 125*CAM_TILT, 0, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(mc.sx, mc.sy, 4, 0, Math.PI*2); ctx.fill();
  }
  // 大禁区
  const bw=225,bh=550;
  const pa1tl=project(WALL,FH/2-bh/2), pa1tr=project(WALL+bw,FH/2-bh/2);
  const pa1bl=project(WALL,FH/2+bh/2), pa1br=project(WALL+bw,FH/2+bh/2);
  ctx.beginPath(); ctx.moveTo(pa1tl.sx,pa1tl.sy); ctx.lineTo(pa1tr.sx,pa1tr.sy); ctx.lineTo(pa1br.sx,pa1br.sy); ctx.lineTo(pa1bl.sx,pa1bl.sy); ctx.closePath(); ctx.stroke();
  const pa2tl=project(FW-WALL-bw,FH/2-bh/2), pa2tr=project(FW-WALL,FH/2-bh/2);
  const pa2bl=project(FW-WALL-bw,FH/2+bh/2), pa2br=project(FW-WALL,FH/2+bh/2);
  ctx.beginPath(); ctx.moveTo(pa2tl.sx,pa2tl.sy); ctx.lineTo(pa2tr.sx,pa2tr.sy); ctx.lineTo(pa2br.sx,pa2br.sy); ctx.lineTo(pa2bl.sx,pa2bl.sy); ctx.closePath(); ctx.stroke();
  // 小禁区
  const sw=75,sh=250;
  const ga1tl=project(WALL,FH/2-sh/2), ga1tr=project(WALL+sw,FH/2-sh/2);
  const ga1bl=project(WALL,FH/2+sh/2), ga1br=project(WALL+sw,FH/2+sh/2);
  ctx.beginPath(); ctx.moveTo(ga1tl.sx,ga1tl.sy); ctx.lineTo(ga1tr.sx,ga1tr.sy); ctx.lineTo(ga1br.sx,ga1br.sy); ctx.lineTo(ga1bl.sx,ga1bl.sy); ctx.closePath(); ctx.stroke();
  const ga2tl=project(FW-WALL-sw,FH/2-sh/2), ga2tr=project(FW-WALL,FH/2-sh/2);
  const ga2bl=project(FW-WALL-sw,FH/2+sh/2), ga2br=project(FW-WALL,FH/2+sh/2);
  ctx.beginPath(); ctx.moveTo(ga2tl.sx,ga2tl.sy); ctx.lineTo(ga2tr.sx,ga2tr.sy); ctx.lineTo(ga2br.sx,ga2br.sy); ctx.lineTo(ga2bl.sx,ga2bl.sy); ctx.closePath(); ctx.stroke();
  // 点球点 + 罚球弧
  if(mode==='match'){
    const penDist=150, arcR=125;
    const a1=Math.acos((bw-penDist)/arcR);
    const pl=project(WALL+penDist, FH/2);
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(pl.sx, pl.sy, 4*pl.dscale, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(pl.sx, pl.sy, arcR*pl.dscale, arcR*CAM_TILT, 0, -a1, a1); ctx.stroke();
    const pr=project(FW-WALL-penDist, FH/2);
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 4*pr.dscale, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy, arcR*pr.dscale, arcR*CAM_TILT, 0, Math.PI-a1, Math.PI+a1); ctx.stroke();
  }
  // 越位线
  if(mode==='match' && state==='playing' && ball.lastTeam>=0 && ball.lastTeam<=1){
    const attTeam = ball.lastTeam;
    const lineX = getOffsideLine(attTeam);
    const lt=project(lineX,0), lb=project(lineX,FH);
    ctx.save();
    ctx.strokeStyle='rgba(255,214,10,.35)'; ctx.lineWidth=2;
    ctx.setLineDash([8,6]);
    ctx.beginPath(); ctx.moveTo(lt.sx, lt.sy); ctx.lineTo(lb.sx, lb.sy); ctx.stroke();
    ctx.restore();
  }
  // 3D 球门
  drawGoal3D(0, FH/2, true);
  drawGoal3D(FW, FH/2, false);
  // 点球点
  if(mode==='penalty'){
    ctx.fillStyle='#fff';
    const pl=project(PEN_SPOT_L.x,PEN_SPOT_L.y), pr=project(PEN_SPOT_R.x,PEN_SPOT_R.y);
    ctx.beginPath(); ctx.arc(pl.sx, pl.sy, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 3, 0, Math.PI*2); ctx.fill();
  }
}

function drawGoal3D(gx, gy, isLeft){
  const postH = 34;
  const gh = GOAL_H;
  const depth = isLeft ? -20 : 20;
  // 前框（球门线处）4 个角点
  const ftl = project(gx, gy-gh/2), fbl = project(gx, gy+gh/2);
  // 后框（球门后方）
  const btl = project(gx+depth, gy-gh/2), bbl = project(gx+depth, gy+gh/2);
  // 门柱/横梁顶部 y（后框略低，模拟网下垂）
  const fTopL = ftl.sy - postH, fTopR = fbl.sy - postH;
  const bTopL = btl.sy - postH*0.72, bTopR = bbl.sy - postH*0.72;

  // 辅助：绘制带网格的四边形网
  function netQuad(x1,y1, x2,y2, x3,y3, x4,y4, cols, rows){
    ctx.fillStyle='rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.lineTo(x4,y4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=1;
    for(let i=1;i<cols;i++){
      const t=i/cols;
      ctx.beginPath();
      ctx.moveTo(x1+(x2-x1)*t, y1+(y2-y1)*t);
      ctx.lineTo(x4+(x3-x4)*t, y4+(y3-y4)*t);
      ctx.stroke();
    }
    for(let j=1;j<rows;j++){
      const t=j/rows;
      ctx.beginPath();
      ctx.moveTo(x1+(x4-x1)*t, y1+(y4-y1)*t);
      ctx.lineTo(x2+(x3-x2)*t, y2+(y3-y2)*t);
      ctx.stroke();
    }
  }

  // 后墙网
  netQuad(btl.sx,bTopL, bbl.sx,bTopR, bbl.sx,bbl.sy, btl.sx,btl.sy, 6, 5);
  // 顶网（前高后低，斜面）
  netQuad(ftl.sx,fTopL, fbl.sx,fTopR, bbl.sx,bTopR, btl.sx,bTopL, 6, 3);
  // 左侧网
  netQuad(ftl.sx,ftl.sy, ftl.sx,fTopL, btl.sx,bTopL, btl.sx,btl.sy, 3, 5);
  // 右侧网
  netQuad(fbl.sx,fTopR, fbl.sx,fbl.sy, bbl.sx,bbl.sy, bbl.sx,bTopR, 3, 5);

  // 门柱 + 横梁（白色粗线）
  ctx.strokeStyle='#f5f5f5'; ctx.lineWidth=3.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(ftl.sx, ftl.sy); ctx.lineTo(ftl.sx, fTopL); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fbl.sx, fbl.sy); ctx.lineTo(fbl.sx, fTopR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ftl.sx, fTopL); ctx.lineTo(fbl.sx, fTopR); ctx.stroke();
}
function drawPlayers(){
  const roleColor={GK:null,DEF:'#7CFC00',MID:'#ffd60a',FWD:'#ffffff'};
  const sorted = players.map((p,i)=>({p,i,depth:p.y})).sort((a,b)=>a.depth-b.depth);
  sorted.forEach(({p,i})=>{
    if(p.sentOff) return;
    const isRed=p.team===TEAM_RED;
    const pos = project(p.x, p.y);
    const sx = pos.sx, feetY = pos.sy;
    const dr = p.r * pos.dscale; // 深度缩放半径
    const fl=Math.hypot(p.face.x,p.face.y)||1;
    const dx=p.face.x/fl, dy=p.face.y/fl;
    const sliding = p.slide > 0;

    // 阴影
    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(sx+2, feetY+3, dr*0.85, dr*0.85*CAM_TILT*0.6, 0, 0, Math.PI*2); ctx.fill();

    // 活动球员高亮环
    if(i===activeIdx&&state!=='over'){
      ctx.strokeStyle='#ffd60a'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.ellipse(sx, feetY, dr+4, (dr+4)*CAM_TILT*0.6, 0, 0, Math.PI*2); ctx.stroke();
    }
    // 持球指示环
    if(ball.owner===p){
      ctx.strokeStyle='rgba(255,214,10,.7)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(sx, feetY, dr+7, (dr+7)*CAM_TILT*0.6, 0, 0, Math.PI*2); ctx.stroke();
    }

    // 黄/红牌标记（头顶小牌）
    if(p.cards > 0){
      const cardX = sx + dr + 5, cardY = feetY - 32;
      ctx.fillStyle = p.cards >= 2 ? '#e63946' : '#ffd60a';
      ctx.fillRect(cardX, cardY, 7, 10);
      ctx.strokeStyle = '#000'; ctx.lineWidth=0.8;
      ctx.strokeRect(cardX, cardY, 7, 10);
    }

    if(sliding){
      // 铲球动作：身体前倾低姿态滑铲，伸腿断球（强度影响视觉）
      const sdx = p.slideDir.x, sdy = p.slideDir.y;
      const slideAng = Math.atan2(sdy, sdx);
      const slideProgress = p.slide / 0.5; // 1→0 衰减
      const tPower = p.slidePower || 0.5; // 铲球强度
      const slideLen = dr * (1.2 + slideProgress * 1.0 + tPower * 1.5);
      // 扬尘效果：强度越高尘土越多
      const dustCount = Math.floor(2 + tPower * 4);
      ctx.fillStyle = `rgba(180,160,120,${0.3+tPower*0.2})`;
      for(let d=0; d<dustCount; d++){
        const dustX = sx - sdx*(slideLen+d*7) + (Math.random()-0.5)*5;
        const dustY = feetY - sdy*(slideLen+d*7)*0.3 + (Math.random()-0.5)*4;
        ctx.beginPath(); ctx.arc(dustX, dustY, 3-d*0.4, 0, Math.PI*2); ctx.fill();
      }
      // 滑行轨迹（残影）
      ctx.strokeStyle = `rgba(255,255,255,${0.15+slideProgress*0.25})`; ctx.lineWidth = 4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(sx - sdx*slideLen, feetY - sdy*slideLen*0.3); ctx.lineTo(sx, feetY); ctx.stroke();
      // 身体（低姿态前倾，沿铲球方向倒）
      const jCol = p.gk ? (isRed?'#ffb703':'#fb8500') : (isRed?'#e63946':'#3a86ff');
      const jDark = p.gk ? (isRed?'#cc8800':'#cc5500') : (isRed?'#a01818':'#1a4a99');
      ctx.save();
      ctx.translate(sx, feetY - 4);
      ctx.rotate(slideAng);
      // 后腿（支撑腿弯曲）
      ctx.strokeStyle = isRed?'#7a1a1a':'#143060'; ctx.lineWidth=3; ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(-dr*0.5, 0); ctx.lineTo(-dr*0.8, -dr*0.5);
      ctx.stroke();
      // 身体躯干（倾斜椭圆）
      const grad=ctx.createLinearGradient(0,-dr*0.5,0,dr*0.3);
      grad.addColorStop(0,jCol); grad.addColorStop(1,jDark);
      ctx.fillStyle=grad;
      ctx.beginPath(); ctx.ellipse(0, -2, dr*1.1, dr*0.55, 0, 0, Math.PI*2); ctx.fill();
      // 前腿（伸出的铲球腿）
      ctx.strokeStyle = isRed?'#7a1a1a':'#143060'; ctx.lineWidth=3.5; ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(dr*0.6, -2); ctx.lineTo(dr*2.0, 2);
      ctx.stroke();
      // 鞋（铲球脚尖）
      ctx.fillStyle = isRed?'#e63946':'#3a86ff';
      ctx.beginPath(); ctx.ellipse(dr*2.0, 2, 5, 3.5, 0, 0, Math.PI*2); ctx.fill();
      // 手臂（向后平衡伸展）
      ctx.strokeStyle = jCol; ctx.lineWidth=2.5;
      ctx.beginPath();
      ctx.moveTo(-dr*0.3, -4); ctx.lineTo(-dr*1.0, -dr*0.6);
      ctx.stroke();
      ctx.restore();
      // 头（沿铲球方向前探）
      ctx.fillStyle = '#f0c0a0';
      const headX = sx + sdx*dr*1.2;
      const headY = feetY - 10 - Math.abs(sdy)*5;
      ctx.beginPath(); ctx.arc(headX, headY, dr*0.38, 0, Math.PI*2); ctx.fill();
      // 头发
      ctx.fillStyle = isRed?'#5a3010':'#2a1a05';
      ctx.beginPath(); ctx.arc(headX - sdx*2, headY-2, dr*0.3, Math.PI*0.3, Math.PI*1.3); ctx.fill();
    } else if(p.gk && p.diveTimer && p.diveTimer>0){
      // 门将扑救动画
      const diveDir = p.diveDir || 0; // -1=下, 0=中, 1=上
      const jCol = isRed?'#ffb703':'#fb8500';
      const jDark= isRed?'#cc8800':'#cc5500';
      // 扑救轨迹
      ctx.strokeStyle='rgba(255,180,0,.35)'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(sx, feetY - 14);
      ctx.lineTo(sx + diveDir*20, feetY - 14 - Math.abs(diveDir)*15);
      ctx.stroke();
      // 身体（侧倒椭圆）
      ctx.save();
      ctx.translate(sx, feetY - 14);
      const diveAng = diveDir * 0.7; // 倾斜角度
      ctx.rotate(diveAng);
      const grad=ctx.createLinearGradient(0,-dr*0.6,0,dr*0.6);
      grad.addColorStop(0,jCol); grad.addColorStop(1,jDark);
      ctx.fillStyle=grad;
      ctx.beginPath(); ctx.ellipse(0, 0, dr*1.4, dr*0.65, 0, 0, Math.PI*2); ctx.fill();
      // 手臂伸展（扑救方向）
      ctx.strokeStyle=jCol; ctx.lineWidth=3.5; ctx.lineCap='round';
      const armExt = dr*1.6;
      ctx.beginPath();
      ctx.moveTo(dr*0.8, -dr*0.3); ctx.lineTo(armExt, -dr*0.5);
      ctx.moveTo(dr*0.8, dr*0.3); ctx.lineTo(armExt*0.9, dr*0.4);
      ctx.stroke();
      // 手套
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(armExt, -dr*0.5, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(armExt*0.9, dr*0.4, 4, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      // 头
      ctx.fillStyle='#f0c0a0';
      const headX = sx + diveDir*dr*0.8;
      const headY = feetY - 14 - Math.abs(diveDir)*8;
      ctx.beginPath(); ctx.arc(headX, headY, dr*0.42, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = isRed?'#5a3010':'#2a1a05';
      ctx.beginPath(); ctx.arc(headX, headY-dr*0.15, dr*0.35, Math.PI, 0); ctx.fill();
    } else {
    const fh = 30;
    const hipY = feetY - fh*0.38;
    const shY  = feetY - fh*0.70;
    const hdY  = feetY - fh*0.88;
    ctx.strokeStyle = isRed?'#7a1a1a':'#143060';
    ctx.lineWidth=3.5; ctx.lineCap='round';
    const legS=3.5;
    ctx.beginPath();
    ctx.moveTo(sx-legS+dx*1.5, hipY); ctx.lineTo(sx-legS, feetY);
    ctx.moveTo(sx+legS+dx*1.5, hipY); ctx.lineTo(sx+legS, feetY);
    ctx.stroke();

    // 球衣（梯形：肩窄胯宽）
    const jCol = p.gk ? (isRed?'#ffb703':'#fb8500') : (isRed?'#e63946':'#3a86ff');
    const jDark= p.gk ? (isRed?'#cc8800':'#cc5500') : (isRed?'#a01818':'#1a4a99');
    const bw2=dr*1.25, bw1=dr*0.85;
    const grad=ctx.createLinearGradient(sx,shY,sx,hipY);
    grad.addColorStop(0,jCol); grad.addColorStop(1,jDark);
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(sx-bw1,shY); ctx.lineTo(sx+bw1,shY);
    ctx.lineTo(sx+bw2,hipY); ctx.lineTo(sx-bw2,hipY);
    ctx.closePath(); ctx.fill();

    // 角色色条（肩膀横条）
    if(!p.gk && roleColor[p.role]){
      ctx.strokeStyle=roleColor[p.role]; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(sx-bw1+1,shY+1.5); ctx.lineTo(sx+bw1-1,shY+1.5); ctx.stroke();
    }

    // 手臂（两侧短线）
    ctx.strokeStyle = isRed?'#e63946':'#3a86ff';
    ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(sx-bw1,shY+2); ctx.lineTo(sx-bw1-4,hipY-1);
    ctx.moveTo(sx+bw1,shY+2); ctx.lineTo(sx+bw1+4,hipY-1);
    ctx.stroke();

    // 头（圆形，朝向偏移）
    const hdR=dr*0.42;
    ctx.fillStyle='#f0c0a0';
    ctx.beginPath(); ctx.arc(sx+dx*2.5, hdY, hdR, 0, Math.PI*2); ctx.fill();
    // 头发
    ctx.fillStyle = isRed?'#5a3010':'#2a1a05';
    ctx.beginPath(); ctx.arc(sx+dx*2.5, hdY-hdR*0.3, hdR*0.85, Math.PI, 0); ctx.fill();

    // 号码（球衣上）
    ctx.fillStyle='#fff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText((i%11)+1, sx, (shY+hipY)/2);

    // 球星姓名
    ctx.fillStyle = i===activeIdx ? '#ffd60a' : 'rgba(255,255,255,.85)';
    ctx.font = (i===activeIdx?'bold ':'')+'9px sans-serif'; ctx.textBaseline='bottom';
    ctx.fillText(p.name||'', sx, hdY-hdR-2);

    // 体力条
    if(i===activeIdx){
      const bw=28,bh=4,bx=sx-bw/2,by=hdY-hdR-11;
      ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(bx-1,by-1,bw+2,bh+2);
      const sr=(p.stamina??100)/100;
      ctx.fillStyle = sr>0.5?'#7CFC00':sr>0.2?'#ffd60a':'#e63946';
      ctx.fillRect(bx,by,bw*sr,bh);
    }
    } // end else (non-sliding)
  });
}
function drawPenalty(){
  const isPlayerTurn = penState==='aim'||penState==='shoot'||penState==='result';
  const spot = isPlayerTurn?PEN_SPOT_L:PEN_SPOT_R;
  const shooterColor = isPlayerTurn?'#e63946':'#3a86ff';
  const sp = project(spot.x, spot.y);
  const kp = project(keeperX, keeperDiveY);
  // 罚球者
  ctx.fillStyle='rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(sp.sx+2, sp.sy+3, 13, 9*CAM_TILT, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle=shooterColor; ctx.beginPath(); ctx.arc(sp.sx, sp.sy, 13, 0, Math.PI*2); ctx.fill();
  // 门将
  ctx.fillStyle=isPlayerTurn?'#3a86ff':'#ffb703';
  ctx.beginPath(); ctx.arc(kp.sx, kp.sy, 14, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(kp.sx, kp.sy, 18, 18*CAM_TILT, 0, 0, Math.PI*2); ctx.stroke();
  // 瞄准光标
  if(penState==='aim'){
    const gx=WALL+GOAL_D/2;
    const gp = project(gx, aimY);
    ctx.strokeStyle='#ffd60a'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(gp.sx, gp.sy, 12, 12*CAM_TILT, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gp.sx-18, gp.sy); ctx.lineTo(gp.sx+18, gp.sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gp.sx, gp.sy-18); ctx.lineTo(gp.sx, gp.sy+18); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText('空格 / 射门键 锁定方向', FW/2, project(0, FH-40).sy);
  }
}
function drawBallObj(b){
  const pos = project(b.x, b.y);
  const zH = (b.z||0);
  const top = project(b.x, b.y, zH);
  const ds = pos.dscale; // 深度缩放
  // 地面阴影：越高越小越淡，远端更小
  const shadowScale = Math.max(0.3, 1 - zH/200) * ds;
  const shadowAlpha = Math.max(0.1, 0.4 - zH/400);
  ctx.fillStyle=`rgba(0,0,0,${shadowAlpha})`;
  ctx.beginPath(); ctx.ellipse(pos.sx+1, pos.sy+2, b.r*shadowScale, b.r*CAM_TILT*0.7*shadowScale, 0, 0, Math.PI*2); ctx.fill();
  // 球本体：深度缩放 + 高度放大
  const ballScale = (1 + zH/600) * ds;
  const drawY = top.sy;
  const drawR = b.r * ballScale;
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(pos.sx, drawY, drawR, 0, Math.PI*2); ctx.fill();
  // 花纹
  ctx.fillStyle='#222';
  const a=Math.atan2(b.vy,b.vx)+performance.now()/300;
  for(let i=0;i<5;i++){
    const ang=a+i*Math.PI*2/5;
    ctx.beginPath(); ctx.arc(pos.sx+Math.cos(ang)*drawR*0.5, drawY+Math.sin(ang)*drawR*0.5, drawR*0.28, 0, Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle='#999'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(pos.sx, drawY, drawR, 0, Math.PI*2); ctx.stroke();
}

// ====== UI 辅助 ======
function showMsg(txt,dur){
  commit({ msg: { text: txt, key: Date.now() } });
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(()=>{ commit({ msg: { text: '', key: Date.now() } }); }, dur);
}
function showPanel(html){ commit({ screen: 'legacy-html', screenData: html }); }
function hideOverlay(){ commit({ screen: null }); }

// ====== 赛前匹配界面 ======
// 俱乐部代表色（bg: 背景色，dark: 浅色背景用深色文字）
// 阵型站位（SVG viewBox 0 0 100 140，上为进攻端）
let pmSelClub = PM_CLUBS[0];

function pmVibrate(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||12); }catch(e){} }

function pmToast(msg){
  commit({ pm: { ...getState().pm, toast: { text: msg, key: Date.now() } } });
  clearTimeout(pmToast._t); pmToast._t=setTimeout(()=>{
    commit({ pm: { ...getState().pm, toast: { text: '', key: Date.now() } } });
  },1400);
}

// 供 React 组件使用的队徽 URL 解析（原 pmRenderClubs 的图片逻辑）
function pmLogoURL(c){
  const logo=CLUB_LOGO[c.name];
  return logo ? encodeURI(CLUB_LOGO_BASE+logo) : '';
}
function pmSyncFromState(){
  const info=PM_CLUBS.find(c=>c.name===redClub.name)||pmSelClub;
  const opp=PM_CLUBS.find(c=>c.name===blueClub.name)||PM_CLUBS[0];
  commit({
    pm: {
      ...getState().pm,
      selClub: pmSelClub,
      info, opp,
      toast: getState().pm.toast,
    },
  });
}
// 选中主队：左队为该队，对手随机；同步游戏内 redClub/blueClub
function pmPickClub(name){
  const found=PM_CLUBS.find(c=>c.name===name); if(!found) return;
  pmSelClub=found;
  pickClub(found.name);              // 设置 redClub + 随机 blueClub
  pmSyncFromState();
}
// 打开赛前匹配界面
function showPrematch(){
  teamMode='club';                  // prematch 固定为俱乐部选主队模式
  commit({ screen: 'prematch' });
  if(!redClub || !blueClub) pmPickClub(pmSelClub.name);  // 首次：抽签
  else pmSyncFromState();                                // 返回：保持对阵不变
}
// 关闭赛前匹配界面
function hidePrematch(){ commit({ screen: null }); }

// ====== 更新分发 ======
function update(dt){
  if(mode==='match'){
    // 慢动作回放优先处理
    if(replayActive){ updateReplay(dt); updateCamera(dt); return; }
    if(state==='kickoff'){ goalTimer-=dt; if(goalTimer<=0) state='playing'; recordSnapshot(); physicsStep(dt,false); updateCamera(dt); return; }
    if(state==='goal'){ goalTimer-=dt; physicsStep(dt,false); updateCamera(dt); if(goalTimer<=0) kickoff(); return; }
    if(state!=='playing') return;
    timer-=dt; if(timer<=0){ timer=0; endMatch(); return; }
    recordSnapshot();
    physicsStep(dt,true);
    updateCamera(dt);
  } else {
    updatePenalty(dt);
  }
}
// 镜头跟随球（平滑平移）
function updateCamera(dt){
  const target = clamp((ball.x - FW/2) * 0.25, -FW*0.12, FW*0.12);
  camPanX += (target - camPanX) * Math.min(1, dt * 2.5);
}

// ====== 主循环 ======
let lastTimerText = '';
let lastActiveName = '';
function loop(t){
  if(!lastT) lastT=t;
  let dt=(t-lastT)/1000; lastT=t; if(dt>0.05) dt=0.05;
  update(dt);
  if(mode==='match'){
    const m=Math.floor(timer/60),s=Math.floor(timer%60);
    const timerText = m+':'+String(s).padStart(2,'0');
    if(timerText !== lastTimerText){ lastTimerText = timerText; commit({ timerText }); }
    const ap=players[activeIdx];
    const activeName = ap ? ('控制：'+(ap.name||'')+' · '+(ap.role==='GK'?'门将':ap.role==='DEF'?'后卫':ap.role==='MID'?'中场':'前锋')) : '';
    if(activeName !== lastActiveName){ lastActiveName = activeName; commit({ activeName }); }
  } else {
    if(lastActiveName !== ''){ lastActiveName=''; commit({ activeName: '' }); }
  }
  draw();
  requestAnimationFrame(loop);
}

// ====== 启动 ======
function startMatch(){
  mode='match'; score=[0,0];
  commit({ score: [0,0], penHud: { ...getState().penHud, visible:false }, debug: true });
  matchTime=selectedTime; timer=matchTime;
  setupTeams(); kickoff(); hideOverlay();
  startCrowdAmbience(); // 启动背景人群噪声
  preloadGoalCheer();   // 预加载真实进球音效
  if('ontouchstart' in window||navigator.maxTouchPoints>0) commit({ touch: true });
}

// 调试：重置比赛状态并重新开球（保留当前阵容与配置）
function debugResetMatch(){
  score=[0,0];
  commit({ score: [0,0] });
  timer=matchTime;
  setPiece=null; setPieceTimer=0; setPieceMsg='';
  offsideCheck=null;
  players.forEach(p=>{ p.slide=0; p.slidePower=0; p.cards=0; p.sentOff=false; p.fouls=0; p.diveTimer=0; });
  replayActive=false; posHistory=[]; replaySnapshots=[]; pendingCard=null;
  freeKick=null; longPassAim=null;
  kickoff();
  showMsg('比赛已重置', 1200);
}

// 主菜单（阵型/时长选择，动态生成以同步选中态）
function showMenu(){
  commit({
    debug: false,
    penHud: { ...getState().penHud, visible: false },
    screen: 'menu',
    screenData: null,
  });
  updateMatchupPreview();
}

// ====== 2026 世界杯模式 ======
// 球星名单按角色分组：GK/DEF/MID/FWD，FWD顺序为 [左边锋, 中锋, 右边锋]
function ntPlayers(name){
  if(NT_STARS[name]) return NT_STARS[name];
  return {GK:[name+'#1'],DEF:[name+'#2',name+'#3',name+'#4',name+'#5'],MID:[name+'#6',name+'#7',name+'#8'],FWD:[name+'#9',name+'#10',name+'#11']};
}
function ntRating(name){
  const t = NATIONAL_TEAMS.find(x=>x.name===name);
  return t ? t.rating : 70;
}

// ====== 队徽映射（在线 SVG）======
// 国家队国旗：flagcdn 稳定直链（ISO 3166-1 alpha-2，均为真实 SVG）
// 俱乐部：无可靠的在线 SVG 直链源（fclogo 为 webp、svgrepo 限流），
// 改用 football-logos 仓库的 png 队徽，经 jsDelivr CDN 直链（稳定可访问）。

// 头像配色池：按名称哈希稳定取色，保证同一队每次颜色一致
function avatarColor(name){
  let h=0; for(let i=0;i<name.length;i++){ h=(h*31+name.charCodeAt(i))>>>0; }
  return AVATAR_COLORS[h%AVATAR_COLORS.length];
}
// 队徽 HTML：优先俱乐部 png → 国旗 svg → 首字母圆形头像 fallback
// （img 加载失败时 onerror 隐藏并露出头像）
function flagHTML(name, avatarText){
  const club = CLUB_LOGO[name];
  const iso = NT_FLAG[name];
  const src = club ? encodeURI(CLUB_LOGO_BASE + club) : (iso ? (FLAG_BASE + iso + '.svg') : '');
  if(src){
    return `<span class="t"><span class="avatar" style="background:${avatarColor(name)};display:none">${avatarText}</span><img class="flag" src="${src}" alt="${name}" loading="lazy" onerror="this.style.display='none';this.previousElementSibling.style.display='inline-flex'"></span>`;
  }
  return `<span class="avatar" style="background:${avatarColor(name)}">${avatarText}</span>`;
}
function initialOf(name){
  // 中文取首字；英文/其它取首字母大写
  return (name||'?').trim().charAt(0).toUpperCase();
}
// 对阵行：左队名 + 队徽，中间 VS，右队名 + 队徽
function fixtureRow(a, b){
  return `<div class="fixture-row">` +
    `<span class="t">${flagHTML(a, initialOf(a))}<span class="nm">${a}</span></span>` +
    `<span class="vs">VS</span>` +
    `<span class="t right"><span class="nm">${b}</span>${flagHTML(b, initialOf(b))}</span>` +
  `</div>`;
}

let wc = null;

// 世界杯封面动画：React 组件负责渲染，引擎只需在结束时进入选队界面
function showWCCover(onComplete){
  commit({ screen: 'wc-cover', screenData: { onComplete: onComplete || null } });
}

function startWorldCup(){
  commit({ screen: 'wc-select', screenData: null });
}

function initWorldCup(userTeamName){
  const pots=[0,1,2,3].map(p=>shuffle(NATIONAL_TEAMS.slice(p*12,(p+1)*12).map(t=>t.name)));
  const letters='ABCDEFGHIJKL';
  const groups=[];
  for(let i=0;i<12;i++){
    const teams=[pots[0][i],pots[1][i],pots[2][i],pots[3][i]];
    const table={};
    teams.forEach(t=>table[t]={p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0});
    groups.push({name:letters[i],teams,table,fixtures:buildGroupFixtures(teams),played:0});
  }
  wc={userTeam:userTeamName,groups,groupRound:0,stage:'group',knockout:null,champion:null};
  showWCDrawResult();
}

function buildGroupFixtures(teams){
  // 单循环3轮，每组6场，每轮2场
  return [
    [[teams[0],teams[3]],[teams[1],teams[2]]],
    [[teams[0],teams[2]],[teams[3],teams[1]]],
    [[teams[0],teams[1]],[teams[2],teams[3]]]
  ];
}

function showWCDrawResult(){
  commit({ screen: 'wc-draw', screenData: null, wcTick: getState().wcTick + 1 });
}

function sortGroup(g){
  return Object.entries(g.table).sort((a,b)=>{
    if(b[1].pts!==a[1].pts) return b[1].pts-a[1].pts;
    if(b[1].gd!==a[1].gd) return b[1].gd-a[1].gd;
    return b[1].gf-a[1].gf;
  });
}

function renderGroupTable(group){
  const sorted=sortGroup(group);
  let h=`<table class="wc-table"><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>净</th><th>分</th></tr>`;
  sorted.forEach((row,i)=>{
    const t=row[0],s=row[1];
    const isUser=t===wc.userTeam;
    h+=`<tr class="${isUser?'wc-row-user':''}"><td>${i+1}</td><td>${t}</td><td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gf}</td><td>${s.ga}</td><td>${s.gd>0?'+':''}${s.gd}</td><td><b>${s.pts}</b></td></tr>`;
  });
  h+=`</table>`;
  return h;
}

function findUserGroupFixture(){
  for(let g=0;g<12;g++){
    if(!wc.groups[g].teams.includes(wc.userTeam)) continue;
    const round=wc.groups[g].fixtures[wc.groupRound];
    for(const m of round){
      if(m[0]===wc.userTeam||m[1]===wc.userTeam) return {groupIdx:g,match:m};
    }
  }
  return null;
}

function showGroupStandings(){
  commit({ screen: 'wc-standings', screenData: null, wcTick: getState().wcTick + 1 });
}

function simulateScore(a,b){
  const ra=ntRating(a),rb=ntRating(b),diff=ra-rb;
  const la=Math.max(0.3,1.2+diff*0.045),lb=Math.max(0.3,1.2-diff*0.045);
  const poisson=l=>{let k=0,p=1;do{k++;p*=Math.random();}while(p>Math.exp(-l));return k-1;};
  return [Math.min(7,poisson(la)),Math.min(7,poisson(lb))];
}

function updateGroupTable(group,a,b,score){
  const ta=group.table[a],tb=group.table[b];
  ta.p++;tb.p++;
  ta.gf+=score[0];ta.ga+=score[1];
  tb.gf+=score[1];tb.ga+=score[0];
  ta.gd=ta.gf-ta.ga;tb.gd=tb.gf-tb.ga;
  if(score[0]>score[1]){ta.w++;tb.l++;ta.pts+=3;}
  else if(score[0]<score[1]){tb.w++;ta.l++;tb.pts+=3;}
  else{ta.d++;tb.d++;ta.pts++;tb.pts++;}
}

function simOtherGroupMatches(round){
  for(let g=0;g<12;g++){
    const grp=wc.groups[g];
    grp.fixtures[round].forEach(m=>{
      if(m[0]===wc.userTeam||m[1]===wc.userTeam) return;
      const s=simulateScore(m[0],m[1]);
      updateGroupTable(grp,m[0],m[1],s);
    });
  }
}

function playWCGroupMatch(){
  const fix=findUserGroupFixture();
  if(!fix) return;
  const m=fix.match;
  let teamA=m[0],teamB=m[1];
  if(teamA!==wc.userTeam){teamA=m[1];teamB=m[0];}
  const groupIdx=fix.groupIdx;
  const round=wc.groupRound;
  startWCMatch(teamA,teamB,(sc)=>{
    const g=wc.groups[groupIdx];
    let aG,bG;
    if(teamA===m[0]){aG=sc[0];bG=sc[1];}
    else{aG=sc[1];bG=sc[0];}
    updateGroupTable(g,m[0],m[1],[aG,bG]);
    simOtherGroupMatches(round);
    wc.groupRound++;
    if(wc.groupRound>=3) advanceGroupStage();
    else showGroupStandings();
  });
}

function simWCGroupRound(){
  const round=wc.groupRound;
  for(let g=0;g<12;g++){
    const grp=wc.groups[g];
    grp.fixtures[round].forEach(m=>{
      const s=simulateScore(m[0],m[1]);
      updateGroupTable(grp,m[0],m[1],s);
    });
  }
  wc.groupRound++;
  if(wc.groupRound>=3) advanceGroupStage();
  else showGroupStandings();
}

function advanceGroupStage(){
  const sortedGroups=wc.groups.map(g=>({name:g.name,sorted:sortGroup(g)}));
  const winners=sortedGroups.map(s=>s.sorted[0][0]);
  const runners=sortedGroups.map(s=>s.sorted[1][0]);
  const thirds=sortedGroups.map(s=>({team:s.sorted[2][0],pts:s.sorted[2][1].pts,gd:s.sorted[2][1].gd,gf:s.sorted[2][1].gf}));
  thirds.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
  const best8=thirds.slice(0,8).map(t=>t.team);
  const seeds=[];
  for(let i=0;i<12;i++){seeds.push(winners[i]); if(i<8) seeds.push(best8[i]);}
  for(let i=0;i<12;i++) seeds.push(runners[i]);
  const matches=[];
  for(let i=0;i<16;i++){
    matches.push({a:seeds[i],b:seeds[31-i],aScore:null,bScore:null,winner:null,decidedByPen:false});
  }
  wc.knockout={round:'r32',rounds:{r32:matches,r16:[],qf:[],sf:[],final:[]}};
  wc.stage='r32';
  showKnockout();
}

function showKnockout(){
  commit({ screen: 'wc-knockout', screenData: null, wcTick: getState().wcTick + 1 });
}

function simKOMatch(m){
  if(m.winner) return;
  const s=simulateScore(m.a,m.b);
  let aG=s[0],bG=s[1];
  let winner;
  if(aG===bG){
    const ra=ntRating(m.a),rb=ntRating(m.b);
    const aWins=Math.random()<(0.5+(ra-rb)*0.025);
    winner=aWins?m.a:m.b;
    m.decidedByPen=true;
    if(aWins){aG=5;bG=4;}else{aG=4;bG=5;}
  }else{
    winner=aG>bG?m.a:m.b;
  }
  m.aScore=aG;m.bScore=bG;m.winner=winner;
}

function simKnockoutRound(){
  const ko=wc.knockout;
  ko.rounds[ko.round].forEach(m=>simKOMatch(m));
  advanceKnockout();
}

function playWCKnockoutMatch(){
  const ko=wc.knockout;
  const userMatch=ko.rounds[ko.round].find(m=>(m.a===wc.userTeam||m.b===wc.userTeam)&&!m.winner);
  if(!userMatch) return;
  const userIsA=userMatch.a===wc.userTeam;
  const teamA=wc.userTeam;
  const teamB=userIsA?userMatch.b:userMatch.a;
  startWCMatch(teamA,teamB,(sc)=>{
    let aG,bG;
    if(userIsA){aG=sc[0];bG=sc[1];}
    else{aG=sc[1];bG=sc[0];}
    let winner;
    if(aG>bG) winner=userMatch.a;
    else if(bG>aG) winner=userMatch.b;
    else{
      const ra=ntRating(userMatch.a),rb=ntRating(userMatch.b);
      const aWins=Math.random()<(0.5+(ra-rb)*0.025);
      winner=aWins?userMatch.a:userMatch.b;
      userMatch.decidedByPen=true;
      if(aWins){aG=5;bG=4;}else{aG=4;bG=5;}
    }
    userMatch.aScore=aG;userMatch.bScore=bG;userMatch.winner=winner;
    ko.rounds[ko.round].forEach(m=>{if(m!==userMatch) simKOMatch(m);});
    advanceKnockout();
  });
}

function advanceKnockout(){
  const ko=wc.knockout;
  const matches=ko.rounds[ko.round];
  if(matches.some(m=>!m.winner)){showKnockout();return;}
  if(ko.round==='final'){
    wc.champion=matches[0].winner;
    wc.stage='over';
    showTrophy();
    return;
  }
  const order=['r32','r16','qf','sf','final'];
  const idx=order.indexOf(ko.round);
  const next=[];
  for(let i=0;i<matches.length;i+=2){
    next.push({a:matches[i].winner,b:matches[i+1].winner,aScore:null,bScore:null,winner:null,decidedByPen:false});
  }
  const nextName=order[idx+1];
  ko.rounds[nextName]=next;
  ko.round=nextName;
  wc.stage=nextName;
  showKnockout();
}

function showTrophy(){
  commit({ screen: 'wc-trophy', screenData: null, wcTick: getState().wcTick + 1 });
}

function startWCMatch(teamA,teamB,callback){
  wc._matchCallback=callback;
  wc._matchTeams=[teamA,teamB];
  mode='match';
  score=[0,0];
  matchTime=selectedTime;
  timer=matchTime;
  commit({
    score: [0,0],
    penHud: { ...getState().penHud, visible: false },
    redName: teamA,
    blueName: teamB,
  });
  setupWCTeams(teamA,teamB);
  kickoff();
  hideOverlay();
  if('ontouchstart' in window||navigator.maxTouchPoints>0) commit({ touch: true });
}

function setupWCTeams(teamA,teamB){
  players=[];
  const form=FORMATIONS[selectedFormation]||FORMATIONS['4-3-3'];
  buildWCTeam(TEAM_RED,form,teamA);
  buildWCTeam(TEAM_BLUE,form,teamB);
  activeIdx=players.findIndex(p=>p.team===TEAM_RED&&p.role==='FWD');
  if(activeIdx<0) activeIdx=0;
}

function buildWCTeam(team,form,teamName){
  const pool=ntPlayers(teamName);
  const cnt={GK:0,DEF:0,MID:0,FWD:0};
  form.forEach(f=>{
    const [x,y,role]=f;
    const arr=pool[role]||[];
    const name=arr[cnt[role]%arr.length]||(teamName+'#'+(cnt[role]+1));
    cnt[role]++;
    const sx=x*SX,sy=y*SY;
    const px=team===TEAM_RED?sx:FW-sx;
    const p=makePlayer(px,sy,team,role==='GK',role);
    p.name=name;
    players.push(p);
  });
}

// ====== 导出给 React 的动作接口（原 DOM 事件委托逻辑改为显式函数）======
function uiPickClub(name){ pickClub(name); showMenu(); }
function uiSetTeamMode(mode){
  teamMode=mode;
  if(teamMode==='club'&&!redClub){ rollTeams(); } else { redClub=null; blueClub=null; rollTeams(); }
  showMenu();
}
function uiSetFormation(f){ selectedFormation=f; commit({ selectedFormation: f }); }
function uiSetTime(t){ selectedTime=parseInt(t); commit({ selectedTime: selectedTime }); }
function uiSelectWCTeam(name){ initWorldCup(name); }
function uiWCAct(act){
  if(act==='startgroup'){ wc.groupRound=0; showGroupStandings(); }
  else if(act==='playgroup') playWCGroupMatch();
  else if(act==='simround') simWCGroupRound();
  else if(act==='playko') playWCKnockoutMatch();
  else if(act==='simko') simKnockoutRound();
  else if(act==='newwc'){ wc=null; startWorldCup(); }
  else if(act==='menu'){ wc=null; showPrematch(); }
}
function uiMode(m){
  if(m==='match') startMatch();
  else if(m==='penalty') startPenalty();
  else if(m==='menu') showPrematch();
  else if(m==='worldcup') showWCCover();
}

// 赛前匹配界面动作
function uiPmPickClub(name){
  pmSelClub=PM_CLUBS.find(c=>c.name===name)||pmSelClub;
  pmPickClub(name);
  pmToast('主队 · '+redClub.name+'  对阵 · '+blueClub.name);
}
function uiPmSetFormation(f){
  selectedFormation=f;
  commit({ selectedFormation: f });
  pmToast('阵型 · '+selectedFormation);
}
function uiPmBattle(){
  pmVibrate([30,20,40]);
  hidePrematch();
  startMatch();
}
function uiPmMore(){
  hidePrematch();
  showWCCover();
}

// ====== 初始化：React 挂载 canvas 与控件 DOM 后调用 ======
function init(canvas, controls){
  cv = canvas;
  ctx = cv.getContext('2d');

  if (controls && controls.stick) bindStick(controls.stick, controls.knob);
  window.addEventListener('pointermove', stickMove);
  window.addEventListener('pointerup', stickEnd);
  window.addEventListener('pointercancel', stickEnd);

  window.addEventListener('resize', resize); resize();

  // 回放跳过按钮（canvas 点击检测，保留原逻辑）
  cv.addEventListener('pointerdown', e=>{
    if(!replayActive) return;
    const rect = cv.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * cv.width;
    const sy = (e.clientY - rect.top) / rect.height * cv.height;
    const btnW=130, btnH=44, btnX=cv.width-btnW-20, btnY=20;
    if(sx>=btnX && sx<=btnX+btnW && sy>=btnY && sy<=btnY+btnH){
      e.preventDefault();
      skipReplay();
    }
  });

  rollTeams();
  setupTeams();
  showPrematch();
  requestAnimationFrame(loop);
}

// ====== facade：React 通过这里访问引擎状态与动作 ======
export const game = {
  init,
  // 动作（菜单/赛前/世界杯）
  uiMode, uiPickClub, uiSetTeamMode, uiSetFormation, uiSetTime,
  uiSelectWCTeam, uiWCAct, uiPmPickClub, uiPmSetFormation, uiPmBattle, uiPmMore,
  startMatch, startPenalty, debugResetMatch, showPrematch, startWorldCup,
  bindStick,
  // 触屏
  touchShoot, touchPass, touchLong, touchTackle, setSprint,
  // 只读 getter（供世界杯 React 组件读取深层数据）
  getWC: () => wc,
  getPlayers: () => players,
  getState: () => ({
    mode, state, score, timer, selectedFormation, selectedTime,
    teamMode, redClub, blueClub, redName: getState().redName, blueName: getState().blueName,
  }),
  // 数据常量与工具（供 React 组件复用）
  data: {
    CLUBS, PM_CLUBS, PM_FORMATIONS, NATIONAL_TEAMS, NT_STARS,
    NT_FLAG, CLUB_LOGO, CLUB_LOGO_BASE, FLAG_BASE, AVATAR_COLORS,
  },
  helpers: {
    avatarColor, flagHTML, initialOf, fixtureRow,
    sortGroup, renderGroupTable, findUserGroupFixture,
    pmLogoURL, pmFieldSVG: null, // pmFieldSVG 由 React 组件用 PM_FORMATIONS 重新实现
  },
};
