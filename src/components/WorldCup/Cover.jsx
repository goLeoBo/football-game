import { useEffect, useRef, useState } from 'react';
import { game } from '../../engine/engine.js';
import videoBase64 from '../../assets/video.txt?raw';

// 世界杯封面动画：视频开场 + CSS 动画叠加（复刻原 showWCCover）
export default function Cover() {
  const [opacity, setOpacity] = useState(1);
  const advanced = useRef(false);
  const videoRef = useRef(null);

  const proceed = () => {
    if (advanced.current) return;
    advanced.current = true;
    setOpacity(0);
    setTimeout(() => { game.startWorldCup(); }, 600);
  };

  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let videoActive = false;
    const hideVideo = () => { if (!videoActive) { videoActive = true; video.style.display = 'none'; } };
    const videoFailTimer = setTimeout(hideVideo, isMobile ? 6000 : 4000);
    const fallbackTimer = setTimeout(proceed, isMobile ? 6000 : 5500);

    video.src = `data:video/mp4;base64,${videoBase64}`;
    video.load();
    video.play().catch(() => { hideVideo(); });

    const onPlaying = () => { videoActive = true; clearTimeout(videoFailTimer); clearTimeout(fallbackTimer); };
    const onError = () => { hideVideo(); };
    const onEnded = () => { setTimeout(proceed, 400); };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);

    return () => {
      clearTimeout(videoFailTimer);
      clearTimeout(fallbackTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div className="wc-cover" style={{ opacity }} onClick={(e) => { if (e.target.closest('.wc-cover-skip')) return; proceed(); }}>
      <video ref={videoRef} className="wc-cover-video" playsInline muted />
      <div className="wc-cover-bg" />
      <div className="wc-cover-lights" />
      <div className="wc-cover-content">
        <div className="wc-cover-sub">FIFA WORLD CUP</div>
        <div className="wc-cover-2026">2026</div>
        <div className="wc-cover-title">世 界 杯</div>
        <div className="wc-cover-hosts">🇺🇸🇨🇦🇲🇽</div>
        <div className="wc-cover-trophy">🏆</div>
        <div className="wc-cover-continue">点击屏幕进入 · 或等待自动跳转</div>
      </div>
      <div className="wc-cover-skip" onClick={(e) => { e.stopPropagation(); proceed(); }}>跳过 ▶</div>
    </div>
  );
}
