import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';

export default function Draw() {
  useGame(); // 订阅 wcTick 触发重渲染
  const wc = game.getWC();
  if (!wc) return null;

  return (
    <>
      <h1>🌍 抽签结果</h1>
      <div className="tag">2026 世界杯 · 小组赛</div>
      <p>你的国家队：<b style={{ color: '#ffd60a' }}>{wc.userTeam}</b></p>
      <div className="wc-scroll">
        <div className="wc-groups">
          {wc.groups.map((g) => {
            const isUser = g.teams.includes(wc.userTeam);
            return (
              <div key={g.name} className={`wc-group${isUser ? ' wc-group-user' : ''}`}>
                <div className="wc-group-name">{g.name}组{isUser ? ' · 你的组' : ''}</div>
                {g.teams.map((t) => (
                  <div key={t} className={`wc-gt${t === wc.userTeam ? ' wc-gt-user' : ''}`}>{t}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="btns" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => game.uiWCAct('startgroup')}>开始小组赛</button>
        <button className="btn btn-ghost" onClick={() => game.uiMode('menu')}>返回菜单</button>
      </div>
    </>
  );
}
