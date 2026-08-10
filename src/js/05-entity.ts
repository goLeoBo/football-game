// =================================================================
// 05-entity.js — 球员创建 & 球队组建
// 绿茵对决 · 足球游戏
//
// makePlayer() 创建一个球员对象。
// buildTeam() 按阵型 + 球员池组建一支 11 人队伍。
// setupTeams() 初始化双方球队。
// kickoff() 重置球到中点并开球。
// =================================================================

// 创建一个球员
// x, y: 场上坐标  team: TEAM_RED/TEAM_BLUE  gk: 是否门将  role: GK/DEF/MID/FWD
function makePlayer(x, y, team, gk = false, role = 'FWD') {
    return {
        x, y,
        vx: 0, vy: 0,
        team, gk, role,
        name: '',
        r: 13,
        stamina: 100,
        homeX: x, homeY: y,           // 阵型默认位置
        face: { x: 0, y: team === TEAM_RED ? 1 : -1 },
        kick: 0,                       // 踢球冷却
        slide: 0,                      // 铲球计时器
        slideDir: { x: 0, y: 0 },     // 铲球方向
        slidePower: 0,                 // 铲球强度 0~1
        cards: 0,                      // 累计黄/红牌
        sentOff: false,
        fouls: 0,                      // 本场犯规次数
        diveTimer: 0,                  // 门将扑救计时器
        diveDir: 0,                    // 扑救方向 -1/0/1
        diveTargetY: 0                 // 扑救目标 y
    };
}

// 按阵型和球队组建 11 人
// team: TEAM_RED 或 TEAM_BLUE  form: FORMATIONS 中的一项
function buildTeam(team, form) {
    // 选择球员池
    const src = (teamMode === 'club' && redClub)
        ? (team === TEAM_RED ? redClub : blueClub)
        : (team === TEAM_RED ? RED_POOL : BLUE_POOL);

    const pool = {
        GK:  shuffle([...src.GK]),
        DEF: shuffle([...src.DEF]),
        MID: shuffle([...src.MID]),
        FWD: shuffle([...src.FWD])
    };
    const cnt = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

    form.forEach(f => {
        const [x, y, role] = f;
        const name = pool[role][cnt[role] % pool[role].length];
        cnt[role]++;
        const sx = x * SX, sy = y * SY;
        const px = team === TEAM_RED ? sx : FW - sx;
        const p = makePlayer(px, sy, team, role === 'GK', role);
        p.name = name;
        players.push(p);
    });
}

// 初始化双方球队
function setupTeams() {
    players = [];
    const form = FORMATIONS[selectedFormation] || FORMATIONS['4-3-3'];
    buildTeam(TEAM_RED, form);
    buildTeam(TEAM_BLUE, form);
    activeIdx = players.findIndex(p => p.team === TEAM_RED && p.role === 'FWD');
    if (activeIdx < 0) activeIdx = 0;
}

// 开球：球回中点，球员回各自半场
function kickoff() {
    ball.x = FW / 2; ball.y = FH / 2;
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0;
    ball.owner = null;
    camPanX = 0;
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';
    offsideCheck = null; freeKick = null;

    // 全体回阵型位置
    players.forEach(p => {
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.kick = 0;
    });

    // 开球队员（红队离中点最近的非门将）
    let best = -1, bd = 1e9;
    players.forEach((p, i) => {
        if (p.team === TEAM_RED && !p.gk) {
            const d = dist(p, ball);
            if (d < bd) { bd = d; best = i; }
        }
    });
    if (best >= 0) {
        const p = players[best];
        p.x = FW / 2 - 18; p.y = FH / 2; p.vx = 0; p.vy = 0;
        p.face = { x: 1, y: 0 };
        ball.owner = p;
        activeIdx = best;
    }
    state = 'kickoff'; goalTimer = 0.8;
}

// --- 俱乐部选队 ---

// 自选俱乐部：用户选红队，对手随机
function pickClub(name) {
    const found = CLUBS.find(c => c.name === name);
    if (!found) return;
    redClub = found;
    let b;
    do { b = Math.floor(Math.random() * CLUBS.length); } while (CLUBS[b].name === name);
    blueClub = CLUBS[b];
    updateMatchupPreview(); updateTeamNames();
}

// 随机抽签
function rollTeams() {
    if (teamMode === 'club') {
        if (!redClub) {
            const a = Math.floor(Math.random() * CLUBS.length);
            let b;
            do { b = Math.floor(Math.random() * CLUBS.length); } while (b === a);
            redClub = CLUBS[a]; blueClub = CLUBS[b];
        } else {
            let b;
            do { b = Math.floor(Math.random() * CLUBS.length); } while (CLUBS[b].name === redClub.name);
            blueClub = CLUBS[b];
        }
    } else {
        redClub = null; blueClub = null;
    }
    updateMatchupPreview(); updateTeamNames();
}

// 刷新对阵预览
function updateMatchupPreview() {
    const el = document.getElementById('matchup');
    if (!el) return;
    if (teamMode === 'club' && redClub) {
        el.innerHTML = `<span style="color:#e63946">${redClub.name}</span> <b style="color:#888;margin:0 6px">VS</b> <span style="color:#3a86ff">${blueClub.name}</span>`;
    } else {
        el.innerHTML = `<span style="color:#e63946">世界明星</span> <b style="color:#888;margin:0 6px">VS</b> <span style="color:#3a86ff">传奇明星</span>`;
    }
}

// 刷新记分牌队伍名
function updateTeamNames() {
    const r = document.getElementById('redName'), b = document.getElementById('blueName');
    if (r) r.textContent = (teamMode === 'club' && redClub) ? redClub.name : '世界明星';
    if (b) b.textContent = (teamMode === 'club' && blueClub) ? blueClub.name : '传奇明星';
}
