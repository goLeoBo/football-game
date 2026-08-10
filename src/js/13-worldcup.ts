// =================================================================
// 13-worldcup.js — 2026 世界杯模式（48队 · 12组 · 淘汰赛）
// 绿茵对决 · 足球游戏
//
// 使用真实国家队名 + 评级。小组赛 3 轮单循环，每组前 2 +
// 8 个最佳第 3 晋级 32 强淘汰赛。
// 国家队球员名单通过 ntPlayers() 获取，无名单国家自动生成。
// =================================================================

// 48 支国家队（4 档 × 12 队/档），按 FIFA 世界排名模拟
const NATIONAL_TEAMS = [
    // 第 1 档（种子）
    { name: '巴西', rating: 92, pot: 1 }, { name: '阿根廷', rating: 91, pot: 1 },
    { name: '法国', rating: 90, pot: 1 }, { name: '英格兰', rating: 88, pot: 1 },
    { name: '西班牙', rating: 88, pot: 1 }, { name: '葡萄牙', rating: 87, pot: 1 },
    { name: '德国', rating: 86, pot: 1 }, { name: '意大利', rating: 86, pot: 1 },
    { name: '荷兰', rating: 85, pot: 1 }, { name: '比利时', rating: 85, pot: 1 },
    { name: '克罗地亚', rating: 85, pot: 1 }, { name: '墨西哥', rating: 84, pot: 1 },
    // 第 2 档
    { name: '乌拉圭', rating: 83, pot: 2 }, { name: '哥伦比亚', rating: 83, pot: 2 },
    { name: '美国', rating: 82, pot: 2 }, { name: '瑞士', rating: 81, pot: 2 },
    { name: '日本', rating: 81, pot: 2 }, { name: '摩洛哥', rating: 81, pot: 2 },
    { name: '丹麦', rating: 80, pot: 2 }, { name: '塞内加尔', rating: 80, pot: 2 },
    { name: '塞尔维亚', rating: 80, pot: 2 }, { name: '瑞典', rating: 79, pot: 2 },
    { name: '波兰', rating: 79, pot: 2 }, { name: '威尔士', rating: 78, pot: 2 },
    // 第 3 档
    { name: '韩国', rating: 76, pot: 3 }, { name: '土耳其', rating: 76, pot: 3 },
    { name: '伊朗', rating: 75, pot: 3 }, { name: '智利', rating: 75, pot: 3 },
    { name: '厄瓜多尔', rating: 74, pot: 3 }, { name: '乌克兰', rating: 74, pot: 3 },
    { name: '尼日利亚', rating: 74, pot: 3 }, { name: '秘鲁', rating: 73, pot: 3 },
    { name: '奥地利', rating: 73, pot: 3 }, { name: '捷克', rating: 73, pot: 3 },
    { name: '巴拉圭', rating: 72, pot: 3 }, { name: '喀麦隆', rating: 72, pot: 3 },
    // 第 4 档
    { name: '埃及', rating: 71, pot: 4 }, { name: '加拿大', rating: 70, pot: 4 },
    { name: '突尼斯', rating: 70, pot: 4 }, { name: '阿尔及利亚', rating: 70, pot: 4 },
    { name: '科特迪瓦', rating: 70, pot: 4 }, { name: '哥斯达黎加', rating: 69, pot: 4 },
    { name: '澳大利亚', rating: 68, pot: 4 }, { name: '沙特阿拉伯', rating: 67, pot: 4 },
    { name: '南非', rating: 67, pot: 4 }, { name: '卡塔尔', rating: 66, pot: 4 },
    { name: '牙买加', rating: 66, pot: 4 }, { name: '洪都拉斯', rating: 65, pot: 4 }
];

