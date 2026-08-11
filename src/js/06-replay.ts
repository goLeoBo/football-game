// =================================================================
// 06-replay.js — 慢动作回放系统
// 绿茵对决 · 足球游戏
//
// 犯规出牌时触发慢动作回放。持续录制位置快照（80帧缓冲），
// 回放以 0.22x 速度播放，结束后出示红/黄牌。
// 空格/回车可跳过回放。
// =================================================================

let posHistory = [];           // 持续录制的位置快照
let replaySnapshots = [];     // 回放用的快照副本
let replayIdx = 0;
let replayActive = false;
let replayFrameTime = 0;
let pendingCard = null;       // 回放结束后要出示的牌

// 每帧录制快照（球员位置 + 球）
function recordSnapshot() {
    posHistory.push({
        players: players.map(p => ({
            x: p.x, y: p.y, vx: p.vx, vy: p.vy,
            slide: p.slide, kick: p.kick,
            face: { x: p.face.x, y: p.face.y },
            slideDir: { x: p.slideDir.x, y: p.slideDir.y },
            slidePower: p.slidePower || 0,
            diveTimer: p.diveTimer || 0,
            diveDir: p.diveDir || 0,
            diveTargetY: p.diveTargetY || 0
        })),
        ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }
    });
    if (posHistory.length > 80) posHistory.shift();
}

// 回退到某帧
function applySnapshot(s) {
    s.players.forEach((sp, i) => {
        if (players[i]) {
            players[i].x = sp.x; players[i].y = sp.y;
            players[i].vx = sp.vx; players[i].vy = sp.vy;
            players[i].slide = sp.slide; players[i].kick = sp.kick;
            players[i].face = { x: sp.face.x, y: sp.face.y };
            players[i].slideDir = { x: sp.slideDir.x, y: sp.slideDir.y };
            players[i].slidePower = sp.slidePower;
            players[i].diveTimer = sp.diveTimer;
            players[i].diveDir = sp.diveDir;
            players[i].diveTargetY = sp.diveTargetY;
        }
    });
    ball.x = s.ball.x; ball.y = s.ball.y;
    ball.vx = s.ball.vx; ball.vy = s.ball.vy;
}

// 启动回放
// cardInfo: { player, color, reason, foulX, foulY }
function startReplay(cardInfo) {
    replaySnapshots = [...posHistory];
    replayIdx = 0;
    replayFrameTime = 0;
    replayActive = true;
    pendingCard = cardInfo;
    posHistory = [];
}

// 跳过回放
function skipReplay() {
    if (!replayActive) return;
    if (replaySnapshots.length > 0) applySnapshot(replaySnapshots[replaySnapshots.length - 1]);
    replayActive = false;
    if (pendingCard) {
        const c = pendingCard; pendingCard = null;
        executeShowCard(c.player, c.color, c.reason, c.foulX, c.foulY);
    }
}

// 更新回放帧（dt 为当前帧时间）
function updateReplay(dt) {
    replayFrameTime += dt * 0.22;    // 0.22x 慢放
    const target = Math.floor(replayFrameTime * 60);
    if (target >= replaySnapshots.length) {
        if (replaySnapshots.length > 0) applySnapshot(replaySnapshots[replaySnapshots.length - 1]);
        replayActive = false;
        if (pendingCard) {
            const c = pendingCard; pendingCard = null;
            executeShowCard(c.player, c.color, c.reason, c.foulX, c.foulY);
        }
        return;
    }
    while (replayIdx < target && replayIdx < replaySnapshots.length - 1) replayIdx++;
    if (replayIdx < replaySnapshots.length) applySnapshot(replaySnapshots[replayIdx]);
}
