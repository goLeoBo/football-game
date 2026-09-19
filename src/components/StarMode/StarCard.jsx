import { POS_EMOJI, rarity, rarityBorder } from './cards.js';
import { playerPhoto } from './playerPhotos.js';

function StatRow({ k, v }) {
  return (
    <div className="sc-stat">
      <span>{k}</span>
      <div className="sc-bar"><i style={{ width: `${Math.min(100, v)}%` }} /></div>
      <b>{v}</b>
    </div>
  );
}

// 球星卡：顶部为球员照片，下面是姓名/俱乐部/能力值。
// 照片缺失或加载失败时自动回退成位置图标，不会出现空白。
export default function StarCard({ card, mini = false, picked = false, onClick, showStats = true }) {
  const r = rarity(card.rating);
  const photo = playerPhoto(card.id);

  return (
    <div
      className={`star-card r-${r}${mini ? ' mini' : ''}${picked ? ' picked' : ''}`}
      style={{ background: rarityBorder(r) }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="sc-photo">
        <span className="sc-emoji">{POS_EMOJI[card.pos] || '⚽'}</span>
        {photo && (
          <img
            className="sc-img"
            src={photo}
            alt={card.name}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <span className="sc-photo-fade" />
        <span className="sc-rating">{card.rating}</span>
        <span className="sc-pos">{POS_EMOJI[card.pos] || '⚽'}</span>
      </div>

      <div className="sc-name">{card.name}</div>
      <div className="sc-club">{card.club || ''}</div>

      {showStats && (
        <div className="sc-stats">
          <StatRow k="速度" v={card.speed} />
          <StatRow k="射门" v={card.shoot} />
          <StatRow k="传球" v={card.pass} />
          <StatRow k="抢断" v={card.tackle} />
        </div>
      )}

      {picked && <div className="sc-picked">首发 ✓</div>}
    </div>
  );
}