// 国家队球星名单（GK/DEF/MID/FWD）
const NT_STARS = {
    '巴西': {
        GK: ['阿利松'], DEF: ['达尼洛', '马尔基尼奥斯', '蒂亚戈·席尔瓦', '阿莱士·桑德罗'],
        MID: ['卡塞米罗', '布鲁诺·吉马良斯', '内马尔'],
        FWD: ['维尼修斯', '理查利森', '拉菲尼亚']
    },
    '阿根廷': {
        GK: ['马丁内斯'], DEF: ['莫利纳', '罗梅罗', '奥塔门迪', '塔利亚菲科'],
        MID: ['德保罗', '帕雷德斯', '洛塞尔索'],
        FWD: ['阿尔瓦雷斯', '劳塔罗', '梅西']
    },
    '法国': {
        GK: ['迈尼昂'], DEF: ['帕瓦尔', '瓦拉内', '于帕梅卡诺', '埃尔南德斯'],
        MID: ['琼阿梅尼', '拉比奥', '格列兹曼'],
        FWD: ['姆巴佩', '吉鲁', '登贝莱']
    },
    '英格兰': {
        GK: ['皮克福德'], DEF: ['沃克', '斯通斯', '马奎尔', '肖'],
        MID: ['赖斯', '贝林厄姆', '萨卡'],
        FWD: ['福登', '凯恩', '斯特林']
    },
    '西班牙': {
        GK: ['西蒙'], DEF: ['卡瓦哈尔', '托雷斯', '拉波尔特', '阿尔巴'],
        MID: ['罗德里', '佩德里', '加维'],
        FWD: ['阿森西奥', '莫拉塔', '费兰']
    },
    '葡萄牙': {
        GK: ['科斯塔'], DEF: ['坎塞洛', '迪亚斯', '佩佩', '格雷罗'],
        MID: ['帕利尼亚', 'B席', 'B费'],
        FWD: ['莱奥', 'C罗', '菲利克斯']
    },
    '德国': {
        GK: ['诺伊尔'], DEF: ['基米希', '吕迪格', '聚勒', '劳姆'],
        MID: ['京多安', '穆西亚拉', '萨内'],
        FWD: ['格纳布里', '维尔纳', '穆勒']
    },
    '意大利': {
        GK: ['多纳鲁马'], DEF: ['迪洛伦佐', '阿切尔比', '巴斯托尼', '迪马尔科'],
        MID: ['巴雷拉', '若日尼奥', '维拉蒂'],
        FWD: ['因西涅', '因莫比莱', '基耶萨']
    },
    '荷兰': {
        GK: ['比杰洛'], DEF: ['弗林蓬', '德利赫特', '范戴克', '阿克'],
        MID: ['德容', '克拉森', '加克波'],
        FWD: ['德佩', '马伦', '贝尔赫伊斯']
    },
    '比利时': {
        GK: ['库尔图瓦'], DEF: ['卡斯塔涅', '阿尔德韦雷尔德', '维尔通亨', '梅尼耶'],
        MID: ['维特塞尔', '德布劳内', '阿扎尔'],
        FWD: ['特罗萨德', '卢卡库', '默滕斯']
    },
    '克罗地亚': {
        GK: ['利瓦科维奇'], DEF: ['尤拉诺维奇', '洛夫伦', '格瓦迪奥尔', '索萨'],
        MID: ['布罗佐维奇', '科瓦契奇', '莫德里奇'],
        FWD: ['佩里西奇', '克拉马里奇', '帕沙利奇']
    },
    '墨西哥': {
        GK: ['奥乔亚'], DEF: ['阿劳霍', '蒙特斯', '加亚多', '桑切斯'],
        MID: ['阿尔瓦雷斯', '埃雷拉', '查韦斯'],
        FWD: ['安图尼亚', '希梅内斯', '洛萨诺']
    }
};

// 国家队球员列表（无预设名单则自动生成）
function ntPlayers(name) {
    if (NT_STARS[name]) return NT_STARS[name];
    return {
        GK: [name + '#1'],
        DEF: [name + '#2', name + '#3', name + '#4', name + '#5'],
        MID: [name + '#6', name + '#7', name + '#8'],
        FWD: [name + '#9', name + '#10', name + '#11']
    };
}

function ntRating(name) {
    const t = NATIONAL_TEAMS.find(x => x.name === name);
    return t ? t.rating : 70;
}

