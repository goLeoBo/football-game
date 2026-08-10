// =================================================================
// 00-constants.js — 场地参数、缩放、全局状态 & 工具函数
// 绿茵对决 · 足球游戏
// =================================================================

// --- 画布 & 场地尺寸 ---
const FW = 1450, FH = 920;
const SX = FW / 900, SY = FH / 560;   // 阵型/AI 坐标基于 900×560 设计，按实际场地缩放
const GOAL_H = 220;                    // 球门高度
const GOAL_D = 24;                     // 球门纵深
const WALL = 12;                       // 边线外间距
const GRAVITY = 28;                    // z 轴重力加速度
const BALL_BOUNCE = 0.55;              // 地面反弹系数
let scale = 1;

// --- 队伍常量 ---
const TEAM_RED = 0, TEAM_BLUE = 1;

// --- 画布 ---
const cv = document.getElementById('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

// --- 比赛模式状态 ---
let mode = 'match';          // 'match' | 'penalty'
let state = 'menu';
let score = [0, 0];
let matchTime = 90;          // 比赛时长（秒），菜单可选
let timer = matchTime;
let lastT = 0;
let goalTimer = 0;
let scorer = null;

// --- 定位球状态 ---
let setPiece = null;         // null | 'corner' | 'goalkick' | 'throwin' | 'foul' | 'offside'
let setPieceTimer = 0;
let setPieceMsg = '';
let offsideCheck = null;     // { team, lineX, attackDir, passerIdx }

// --- 任意球/球门球/长传蓄力 ---
let freeKick = null;         // { takerIdx, team, timer, isAI, charging, power, spaceLatch, direct, wall:[], touched }
let goalKick = null;         // { takerIdx, team, isAI, charging, power, spaceLatch, timer }
let lobPass = null;          // { takerIdx, charging, power, spaceLatch }
let lobPassPreview = [];     // 蓄力预览轨迹点

// --- 球 ---
const ball: Record<string, any> = { x: FW / 2, y: FH / 2, vx: 0, vy: 0, vz: 0, z: 0, r: 9, owner: null, lastTeam: 0 };
let ballTrail: any[] = [];          // 飞行轨迹点

// --- 球员 ---
let players: any[] = [];
let activeIdx = 0;

// 常用 math 工具
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 洗牌
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// --- 点球大战状态 ---
const PEN_SPOT_L = { x: 200, y: FH / 2 };
const PEN_SPOT_R = { x: FW - 200, y: FH / 2 };
let penState = 'aim';        // aim | shoot | result | ai-aim | ai-shoot | ai-result | over
let penScore = [0, 0];
let penShots = [0, 0];
let penRound = 1;
let penTimer = 0;
let aimY = FH / 2;
let aimDir = 1;
let aimSpeed = 2.6;
let penTargetY = FH / 2;
let keeperDiveY = FH / 2;
let keeperX = 0;
let penBall = { x: 0, y: 0, vx: 0, vy: 0, vz: 0, z: 0 };
let penResult = '';
let penSuddenDeath = false;

// --- 阵型/时长选择 ---
let selectedFormation = '4-3-3';
let selectedTime = 90;

// --- 球队模式 ---
let teamMode = 'club';        // 'club' | 'allstar'
let redClub = null, blueClub = null;
