// =================================================================
// 15-main.js — 入口：事件委托 & 启动
// 绿茵对决 · 足球游戏
//
// 菜单按钮通过 overlay 上的事件委托统一处理，兼容动态生成的按钮。
// 支持的 data 属性：data-mode, data-team, data-form, data-time,
//                    data-club, data-wcteam, data-wcact
// =================================================================

// 菜单/按钮事件委托
document.getElementById('overlay').addEventListener('click', e => {
    // 俱乐部选择
    const cb = e.target.closest('[data-club]');
    if (cb) { pickClub(cb.dataset.club); showMenu(); return; }

    // 球队模式切换
    const tc = e.target.closest('[data-team]');
    if (tc) {
        teamMode = tc.dataset.team;
        tc.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === tc));
        if (teamMode === 'club' && !redClub) { rollTeams(); }
        else { redClub = null; blueClub = null; rollTeams(); }
        showMenu();
        return;
    }

    // 阵型
    const f = e.target.closest('[data-form]');
    if (f) {
        selectedFormation = f.dataset.form;
        f.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === f));
        return;
    }

    // 时长
    const t = e.target.closest('[data-time]');
    if (t) {
        selectedTime = parseInt(t.dataset.time);
        t.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === t));
        return;
    }

    // 世界杯：选国家队
    const wct = e.target.closest('[data-wcteam]');
    if (wct) { initWorldCup(wct.dataset.wcteam); return; }

    // 世界杯：操作按钮
    const wca = e.target.closest('[data-wcact]');
    if (wca) {
        const act = wca.dataset.wcact;
        if (act === 'startgroup') { wc.groupRound = 0; showGroupStandings(); }
        else if (act === 'playgroup') playWCGroupMatch();
        else if (act === 'simround') simWCGroupRound();
        else if (act === 'playko') playWCKnockoutMatch();
        else if (act === 'simko') simKnockoutRound();
        else if (act === 'newwc') { wc = null; startWorldCup(); }
        else if (act === 'menu') { wc = null; showMenu(); }
        return;
    }

    // 主菜单按钮
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    const m = btn.dataset.mode;
    if (m === 'match') startMatch();
    else if (m === 'penalty') startPenalty();
    else if (m === 'menu') showMenu();
    else if (m === 'worldcup') showWCCover();
});

// 启动
rollTeams();
setupTeams();
requestAnimationFrame(loop);
