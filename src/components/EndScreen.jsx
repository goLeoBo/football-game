import { game } from '../engine/engine.js';
import { useGame } from '../engine/store.js';

export default function EndScreen({ kind }) {
  const { screenData } = useGame();
  if (!screenData) return null;
  const { res, cls, red, blue } = screenData;
  const isPenalty = kind === 'penalty';

  return (
    <>
      <h1>{isPenalty ? '点球大战结束' : '比赛结束'}</h1>
      <div className="tag">{isPenalty ? 'PENALTY SHOOTOUT' : 'FULL TIME'}</div>
      <div className={`big ${cls}`}>{res}</div>
      <p style={{ fontSize: 22, color: '#fff' }}>
        红队 {red} : {blue} 蓝队
      </p>
      <div className="btns">
        <button className="btn btn-primary" onClick={() => game.uiMode('match')}>
          {isPenalty ? '友谊赛' : '再来一场'}
        </button>
        <button className="btn btn-ghost" onClick={() => game.uiMode('menu')}>
          返回主菜单
        </button>
      </div>
    </>
  );
}
