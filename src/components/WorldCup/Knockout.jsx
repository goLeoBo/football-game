import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';
import TeamFlag from './TeamFlag.jsx';

export default function Knockout() {
  useGame();
  const wc = game.getWC();
  if (!wc || !wc.knockout) return null;

  const ko = wc.knockout;
  const roundNames = { r32: '32强', r16: '16强', qf: '1/4决赛', sf: '半决赛', final: '决赛' };
  const matches = ko.rounds[ko.round];
  const allDone = matches.every((m) => m.winner);
  const userMatch = matches.find((m) => m.a === wc.userTeam || m.b === wc.userTeam);
  const userAlive = !!userMatch;
  const initial = (n) => (n || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <h1>🌍 {roundNames[ko.round]}</h1>
      <div className="tag">2026 世界杯 · 淘汰赛</div>
      {!userAlive ? (
        <p style={{ color: '#888' }}>你的球队 {wc.userTeam} 已被淘汰，继续观赛</p>
      ) : (
        <p>你的球队：<b style={{ color: '#ffd60a' }}>{wc.userTeam}</b>{userMatch.winner === wc.userTeam ? '（已晋级）' : ''}</p>
      )}
      <div className="wc-scroll">
        <div className="wc-bracket">
          <div className="wc-ko-round">{roundNames[ko.round]}</div>
          {matches.map((m, i) => {
            const isUser = m.a === wc.userTeam || m.b === wc.userTeam;
            const decided = m.winner !== null;
            return (
              <div key={i} className={`wc-kmatch${isUser ? ' wc-kmatch-user' : ''}`}>
                <div className={`ko-line${decided && m.winner === m.a ? ' wc-win' : ''}`}>
                  <span className="t">
                    <TeamFlag name={m.a} avatarText={initial(m.a)} />
                    <span className="nm">{m.a}</span>
                  </span>
                  {decided && <b>{m.aScore}</b>}
                </div>
                <div className={`ko-line${decided && m.winner === m.b ? ' wc-win' : ''}`}>
                  <span className="t">
                    <TeamFlag name={m.b} avatarText={initial(m.b)} />
                    <span className="nm">{m.b}</span>
                  </span>
                  {decided && <b>{m.bScore}</b>}
                </div>
                {decided && m.decidedByPen && <div className="small" style={{ color: '#ffd60a' }}>点球决胜</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="btns" style={{ marginTop: 14 }}>
        {!allDone && (
          <>
            {userAlive && !userMatch.winner && (
              <button className="btn btn-primary" onClick={() => game.uiWCAct('playko')}>比赛（你的场次）</button>
            )}
            <button className="btn btn-secondary" onClick={() => game.uiWCAct('simko')}>模拟本轮</button>
          </>
        )}
      </div>
    </>
  );
}
