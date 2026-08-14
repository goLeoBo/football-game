import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';

export default function Trophy() {
  useGame();
  const wc = game.getWC();
  if (!wc || !wc.champion) return null;

  const isUser = wc.champion === wc.userTeam;
  return (
    <>
      {isUser ? (
        <>
          <h1>🏆 大力神杯</h1>
          <div className="tag">2026 世界杯冠军</div>
          <div className="wc-trophy">
            <div style={{ fontSize: 72, margin: '10px 0' }}>🎉🏆🎉</div>
            <p style={{ fontSize: 24, color: '#ffd60a', fontWeight: 800, margin: '14px 0' }}>
              {wc.userTeam} 夺得 2026 世界杯冠军！
            </p>
            <p>从小组赛到决赛，你一路披荆斩棘，登顶世界之巅！</p>
          </div>
        </>
      ) : (
        <>
          <h1>🏆 世界杯结束</h1>
          <div className="tag">2026 世界杯</div>
          <div className="wc-trophy">
            <div style={{ fontSize: 54, margin: '10px 0' }}>🏆</div>
            <p style={{ fontSize: 22, color: '#fff', margin: '14px 0' }}>
              冠军：<b style={{ color: '#ffd60a' }}>{wc.champion}</b>
            </p>
            <p style={{ color: '#888' }}>你的球队 {wc.userTeam} 未能夺冠，下次再战！</p>
          </div>
        </>
      )}
      <div className="btns" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" onClick={() => game.uiWCAct('newwc')}>再战一届</button>
        <button className="btn btn-ghost" onClick={() => game.uiWCAct('menu')}>返回菜单</button>
      </div>
    </>
  );
}