let wc = null;

// ==============================================================
// 世界杯封面动画
// ==============================================================

function showWCCover(onComplete) {
    const cover = document.createElement('div');
    cover.className = 'wc-cover';
    cover.innerHTML = `
<div class="wc-cover-bg"></div><div class="wc-cover-lights"></div>
<div class="wc-cover-2026">2026</div>
<div class="wc-cover-sub">FIFA WORLD CUP</div>
<div class="wc-cover-title">世界足球盛宴</div>
<div class="wc-cover-hosts">🇺🇸 美国 · 🇨🇦 加拿大 · 🇲🇽 墨西哥</div>
<div class="wc-cover-trophy">🏆</div>
<div class="wc-cover-vs"><span>⚽</span><span>🥅</span><span>🏆</span></div>
<div class="wc-cover-continue">点击任意位置进入 ⚽</div>`;

    // 彩纸动画
    const colors = ['#ffd60a', '#e63946', '#3a86ff', '#7CFC00', '#ff8c00', '#ff006e'];
    for (let i = 0; i < 50; i++) {
        const c = document.createElement('div');
        c.className = 'wc-confetti';
        const sz = 4 + Math.random() * 8;
        c.style.cssText = `
width:${sz}px;height:${sz * (Math.random() > .5 ? 1 : 1.6)}px;
left:${Math.random() * 100}%;background:${colors[i % colors.length]};
border-radius:${Math.random() > .5 ? '50%' : '2px'};
animation-duration:${2.5 + Math.random() * 2.5}s;
animation-delay:${Math.random() * 2.5}s`;
        cover.appendChild(c);
    }
    document.body.appendChild(cover);

    let advanced = false;
    const proceed = () => {
        if (advanced) return; advanced = true;
        cover.style.opacity = '0';
        setTimeout(() => { cover.remove(); if (onComplete) onComplete(); else startWorldCup(); }, 600);
    };
    cover.addEventListener('click', proceed);
    setTimeout(proceed, 6500);
}

function startWorldCup() {
    let h = `<h1>🌍 2026 世界杯</h1><div class="tag">48队 · 12组 · 大力神杯</div>`;
    h += `<p>选择你心仪的国家队，开启夺冠征程</p>`;
    for (let p = 0; p < 4; p++) {
        h += `<div class="wc-pot-label">第 ${p + 1} 档</div><div class="wc-teams">`;
        NATIONAL_TEAMS.slice(p * 12, (p + 1) * 12).forEach(t => {
            h += `<button class="wc-team" data-wcteam="${t.name}">${t.name}<span class="wc-rating">${t.rating}</span></button>`;
        });
        h += `</div>`;
    }
    h += `<div class="btns" style="margin-top:14px"><button class="btn btn-ghost" data-mode="menu">返回</button></div>`;
    showPanel(h);
}

// ==============================================================
// 小组赛
// ==============================================================

