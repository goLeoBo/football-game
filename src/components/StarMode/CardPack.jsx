import { useState } from 'react';
import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';
import { rollCardPack, STAR_CARDS_DEDUP } from '../../engine/data.js';
import { rarity } from './cards.js';
import StarCard from './StarCard.jsx';

// 抽卡大厅：一键开包（每包5张）
export default function CardPack(){
  const { myCards = [] } = useGame();
  const [drawing, setDrawing] = useState(false);
  const [packs, setPacks] = useState([]);       // 近期抽到的卡包
  const [flash, setFlash] = useState(null);

  const openPack = () => {
    if(drawing) return;
    setDrawing(true);
    const pack = rollCardPack(myCards);
    setTimeout(()=>{
      game.addCards(pack);
      setPacks(a=>[pack, ...a].slice(0, 6));
      const top = pack.reduce((a,b)=> a.rating>=b.rating ? a : b);
      setFlash(rarity(top.rating));
      setDrawing(false);
    }, 700);
  };

  const total = myCards.length;
  const goldCount = myCards.filter(c=>c.rating>=90).length;

  return (
    <div className="card-pack">
      <h1>🌟 球星卡</h1>
      <p className="tag">收集球星 · 组队迎战俱乐部</p>

      <div className="cp-counters">
        <div className="cp-count">拥有 <b>{total}</b> 张</div>
        <div className="cp-count gold">金卡 <b>{goldCount}</b></div>
        <small className="cp-hint">共 {STAR_CARDS_DEDUP.length} 名球星可收集</small>
      </div>

      <button className="cp-open" disabled={drawing} onClick={openPack}>
        {drawing ? '开包中…' : `🎁 开启一包（5张）`}
      </button>

      {flash && <div className={`cp-flash ${flash}`}>✦ {flash==='gold'?'史诗金卡':'好卡'} ✦</div>}

      <div className="cp-packs">
        {packs.map((pack, idx)=>(
          <div className="cp-pack" key={idx}>
            <div className="cp-pack-label">本包 × {pack.length}</div>
            <div className="cp-cards">
              {pack.map(c=>(<StarCard key={c.uid} card={c} />))}
            </div>
          </div>
        ))}
        {packs.length===0 && <p className="cp-empty">还没有抽卡，快来开第一包吧！</p>}
      </div>

      <div className="cp-actions">
        <button className="btn btn-primary" onClick={()=>game.showStarTeam()} disabled={total===0}>去组队开赛 →</button>
        <button className="btn btn-ghost" onClick={()=>game.goMenu()}>返回</button>
      </div>
    </div>
  );
}
