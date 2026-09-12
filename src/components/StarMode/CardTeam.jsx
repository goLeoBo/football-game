import { useMemo, useState } from 'react';
import { game } from '../../engine/engine.js';
import { useGame } from '../../engine/store.js';
import { FORMATIONS, STAR_CARDS_DEDUP } from '../../engine/data.js';
import { POS_EMOJI, POS_NAME, rarity, rarityBorder } from './cards.js';

const FORMS = ['4-3-3','4-4-2','3-5-2'];

export default function CardTeam(){
  const { myCards = [], selectedFormation } = useGame();
  const [form, setForm] = useState(selectedFormation || '4-3-3');
  const [filter, setFilter] = useState('ALL');
  const [pick, setPick] = useState(null);   // 本页面手选的首发名单 uid 集合
  const [toast, setToast] = useState('');

  // 需要的人数
  const need = useMemo(()=>{
    const slots = FORMATIONS[form] || FORMATIONS['4-3-3'];
    const n = { GK:0, DEF:0, MID:0, FWD:0 };
    slots.forEach(s=>n[s[2]]++);
    return n;
  }, [form]);

  const shown = useMemo(()=>{
    const list = [...(myCards||[])].sort((a,b)=>b.rating-a.rating);
    return filter==='ALL' ? list : list.filter(c=>c.pos===filter);
  }, [myCards, filter]);

  const countsByPos = useMemo(()=>{
    const c = {GK:0,DEF:0,MID:0,FWD:0};
    (myCards||[]).forEach(x=>c[x.pos]++);
    return c;
  }, [myCards]);

  const autoPick = () => {
    const chosen = [];
    const sorted = [...(myCards||[])].sort((a,b)=>b.rating-a.rating);
    for(const pos of ['GK','DEF','MID','FWD']){
      const take = sorted.filter(c=>c.pos===pos).slice(0, need[pos]);
      chosen.push(...take);
    }
    setPick(new Set(chosen.map(c=>c.uid)));
    setToast(`已自动指派首发 ${chosen.length} 人`);
  };

  const toggle = (card) => {
    setPick(prev=>{
      const s = new Set(prev||[]);
      if(s.has(card.uid)) s.delete(card.uid);
      else if(s.size < 11) s.add(card.uid);
      else setToast('首发最多 11 人');
      return s;
    });
  };

  const start = () => {
    let chosen = (myCards||[]).filter(c=>pick && pick.has(c.uid));
    if(chosen.length===0) chosen = autoBest();
    // 不足 11 人时用卡池补齐
    if(chosen.length < 11){
      const used = new Set(chosen.map(c=>c.id));
      for(const pos of ['GK','DEF','MID','FWD']){
        const have = chosen.filter(c=>c.pos===pos).length;
        const extra = STAR_CARDS_DEDUP.filter(c=>c.pos===pos && !used.has(c.id)).slice(0, need[pos]-have);
        chosen.push(...extra.map(c=>({...c, uid:c.id+'_ai'})));
      }
    }
    game.startStarMatch(chosen.slice(0,11));
  };

  const autoBest = () => {
    const chosen = [];
    const sorted = [...(myCards||[])].sort((a,b)=>b.rating-a.rating);
    for(const pos of ['GK','DEF','MID','FWD']) chosen.push(...sorted.filter(c=>c.pos===pos).slice(0, need[pos]));
    return chosen;
  };

  const inStart = (c)=> pick ? pick.has(c.uid) : false;
  const startNames = (myCards||[]).filter(c=>pick && pick.has(c.uid)).sort((a,b)=>b.rating-a.rating);
  const startCount = (pick?pick.size:0);

  return (
    <div className="card-team">
      <h1>🛡️ 组建首发</h1>
      <p className="tag">用你的球星卡，排出一支能打赢俱乐部的阵容</p>

      <div className="ct-need">
        {['GK','DEF','MID','FWD'].map(pos=>(
          <div key={pos} className="ct-need-pos" data-ok={countsByPos[pos]>=need[pos]}>
            {POS_EMOJI[pos]} {POS_NAME[pos]}: {countsByPos[pos]}/{need[pos]}
          </div>
        ))}
      </div>

      <div className="sel-label" style={{marginTop:14}}>阵型</div>
      <div className="sel-btns">
        {FORMS.map(f=>(
          <button key={f} className={`chip${f===form?' active':''}`} onClick={()=>setForm(f)}>{f}</button>
        ))}
      </div>

      <div className="sel-label" style={{marginTop:14}}>筛选位置</div>
      <div className="sel-btns">
        <button className={`chip${filter==='ALL'?' active':''}`} onClick={()=>setFilter('ALL')}>全部</button>
        {['GK','DEF','MID','FWD'].map(pos=>(
          <button key={pos} className={`chip${filter===pos?' active':''}`} onClick={()=>setFilter(pos)}>
            {POS_NAME[pos]}
          </button>
        ))}
      </div>

      <div className="ct-startbar">
        <span>首发阵容：<b>{startCount}</b>/11</span>
        <button className="btn btn-ghost" onClick={()=>{ autoPick(); }}>⚡ 自动指派</button>
      </div>
      {startNames.length>0 && (
        <div className="ct-startline">
          首发：{startNames.map(c=>c.name).join(' · ')}
        </div>
      )}

      <div className="ct-grid">
        {shown.map(c=>(
          <button key={c.uid||c.id} className={`star-card mini r-${rarity(c.rating)}${inStart(c)?' picked':''}`}
            style={{ background: rarityBorder(rarity(c.rating)) }} onClick={()=>toggle(c)}>
            <div className="sc-top"><span className="sc-rating">{c.rating}</span><span className="sc-pos">{POS_EMOJI[c.pos]}</span></div>
            <div className="sc-emoji">{POS_EMOJI[c.pos]}</div>
            <div className="sc-name">{c.name}</div>
            <div className="sc-club">{c.club||''}</div>
            {inStart(c) && <div className="sc-picked">首发 ✓</div>}
          </button>
        ))}
        {shown.length===0 && <p className="ct-empty">该位置还没有卡片，去抽卡吧。</p>}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="cp-actions">
        <button className="btn btn-primary" onClick={start}>⚽ 开赛！</button>
        <button className="btn btn-ghost" onClick={()=>game.showStarPack()}>再抽几包</button>
        <button className="btn btn-ghost" onClick={()=>game.goMenu()}>返回</button>
      </div>
    </div>
  );
}