function initWorldCup(userTeamName) {
    const pots = [0, 1, 2, 3].map(p => shuffle(NATIONAL_TEAMS.slice(p * 12, (p + 1) * 12).map(t => t.name)));
    const letters = 'ABCDEFGHIJKL';
    const groups = [];
    for (let i = 0; i < 12; i++) {
        const teams = [pots[0][i], pots[1][i], pots[2][i], pots[3][i]];
        const table = {};
        teams.forEach(t => table[t] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
        groups.push({ name: letters[i], teams, table, fixtures: buildGroupFixtures(teams), played: 0 });
    }
    wc = { userTeam: userTeamName, groups, groupRound: 0, stage: 'group', knockout: null, champion: null };
    showWCDrawResult();
}

function buildGroupFixtures(teams) {
    return [
        [[teams[0], teams[3]], [teams[1], teams[2]]],
        [[teams[0], teams[2]], [teams[3], teams[1]]],
        [[teams[0], teams[1]], [teams[2], teams[3]]]
    ];
}

function showWCDrawResult() {
    let h = `<h1>🌍 抽签结果</h1><div class="tag">2026 世界杯 · 小组赛</div>`;
    h += `<p>你的国家队：<b style="color:#ffd60a">${wc.userTeam}</b></p>`;
    h += `<div class="wc-scroll"><div class="wc-groups">`;
    wc.groups.forEach(g => {
        const isUser = g.teams.includes(wc.userTeam);
        h += `<div class="wc-group${isUser ? ' wc-group-user' : ''}">`;
        h += `<div class="wc-group-name">${g.name}组${isUser ? ' · 你的组' : ''}</div>`;
        g.teams.forEach(t => {
            h += `<div class="wc-gt${t === wc.userTeam ? ' wc-gt-user' : ''}">${t}</div>`;
        });
        h += `</div>`;
    });
    h += `</div></div>`;
    h += `<div class="btns" style="margin-top:14px"><button class="btn btn-primary" data-wcact="startgroup">开始小组赛</button><button class="btn btn-ghost" data-mode="menu">返回菜单</button></div>`;
    showPanel(h);
}

function sortGroup(g) {
    return Object.entries(g.table).sort((a, b) => {
        if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
        if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
        return b[1].gf - a[1].gf;
    });
}

function renderGroupTable(group) {
    const sorted= sortGroup(group);
    let h = `<table class="wc-table"><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>净</th><th>分</th></tr>`;
    sorted.forEach((row, i) => {
        const t = row[0], s = row[1];
        const isUser = t === wc.userTeam;
        h += `<tr class="${isUser ? 'wc-row-user' : ''}"><td>${i + 1}</td><td>${t}</td><td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gf}</td><td>${s.ga}</td><td>${s.gd > 0 ? '+' : ''}${s.gd}</td><td><b>${s.pts}</b></td></tr>`;
    });
    h += `</table>`;
    return h;
}

function findUserGroupFixture() {
    for (let g = 0; g < 12; g++) {
        if (!wc.groups[g].teams.includes(wc.userTeam)) continue;
        const round = wc.groups[g].fixtures[wc.groupRound];
        for (const m of round) {
            if (m[0] === wc.userTeam || m[1] === wc.userTeam) return { groupIdx: g, match: m };
        }
    }
    return null;
}

function showGroupStandings() {
    const round = wc.groupRound;
    let h = `<h1>🌍 小组赛 第${round + 1}轮</h1><div class="tag">2026 世界杯</div>`;
    let userGroup = null;
    for (let g = 0; g < 12; g++) {
        if (wc.groups[g].teams.includes(wc.userTeam)) { userGroup = wc.groups[g]; break; }
    }
    if (userGroup) {
        h += `<p>你的组：<b style="color:#ffd60a">${userGroup.name}组</b> · 你的球队：<b style="color:#ffd60a">${wc.userTeam}</b></p>`;
    }
    h += `<div class="wc-scroll">`;
    if (userGroup) {
        h += renderGroupTable(userGroup);
        h += `<div class="wc-fixtures"><div class="sel-label">本轮对阵</div>`;
        userGroup.fixtures[round].forEach(m => {
            const isUser = m[0] === wc.userTeam || m[1] === wc.userTeam;
            h += `<div class="wc-fix${isUser ? ' wc-fix-user' : ''}">${m[0]} VS ${m[1]}</div>`;
        });
        h += `</div>`;
    }
    h += `<div class="wc-other-groups"><div class="sel-label">其他小组</div>`;
    wc.groups.forEach(g => {
        if (g === userGroup) return;
        const sorted = sortGroup(g);
        h += `<div class="wc-group-mini"><b>${g.name}组</b> · `;
        h += sorted.map((r, i) => `${i + 1}.${r[0]}(${r[1].pts})`).join(' ');
        h += `</div>`;
    });
    h += `</div></div>`;
    const userFix = findUserGroupFixture();
    h += `<div class="btns" style="margin-top:14px">`;
    if (userFix) h += `<button class="btn btn-primary" data-wcact="playgroup">比赛（你的场次）</button>`;
    h += `<button class="btn btn-secondary" data-wcact="simround">模拟本轮</button></div>`;
    showPanel(h);
}

// ==============================================================
// 淘汰赛
// ==============================================================

function simulateScore(a, b) {
    const ra = ntRating(a), rb = ntRating(b), diff = ra - rb;
    const la = Math.max(0.3, 1.2 + diff * 0.045);
    const lb = Math.max(0.3, 1.2 - diff * 0.045);
    const poisson = l => { let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > Math.exp(-l)); return k - 1; };
    return [Math.min(7, poisson(la)), Math.min(7, poisson(lb))];
}

