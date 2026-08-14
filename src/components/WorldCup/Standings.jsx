import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';
import FixtureRow from './FixtureRow.jsx';

export default function Standings() {
  useGame();
  const wc = game.getWC();
  if (!wc) return null;

  const round = wc.groupRound;
  let userGroup = null;
  for (let g = 0; g < 12; g++) {
    if (wc.groups[g].teams.includes(wc.userTeam)) { userGroup = wc.groups[g]; break; }
  }
  const sorted = (g) => game.helpers.sortGroup(g);
  const userFix = game.helpers.findUserGroupFixture();

  return (
    <>
      <h1>🌍 小组赛 第{round + 1}轮</h1>
      <div className="tag">2026 世界杯</div>
      {userGroup && (
        <p>
          你的组：<b style={{ color: '#ffd60a' }}>{userGroup.name}组</b> · 你的球队：
          <b style={{ color: '#ffd60a' }}>{wc.userTeam}</b>
        </p>
      )}
      <div className="wc-scroll">
        {userGroup && (
          <>
            <table className="wc-table">
              <thead>
                <tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>净</th><th>分</th></tr>
              </thead>
              <tbody>
                {sorted(userGroup).map((row, i) => {
                  const t = row[0], s = row[1];
                  const isUser = t === wc.userTeam;
                  return (
                    <tr key={t} className={isUser ? 'wc-row-user' : ''}>
                      <td>{i + 1}</td><td>{t}</td><td>{s.p}</td><td>{s.w}</td><td>{s.d}</td><td>{s.l}</td>
                      <td>{s.gf}</td><td>{s.ga}</td><td>{s.gd > 0 ? '+' : ''}{s.gd}</td><td><b>{s.pts}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="wc-fixtures">
              <div className="sel-label">本轮对阵</div>
              {userGroup.fixtures[round].map((m, i) => {
                const isUser = m[0] === wc.userTeam || m[1] === wc.userTeam;
                return (
                  <div key={i} className={`wc-fix${isUser ? ' wc-fix-user' : ''}`}>
                    <FixtureRow a={m[0]} b={m[1]} />
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="wc-other-groups">
          <div className="sel-label">其他小组</div>
          {wc.groups.map((g) => {
            if (g === userGroup) return null;
            return (
              <div key={g.name} className="wc-group-mini">
                <b>{g.name}组</b> · {sorted(g).map((r, i) => `${i + 1}.${r[0]}(${r[1].pts})`).join(' ')}
              </div>
            );
          })}
        </div>
      </div>
      <div className="btns" style={{ marginTop: 14 }}>
        {userFix && (
          <button className="btn btn-primary" onClick={() => game.uiWCAct('playgroup')}>比赛（你的场次）</button>
        )}
        <button className="btn btn-secondary" onClick={() => game.uiWCAct('simround')}>模拟本轮</button>
      </div>
    </>
  );
}
