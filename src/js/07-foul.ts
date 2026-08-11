// =================================================================
// 07-foul.js — 犯规与红黄牌系统
// 绿茵对决 · 足球游戏
//
// 铲球犯规判定基于 body mechanics：
//   • 背后铲球（dotBack < -0.3）：高风险
//   • 侧面铲球（-0.3 ≤ dotBack < 0.3）：中等风险
//   • 正面铲球：不犯规
//
// 出牌逻辑：
//   • 红牌：暴力背后铲球（power > 0.75）或两黄变红
//   • 黄牌：背后中高强度铲球，或累计犯规 ≥ 8 次
//   • 无牌犯规：仅判罚任意球
// =================================================================

// 普通犯规：判任意球，不出牌，不回放
function callFoul(tackler, fx, fy, direct = true) {
    const defTeam = tackler.team === TEAM_RED ? TEAM_BLUE : TEAM_RED;
    const fkX = clamp(fx !== undefined ? fx : tackler.x, WALL + 30, FW - WALL - 30);
    const fkY = clamp(fy !== undefined ? fy : tackler.y, WALL + 30, FH - WALL - 30);
    playWhistle();
    playCrowdGroan(0.8);
    startFreeKick(fkX, fkY, defTeam, direct);
}

// 铲球犯规检测（在铲球物理碰撞后调用）
// 返回 true 表示犯规成立（已处理）
function checkTackleFoul(tackler, victim) {
    if (replayActive) return false;

    // 计算铲球方向 vs 被铲球员朝向
    const dx = victim.x - tackler.x, dy = victim.y - tackler.y;
    const dl = Math.hypot(dx, dy) || 1;
    const vFace = victim.face;
    const dotBack = (dx / dl) * vFace.x + (dy / dl) * vFace.y;
    // dotBack > 0 = 正面, < 0 = 背后

    const power = tackler.slidePower || 0.5;

    if (!tackler.fouls) tackler.fouls = 0;
    tackler.fouls++;

    const foulX = (tackler.x + victim.x) / 2;
    const foulY = (tackler.y + victim.y) / 2;
    const isBehind = dotBack < -0.3;
    const isSide = dotBack >= -0.3 && dotBack < 0.3;

    // 红牌：暴力背后铲球（power > 0.75）→ 回放
    if (isBehind && power > 0.75) {
        startReplay({ player: tackler, color: 'red', reason: '暴力背后铲球', foulX, foulY });
        return true;
    }

    // 两黄变红 → 回放
    if (tackler.cards >= 1 && isBehind && power > 0.6) {
        startReplay({ player: tackler, color: 'red', reason: '两黄变一红', foulX, foulY });
        return true;
    }

    // 黄牌：背后中高强度铲球（power > 0.55）
    if (isBehind && power > 0.55) {
        executeShowCard(tackler, 'yellow', '背后危险铲球', foulX, foulY);
        return true;
    }

    // 累计犯规 ≥ 8 次出黄牌
    if (tackler.fouls >= 8) {
        executeShowCard(tackler, 'yellow', '累计犯规', foulX, foulY);
        return true;
    }

    // 背后中等强度 → 直接任意球（无牌）
    if (isBehind && power > 0.5) {
        callFoul(tackler, foulX, foulY, true);
        return true;
    }

    // 侧面中等强度以上 → 间接任意球
    if (isSide && power > 0.6) {
        callFoul(tackler, foulX, foulY, false);
        return true;
    }

    // 正常拼抢，不犯规
    return false;
}

// 出示红/黄牌
function executeShowCard(player, color, reason, foulX, foulY) {
    player.cards += 1;
    const cardText = color === 'red' ? '红牌罚下！' : '黄牌警告';
    showMsg(`${player.name} ${cardText}（${reason}）`, 2200);
    playCardWhistle(color);

    if (color === 'red' || player.cards >= 2) {
        player.sentOff = true;
        const side = player.team === TEAM_RED ? -60 : FW + 60;
        player.x = side; player.y = FH / 2; player.vx = 0; player.vy = 0;
        // 如果当前控制的是被罚下球员，切换
        if (players[activeIdx] === player) {
            const next = players.findIndex(p => p.team === player.team && !p.sentOff && !p.gk);
            if (next >= 0) activeIdx = next;
        }
    }

    // 对方获得直接任意球
    const defTeam = player.team === TEAM_RED ? TEAM_BLUE : TEAM_RED;
    const fkX = clamp(foulX !== undefined ? foulX : player.x, WALL + 30, FW - WALL - 30);
    const fkY = clamp(foulY !== undefined ? foulY : player.y, WALL + 30, FH - WALL - 30);
    startFreeKick(fkX, fkY, defTeam, true);
    setPieceMsg = color === 'red' ? '红牌·直接任意球' : '黄牌·直接任意球';
}
