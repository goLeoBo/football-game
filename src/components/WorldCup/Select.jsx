import { game } from '../../engine/engine.js';
import { NATIONAL_TEAMS } from '../../engine/data.js';

export default function Select() {
  const pots = [0, 1, 2, 3].map((p) => NATIONAL_TEAMS.slice(p * 12, (p + 1) * 12));
  return (
    <>
      <h1>🌍 2026 世界杯</h1>
      <div className="tag">48队 · 12组 · 大力神杯</div>
      <p>选择你心仪的国家队，开启夺冠征程</p>
      {pots.map((pot, p) => (
        <div key={p}>
          <div className="wc-pot-label">第 {p + 1} 档</div>
          <div className="wc-teams">
            {pot.map((t) => (
              <button key={t.name} className="wc-team" onClick={() => game.uiSelectWCTeam(t.name)}>
                {t.name}
                <span className="wc-rating">{t.rating}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="btns" style={{ marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={() => game.uiMode('menu')}>返回</button>
      </div>
    </>
  );
}