function updateGroupTable(group, a, b, score) {
    const ta = group.table[a], tb = group.table[b];
    ta.p++; tb.p++; ta.gf += score[0]; ta.ga += score[1];
    tb.gf += score[1]; tb.ga += score[0];
    ta.gd = ta.gf - ta.ga; tb.gd = tb.gf - tb.ga;
    if (score[0] > score[1]) { ta.w++; tb.l++; ta.pts += 3; }
    else if (score[0] < score[1]) { tb.w++; ta.l++; tb.pts += 3; }
    else { ta.d++; tb.d++; ta.pts++; tb.pts++; }
}

function simOtherGroupMatches(round) {
    for (let g = 0; g < 12; g++) {
        const grp = wc.groups[g];
        grp.fixtures[round].forEach(m => {
            if (m[0] === wc.userTeam || m[1] === wc.userTeam) return;
            const s = simulateScore(m[0], m[1]);
            updateGroupTable(grp, m[0], m[1], s);
        });
    }
}

function playWCGroupMatch() {
    const fix = findUserGroupFixture();
    if (!fix) return;
    const m = fix.match;
    let teamA = m[0], teamB = m[1];
    if (teamA !== wc.userTeam) { teamA = m[1]; teamB = m[0]; }
    const groupIdx = fix.groupIdx, round = wc.groupRound;
    startWCMatch(teamA, teamB, (sc) => {
        const g = wc.groups[groupIdx];
        let aG, bG;
        if (teamA === m[0]) { aG = sc[0]; bG = sc[1]; }
        else { aG = sc[1]; bG = sc[0]; }
        updateGroupTable(g, m[0], m[1], [aG, bG]);
        simOtherGroupMatches(round);
        wc.groupRound++;
        if (wc.groupRound >= 3) advanceGroupStage();
        else showGroupStandings();
    });
}

function simWCGroupRound() {
    const round = wc.groupRound;
    for (let g = 0; g < 12; g++) {
        const grp = wc.groups[g];
        grp.fixtures[round].forEach(m => {
            const s = simulateScore(m[0], m[1]);
            updateGroupTable(grp, m[0], m[1], s);
        });
    }
    wc.groupRound++;
    if (wc.groupRound >= 3) advanceGroupStage();
    else showGroupStandings();
}

function advanceGroupStage() {
    const sortedGroups = wc.groups.map(g => ({ name: g.name, sorted: sortGroup(g) }));
    const winners = sortedGroups.map(s => s.sorted[0][0]);
    const runners = sortedGroups.map(s => s.sorted[1][0]);
    const thirds = sortedGroups.map(s => ({
        team: s.sorted[2][0], pts: s.sorted[2][1].pts,
        gd: s.sorted[2][1].gd, gf: s.sorted[2][1].gf
    }));
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const best8 = thirds.slice(0, 8).map(t => t.team);
    const seeds = [];
    for (let i = 0; i < 12; i++) { seeds.push(winners[i]); if (i < 8) seeds.push(best8[i]); }
    for (let i = 0; i < 12; i++) seeds.push(runners[i]);
    const matches = [];
    for (let i = 0; i < 16; i++) {
        matches.push({ a: seeds[i], b: seeds[31 - i], aScore: null, bScore: null, winner: null, decidedByPen: false });
    }
    wc.knockout = { round: 'r32', rounds: { r32: matches, r16: [], qf: [], sf: [], final: [] } };
    wc.stage = 'r32';
    showKnockout();
}

