// =================================================================
// 14-game.js — 游戏流程控制：更新分发、UI 辅助、菜单
// 绿茵对决 · 足球游戏
// =================================================================

// --- UI 辅助 ---
function showMsg(txt, dur) {
    const m = document.getElementById('msg');
    m.textContent = txt; m.className = 'show';
    setTimeout(() => { m.className = ''; }, dur);
}

function showPanel(html) {
    document.getElementById('panel').innerHTML = html;
    document.getElementById('overlay').classList.remove('hidden');
}

function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
}

// --- 更新分发 ---
function update(dt) {
    if (mode === 'match') {
        // 回放优先
        if (replayActive) { updateReplay(dt); updateCamera(dt); return; }
        if (state === 'kickoff') {
            goalTimer -= dt;
            if (goalTimer <= 0) state = 'playing';
            recordSnapshot();
            physicsStep(dt, false);
            updateCamera(dt);
            return;
        }
        if (state === 'goal') {
            goalTimer -= dt;
            physicsStep(dt, false);
            updateCamera(dt);
            if (goalTimer <= 0) kickoff();
            return;
        }
        if (state !== 'playing') return;
        timer -= dt;
        if (timer <= 0) { timer = 0; endMatch(); return; }
        recordSnapshot();
        physicsStep(dt, true);
        updateCamera(dt);
    } else {
        updatePenalty(dt);
    }
}

// --- 主循环 ---
function loop(t) {
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.05) dt = 0.05;

    update(dt);

    // HUD 更新
    if (mode === 'match') {
        const m = Math.floor(timer / 60), s = Math.floor(timer % 60);
        document.getElementById('sTime').textContent = m + ':' + String(s).padStart(2, '0');
        const ap = players[activeIdx];
        document.getElementById('activeName').textContent = ap
            ? ('控制：' + (ap.name || '') + ' · ' + (ap.role === 'GK' ? '门将' : ap.role === 'DEF' ? '后卫' : ap.role === 'MID' ? '中场' : '前锋'))
            : '';
    } else {
        document.getElementById('activeName').textContent = '';
    }

    draw();
    requestAnimationFrame(loop);
}

// --- 比赛启动 ---
function startMatch() {
    mode = 'match'; score = [0, 0];
    document.getElementById('sRed').textContent = '0';
    document.getElementById('sBlue').textContent = '0';
    matchTime = selectedTime; timer = matchTime;
    document.getElementById('penHUD').style.display = 'none';
    document.getElementById('btnDebug').style.display = 'flex';
    setupTeams(); kickoff(); hideOverlay();
    startCrowdAmbience();
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('mctrl').classList.add('show');
    }
}

// --- 调试：重置比赛 ---
function debugResetMatch() {
    score = [0, 0];
    document.getElementById('sRed').textContent = '0';
    document.getElementById('sBlue').textContent = '0';
    timer = matchTime;
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';
    offsideCheck = null;
    players.forEach(p => { p.slide = 0; p.slidePower = 0; p.cards = 0; p.sentOff = false; p.fouls = 0; p.diveTimer = 0; });
    replayActive = false; posHistory = []; replaySnapshots = []; pendingCard = null;
    freeKick = null;
    kickoff();
    showMsg('比赛已重置', 1200);
}

document.getElementById('btnDebug').addEventListener('click', debugResetMatch);

// 回放跳过按钮点击检测
cv.addEventListener('pointerdown', e => {
    if (!replayActive) return;
    const rect = cv.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * cv.width;
    const sy = (e.clientY - rect.top) / rect.height * cv.height;
    const btnW = 130, btnH = 44, btnX = cv.width - btnW - 20, btnY = 20;
    if (sx >= btnX && sx <= btnX + btnW && sy >= btnY && sy <= btnY + btnH) {
        e.preventDefault();
        skipReplay();
    }
});

// --- 主菜单 ---
function showMenu() {
    document.getElementById('btnDebug').style.display = 'none';
    document.getElementById('penHUD').style.display = 'none';

    const chip = (active, val, label, attr) =>
        `<button class="chip${active ? ' active' : ''}" ${attr}="${val}">${label}</button>`;

    let h = `<h1>绿茵对决</h1><div class="tag">FOOTBALL · 明星阵容</div><p>选择阵型与时长，操控世界球星出战</p>`;

    // 阵容模式
    h += `<div class="sel-group"><div class="sel-label">阵容模式</div><div class="sel-btns" id="teamBtns">`;
    h += chip(teamMode === 'club', 'club', '俱乐部自选', 'data-team');
    h += chip(teamMode === 'allstar', 'allstar', '全明星随机', 'data-team');
    h += `</div></div>`;

    // 俱乐部
    h += `<div class="sel-group"><div class="sel-label">选择俱乐部</div><div class="club-grid">`;
    h += CLUBS.map(c =>
        `<button class="club-chip${redClub && redClub.name === c.name ? ' selected' : ''}" data-club="${c.name}">${c.name}</button>`
    ).join('');
    h += `</div><div class="matchup" id="matchup"></div></div>`;

    // 阵型
    h += `<div class="sel-group"><div class="sel-label">阵型</div><div class="sel-btns" id="formBtns">`;
    [['4-3-3', '4-3-3'], ['4-4-2', '4-4-2'], ['3-5-2', '3-5-2']].forEach(f =>
        h += chip(selectedFormation === f[0], f[0], f[1], 'data-form')
    );
    h += `</div></div>`;

    // 时长
    h += `<div class="sel-group"><div class="sel-label">比赛时长</div><div class="sel-btns" id="timeBtns">`;
    [[60, '60秒'], [90, '90秒'], [120, '120秒']].forEach(t =>
        h += chip(selectedTime === t[0], t[0], t[1], 'data-time')
    );
    h += `</div></div>`;

    // 按钮
    h += `<div class="btns"><button class="btn btn-primary" data-mode="match">友谊赛 11v11</button><button class="btn btn-secondary" data-mode="penalty">点球大战</button></div>`;
    h += `<button class="btn" data-mode="worldcup" style="width:100%;margin-top:8px;background:linear-gradient(135deg,#ffd60a,#ff8c00);color:#222;font-weight:800">🌍 2026 世界杯 · 争夺大力神杯</button>`;

    // 操作提示
    h += `<div class="keys"><div><b>↑↓←→</b>移动</div><div><b>空格</b>射门</div><div><b>WASD</b>移动</div><div><b>Q</b>长传蓄力</div><div><b>X</b>切换队员</div><div><b>Z</b>疾跑</div><div><b>C</b>铲球</div><div><b>P</b>暂停</div></div>`;
    h += `<div class="small">俱乐部：皇马/巴萨/拜仁/利物浦/曼城/巴黎/尤文/米兰/国米/阿森纳<br>角色色环：<span style="color:#7CFC00">■</span>后卫 · <span style="color:#ffd60a">■</span>中场 · <span style="color:#fff">■</span>前锋<br>移动端：左下摇杆移动，右下按钮传球/射门</div>`;

    showPanel(h);
    updateMatchupPreview();
}
