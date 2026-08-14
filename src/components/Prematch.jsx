import { useEffect, useRef, useState } from 'react';
import { game } from '../engine/engine.js';
import { useGame } from '../engine/store.js';
import { PM_CLUBS, PM_FORMATIONS } from '../engine/data.js';

// 阵型 SVG（复刻原 pmFieldSVG，改为 JSX）
function FieldSVG({ formation }) {
  const d = PM_FORMATIONS[formation];
  const dots = [];
  dots.push(<circle key="gk" cx="50" cy="128" r="3.2" fill="#49e0ff" style={{ filter: 'drop-shadow(0 0 2.4px #49e0ff)' }} />);
  d.def.forEach((x, i) => dots.push(<circle key={`d${i}`} cx={x} cy="98" r="3.2" fill="#39ff88" style={{ filter: 'drop-shadow(0 0 2.4px #39ff88)' }} />));
  d.mid.forEach((x, i) => dots.push(<circle key={`m${i}`} cx={x} cy="58" r="3.2" fill="#eafff1" style={{ filter: 'drop-shadow(0 0 2.4px #eafff1)' }} />));
  d.fwd.forEach((x, i) => dots.push(<circle key={`f${i}`} cx={x} cy="22" r="3.2" fill="#ffd166" style={{ filter: 'drop-shadow(0 0 2.4px #ffd166)' }} />));
  return (
    <svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`pmg-${formation}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c5a38" />
          <stop offset="1" stopColor="#0d2b1d" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="136" rx="8" fill={`url(#pmg-${formation})`} stroke="rgba(125,255,176,.5)" strokeWidth="1.6" />
      <line x1="2" y1="70" x2="98" y2="70" stroke="rgba(125,255,176,.4)" />
      <circle cx="50" cy="70" r="14" fill="none" stroke="rgba(125,255,176,.4)" />
      <rect x="28" y="2" width="44" height="16" rx="2" fill="none" stroke="rgba(125,255,176,.4)" />
      <rect x="28" y="122" width="44" height="16" rx="2" fill="none" stroke="rgba(125,255,176,.4)" />
      {dots}
    </svg>
  );
}

// 背景粒子（复刻原 startPM_Particles，改为 React effect）
function Particles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, parts = [];
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      const n = Math.min(70, Math.round(window.innerWidth * window.innerHeight / 16000));
      parts = [];
      for (let i = 0; i < n; i++) {
        const green = Math.random() < 0.62;
        parts.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 2.2 + 0.5,
          vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
          a: Math.random() * 0.5 + 0.16, ph: Math.random() * Math.PI * 2, green,
        });
      }
    }
    window.addEventListener('resize', resize);
    let raf;
    function loop(now) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
        if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12;
        const alpha = p.a * (0.5 + 0.5 * Math.sin(now / 900 + p.ph));
        ctx.beginPath();
        ctx.fillStyle = p.green ? `rgba(125,255,176,${alpha})` : `rgba(73,224,255,${alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    }
    resize();
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);
  return <canvas id="pm-particles" ref={canvasRef} />;
}

function ClubBadge({ club, selected }) {
  const logo = game.helpers.pmLogoURL(club);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      className={`pm-club${selected ? ' selected' : ''}`}
      onClick={() => game.uiPmPickClub(club.name)}
    >
      <div className={`pm-badge${club.dark ? ' pm-dark' : ''}`} style={{ background: club.bg }}>
        {logo && !imgFailed ? (
          <img
            className="pm-badge-img"
            src={logo}
            alt={club.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="pm-badge-text">{club.short}</span>
        )}
      </div>
      <div className="pm-cname">{club.name}</div>
    </div>
  );
}

export default function Prematch() {
  const { selectedFormation, pm } = useGame();
  const info = pm.info || PM_CLUBS[0];
  const opp = pm.opp || PM_CLUBS[1] || PM_CLUBS[0];
  const toast = pm.toast || { text: '', key: 0 };

  return (
    <div id="prematch">
      <div className="pm-bg" />
      <Particles />
      <div className="pm-app">
        <div className="pm-head">
          <div className="pm-kicker">PRE-MATCH · 绿茵对决</div>
          <div className="pm-h1">赛前匹配</div>
          <div className="pm-sub">选择你的阵型与主队，准备开战</div>
        </div>

        <div className={`pm-versus${info.dark ? ' pm-light' : ''}`} id="pmVersus">
          <div className="pm-vbg pm-vbg-base" style={{ background: info.bg }} />
          <div className="pm-vbg pm-vbg-fade" />
          <div className="pm-vrow">
            <div className="pm-team">
              <div className={`pm-crest${info.dark ? ' pm-dark' : ''}`} style={{ background: info.bg }}>
                {info.short}
              </div>
              <div className="pm-tname">{info.name}</div>
              <div className="pm-tinfo">主队 · 你操控</div>
            </div>
            <div className="pm-vs">VS</div>
            <div className="pm-team">
              <div className={`pm-crest${opp.dark ? ' pm-dark' : ''}`} style={{ background: opp.bg }}>
                {opp.short}
              </div>
              <div className="pm-tname">{opp.name}</div>
              <div className="pm-tinfo">对手</div>
            </div>
          </div>
          <div className="pm-theme">主题配色 · <b>{info.name}</b></div>
        </div>

        <div className="pm-sec-title">
          阵型选择<span className="pm-hint">点击切换 · 4-3-3 默认</span>
        </div>
        <div className="pm-formation-row">
          {['4-3-3', '4-4-2', '3-5-2'].map((f) => (
            <div
              key={f}
              className={`pm-fcard${f === selectedFormation ? ' selected' : ''}`}
              onClick={() => game.uiPmSetFormation(f)}
            >
              <FieldSVG formation={f} />
              <div className="pm-fname">{f}</div>
            </div>
          ))}
        </div>

        <div className="pm-sec-title">
          俱乐部配色<span className="pm-hint">左右滑动 · 选中为主队</span>
        </div>
        <div className="pm-clubs-scroll">
          {PM_CLUBS.map((c) => (
            <ClubBadge key={c.name} club={c} selected={c === pm.selClub} />
          ))}
        </div>

        <button className="pm-battle" onClick={() => game.uiPmBattle()}>开 战</button>
        <button className="pm-more" onClick={() => game.uiPmMore()}>🌍 世界杯模式</button>
      </div>
      <div className={`pm-toast${toast.text ? ' show' : ''}`} key={toast.key}>{toast.text}</div>
    </div>
  );
}