function showKnockout() {
    const ko = wc.knockout;
    const roundNames = { r32: '32强', r16: '16强', qf: '1/4决赛', sf: '半决赛', final: '决赛' };
    const matches = ko.rounds[ko.round];
    const allDone = matches.every(m => m.winner);
    const userMatch = matches.find(m => m.a === wc.userTeam || m.b === wc.userTeam);
    const userAlive = !!userMatch;
    let h = `<h1>🌍 ${roundNames[ko.round]}</h1><div class="tag">2026 世界杯 · 淘汰赛</div>`;
    if (!userAlive) {
        h += `<p style="color:#888">你的球队 ${wc.userTeam} 已被淘汰，继续观赛</p>`;
    } else {
        h += `<p>你的球队：<b style="color:#ffd60a">${wc.userTeam}</b>${userMatch.winner === wc.userTeam ? '（已晋级）' : ''}</p>`;
    }
    h += `<div class="wc-scroll"><div class="wc-bracket"><div class="wc-ko-round">${roundNames[ko.round]}</div>`;
    matches.forEach(m => {
        const isUser = m.a === wc.userTeam || m.b === wc.userTeam;
        const decided = m.winner !== null;
        h += `<div class="wc-kmatch${isUser ? ' wc-kmatch-user' : ''}">`;
        h += `<div class="${decided && m.winner === m.a ? 'wc-win' : ''}">${m.a}${decided ? ` <b>${m.aScore}</b>` : ''}</div>`;
        h += `<div class="${decided && m.winner === m.b ? 'wc-win' : ''}">${m.b}${decided ? ` <b>${m.bScore}</b>` : ''}</div>`;
        if (decided && m.decidedByPen) h += `<div class="small" style="color:#ffd60a">点球决胜</div>`;
        h += `</div>`;
    });
    h += `</div></div>`;
    h += `<div class="btns" style="margin-top:14px">`;
    if (!allDone) {
        if (userAlive && !userMatch.winner) h += `<button class="btn btn-primary" data-wcact="playko">比赛（你的场次）</button>`;
        h += `<button class="btn btn-secondary" data-wcact="simko">模拟本轮</button>`;
    }
    h += `</div>`;
    showPanel(h);
}

function simKOMatch(m) {
    if (m.winner) return;
    const s = simulateScore(m.a, m.b);
    let aG = s[0], bG = s[1];
    let winner;
    if (aG === bG) {
        const ra = ntRating(m.a), rb = ntRating(m.b);
        const aWins = Math.random() < (0.5 + (ra - rb) * 0.025);
        winner = aWins ? m.a : m.b;
        m.decidedByPen = true;
        if (aWins) { aG = 5; bG = 4; } else { aG = 4; bG = 5; }
    } else { winner = aG > bG ? m.a : m.b; }
    m.aScore = aG; m.bScore = bG; m.winner = winner;
}

function simKnockoutRound() {
    const ko = wc.knockout;
    ko.rounds[ko.round].forEach(m => simKOMatch(m));
    advanceKnockout();
}

function playWCKnockoutMatch() {
    const ko = wc.knockout;
    const userMatch = ko.rounds[ko.round].find(m => (m.a === wc.userTeam || m.b === wc.userTeam) && !m.winner);
    if (!userMatch) return;
    const userIsA = userMatch.a === wc.userTeam;
    const teamA = wc.userTeam, teamB = userIsA ? userMatch.b : userMatch.a;
    startWCMatch(teamA, teamB, (sc) => {
        let aG, bG;
        if (userIsA) { aG = sc[0]; bG = sc[1]; }
        else { aG = sc[1]; bG = sc[0]; }
        let winner;
        if (aG > bG) winner = userMatch.a;
        else if (bG > aG) winner = userMatch.b;
        else {
            const ra = ntRating(userMatch.a), rb = ntRating(userMatch.b);
            const aWins = Math.random() < (0.5 + (ra - rb) * 0.025);
            winner = aWins ? userMatch.a : userMatch.b;
            userMatch.decidedByPen = true;
            if (aWins) { aG = 5; bG = 4; } else { aG = 4; bG = 5; }
        }
        userMatch.aScore = aG; userMatch.bScore = bG; userMatch.winner = winner;
        ko.rounds[ko.round].forEach(m => { if (m !== userMatch) simKOMatch(m); });
        advanceKnockout();
    });
}

