// =================================================================
// TeamBadge.tsx — 队徽组件（React）
//
// 用法：
//   <TeamBadge name="巴西" />
//   <TeamBadge name="皇家马德里" />   // 无在线SVG → 首字母圆形头像 fallback
//
// 依赖：仅需引入本文件，无第三方库。CSS 见下方 TeamBadge.css。
//
// 说明：
//   - 国家队国旗来自 flagcdn.com（真实 SVG，稳定直链）。
//   - 俱乐部（皇马/巴萨等）目前无可靠的在线 SVG 直链源，
//     故统一走首字母圆形头像 fallback（正符合「找不到就用首字母头像」的需求）。
//   - 若你有可用的俱乐部 SVG 直链，把它加进 CLUB_LOGO 映射即可自动启用 <img>。
// =================================================================

import { useState } from 'react';
import './TeamBadge.css';

// 国家队 → ISO 3166-1 alpha-2 国旗代码（flagcdn）
const NT_FLAG: Record<string, string> = {
  '巴西': 'br', '阿根廷': 'ar', '法国': 'fr', '英格兰': 'gb-eng', '西班牙': 'es', '葡萄牙': 'pt',
  '德国': 'de', '意大利': 'it', '荷兰': 'nl', '比利时': 'be', '克罗地亚': 'hr', '墨西哥': 'mx',
  '乌拉圭': 'uy', '哥伦比亚': 'co', '美国': 'us', '瑞士': 'ch', '日本': 'jp', '摩洛哥': 'ma',
  '丹麦': 'dk', '塞内加尔': 'sn', '塞尔维亚': 'rs', '瑞典': 'se', '波兰': 'pl', '威尔士': 'gb-wls',
  '韩国': 'kr', '土耳其': 'tr', '伊朗': 'ir', '智利': 'cl', '厄瓜多尔': 'ec', '乌克兰': 'ua',
  '尼日利亚': 'ng', '秘鲁': 'pe', '奥地利': 'at', '捷克': 'cz', '巴拉圭': 'py', '喀麦隆': 'cm',
  '埃及': 'eg', '加拿大': 'ca', '突尼斯': 'tn', '阿尔及利亚': 'dz', '科特迪瓦': 'ci', '哥斯达黎加': 'cr',
  '澳大利亚': 'au', '沙特阿拉伯': 'sa', '南非': 'za', '卡塔尔': 'qa', '牙买加': 'jm', '洪都拉斯': 'hn',
};

// 俱乐部 → 在线队徽（football-logos 仓库 png，经 jsDelivr CDN 直链）
// 路径内空格由 encodeURI 处理，此处保持可读写法。
const CLUB_LOGO: Record<string, string> = {
  '皇家马德里': 'Spain - LaLiga/Real Madrid.png',
  '巴塞罗那': 'Spain - LaLiga/FC Barcelona.png',
  '拜仁慕尼黑': 'Germany - Bundesliga/Bayern Munich.png',
  '利物浦': 'England - Premier League/Liverpool FC.png',
  '曼城': 'England - Premier League/Manchester City.png',
  '巴黎圣日耳曼': 'France - Ligue 1/Paris Saint-Germain.png',
  '尤文图斯': 'Italy - Serie A/Juventus FC.png',
  'AC米兰': 'Italy - Serie A/AC Milan.png',
  '国际米兰': 'Italy - Serie A/Inter Milan.png',
  '阿森纳': 'England - Premier League/Arsenal FC.png',
};

const FLAG_BASE = 'https://flagcdn.com/';
const CLUB_LOGO_BASE = 'https://cdn.jsdelivr.net/gh/luukhopman/football-logos@master/logos/';

const AVATAR_COLORS = [
  '#0068a8', '#a50044', '#c8102e', '#6cabdd', '#dc052d',
  '#1c2c5b', '#007a5e', '#8a5a00', '#5b2d8e', '#0a7a8a',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initialOf(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase();
}

interface TeamBadgeProps {
  name: string;          // 球队名称（中文或英文均可）
  size?: number;         // 统一尺寸，默认 40（px）
  avatarText?: string;   // 头像文字，默认取 name 首字母
  alt?: string;          // img 的 alt，默认用 name
}

export function TeamBadge({ name, size = 40, avatarText, alt }: TeamBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const clubUrl = CLUB_LOGO[name];
  const iso = NT_FLAG[name];
  const src = clubUrl
    ? encodeURI(CLUB_LOGO_BASE + clubUrl)
    : iso ? `${FLAG_BASE}${iso}.svg` : '';
  const showImg = src && !imgFailed;

  const fallback = (
    <span
      className="team-badge__avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(name) }}
    >
      {avatarText ?? initialOf(name)}
    </span>
  );

  if (!showImg) return fallback;

  return (
    <>
      {fallback}
      <img
        className="team-badge__img"
        src={src}
        alt={alt ?? name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    </>
  );
}

// 对阵行（左队 + 队徽 / VS / 右队 + 队徽）
interface FixtureRowProps {
  home: string;
  away: string;
  size?: number;
}

export function FixtureRow({ home, away, size = 40 }: FixtureRowProps) {
  return (
    <div className="team-badge__fixture-row">
      <span className="team-badge__side">
        <TeamBadge name={home} size={size} />
        <span className="team-badge__name">{home}</span>
      </span>
      <span className="team-badge__vs">VS</span>
      <span className="team-badge__side team-badge__side--right">
        <span className="team-badge__name">{away}</span>
        <TeamBadge name={away} size={size} />
      </span>
    </div>
  );
}
