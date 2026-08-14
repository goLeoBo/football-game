import { useState } from 'react';
import { game } from '../../engine/engine.js';

// 复刻原 flagHTML：优先俱乐部 png → 国旗 svg → 首字母圆形头像 fallback
export default function TeamFlag({ name, avatarText }) {
  const { CLUB_LOGO, NT_FLAG, CLUB_LOGO_BASE, FLAG_BASE } = game.data;
  const [imgFailed, setImgFailed] = useState(false);

  const club = CLUB_LOGO[name];
  const iso = NT_FLAG[name];
  const src = club ? encodeURI(CLUB_LOGO_BASE + club) : (iso ? (FLAG_BASE + iso + '.svg') : '');
  const color = game.helpers.avatarColor(name);

  if (src && !imgFailed) {
    return (
      <span className="t">
        <span className="avatar" style={{ background: color, display: 'none' }}>{avatarText}</span>
        <img
          className="flag"
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }
  return <span className="avatar" style={{ background: color }}>{avatarText}</span>;
}
