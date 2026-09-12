// 球星卡展示辅助：稀有度/位置 → 样式与 emoji
export const POS_EMOJI = { FWD:'⚽', MID:'🎯', DEF:'🛡️', GK:'🧤' };
export const POS_NAME = { FWD:'前锋', MID:'中场', DEF:'后卫', GK:'门将' };

export function rarity(rating){
  if(rating>=90) return 'gold';
  if(rating>=80) return 'silver';
  return 'bronze';
}

// 卡面主色（稀有度 → CSS 变量语义）
export function rarityColor(r){
  if(r==='gold') return '#3a2f00';
  if(r==='silver') return '#2a3340';
  return '#3a2a18';
}
export function rarityBorder(r){
  if(r==='gold') return 'linear-gradient(160deg,#ffe066,#c99700,#ffe066)';
  if(r==='silver') return 'linear-gradient(160deg,#e8f0ff,#9fb8d0,#e8f0ff)';
  return 'linear-gradient(160deg,#e0a87a,#9c6b45,#e0a87a)';
}
export function statBar(v){ return Math.max(10, Math.min(100, v)); }