function advanceKnockout() {
    const ko = wc.knockout;
    const matches = ko.rounds[ko.round];
    if (matches.some(m => !m.winner)) { showKnockout(); return; }
    if (ko.round === 'final') {
        wc.champion = matches[0].winner; wc.stage = 'over';
        showTrophy(); return;
    }
    const order = ['r32', 'r16', 'qf', 'sf', 'final'];
    const idx = order.indexOf(ko.round);
    const next = [];
    for (let i = 0; i < matches.length; i += 2) {
        next.push({ a: matches[i].winner, b: matches[i + 1].winner, aScore: null, bScore: null, winner: null, decidedByPen: false });
    }
    const nextName = order[idx + 1];
    ko.rounds[nextName] = next; ko.round = nextName; wc.stage = nextName;
    showKnockout();
}

function showTrophy() {
    const isUser = wc.champion === wc.userTeam;
    let h;
    if (isUser) {
        h = `<h1>🏆 大力神杯</h1><div class="tag">2026 世界杯冠军</div><div class="wc-trophy">
<div style="font-size:72px;margin:10px 0">🎉🏆🎉</div>
<p style="font-size:24px;color:#ffd60a;font-weight:800;margin:14px 0">${wc.userTeam} 夺得 2026 世界杯冠军！</p>
<p>从小组赛到决赛，你一路披荆斩棘，登顶世界之巅！</p></div>`;
    } else {
        h = `<h1>🏆 世界杯结束</h1><div class="tag">2026 世界杯</div><div class="wc-trophy">
<div style="font-size:54px;margin:10px 0">🏆</div>
<p style="font-size:22px;color:#fff;margin:14px 0">冠军：<b style="color:#ffd60a">${wc.champion}</b></p>
<p style="color:#888">你的球队 ${wc.userTeam} 未能夺冠，下次再战！</p></div>`;
    }
    h += `<div class="btns" style="margin-top:18px"><button class="btn btn-primary" data-wcact="newwc">再战一届</button><button class="btn btn-ghost" data-wcact="menu">返回菜单</button></div>`;
    showPanel(h);
}

// ==============================================================
// 世界杯比赛
// ==============================================================

function startWCMatch(teamA, teamB, callback) {
    wc._matchCallback = callback;
    wc._matchTeams = [teamA, teamB];
    mode = 'match'; score = [0, 0]; matchTime = selectedTime; timer = matchTime;
    document.getElementById('sRed').textContent = '0';
    document.getElementById('sBlue').textContent = '0';
    document.getElementById('penHUD').style.display = 'none';
    setupWCTeams(teamA, teamB);
    document.getElementById('redName').textContent = teamA;
    document.getElementById('blueName').textContent = teamB;
    kickoff();
    hideOverlay();
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('mctrl').classList.add('show');
    }
}

function setupWCTeams(teamA, teamB) {
    players = [];
    const form = FORMATIONS[selectedFormation] || FORMATIONS['4-3-3'];
    buildWCTeam(TEAM_RED, form, teamA);
    buildWCTeam(TEAM_BLUE, form, teamB);
    activeIdx = players.findIndex(p => p.team === TEAM_RED && p.role === 'FWD');
    if (activeIdx < 0) activeIdx = 0;
}

function buildWCTeam(team, form, teamName) {
    const pool = ntPlayers(teamName);
    const cnt = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    form.forEach(f => {
        const [x, y, role] = f;
        const arr = pool[role] || [];
        const name = arr[cnt[role] % arr.length] || (teamName + '#' + (cnt[role] + 1));
        cnt[role]++;
        const sx = x * SX, sy = y * SY;
        const px = team === TEAM_RED ? sx : FW - sx;
        const p = makePlayer(px, sy, team, role === 'GK', role);
        p.name = name;
        players.push(p);
    });
}
