import { useEffect, useRef, useState } from 'react';
import { game } from '../../engine/engine.js';
import coverVideo from '../../assets/cover.mp4';

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let videoActive = false;
    const hideVideo = () => { if (!videoActive) { videoActive = true; video.style.display = 'none'; } };
    // 手机网络较慢时首帧可能超过 6 秒才加载完，不能提前隐藏。
    // 只有真正的 error（格式/网络失败）才隐藏；起播后或兜底时间到会自动进入。
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const isMobile = !!coarsePointer || (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.innerWidth < 900;
    const autoAdvanceTimer = setTimeout(proceed, isMobile ? 22000 : 14000);

    video.src = coverVideo;
    video.load();

    // 数据就绪或可播放时再尝试播放；play() 被拒（数据未就绪/自动播放策略）不隐藏视频，
    // 只有真正的 error 才隐藏。
    const tryPlay = () => { video.play().catch(() => {}); };
    // 部分手机浏览器会拦截自动播放：首次触摸屏幕时补一次 play()。
    const unlockPlay = () => { tryPlay(); };
    const onLoadedData = () => { tryPlay(); };
    const onCanPlay = () => { tryPlay(); };
    const onPlaying = () => { videoActive = true; video.style.display = ''; };
    const onError = () => { hideVideo(); };
    const onEnded = () => { setTimeout(proceed, 400); };

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    window.addEventListener('pointerdown', unlockPlay, { once: true });
    window.addEventListener('touchstart', unlockPlay, { once: true });
    tryPlay();

    return () => {
      clearTimeout(autoAdvanceTimer);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
      window.removeEventListener('pointerdown', unlockPlay);
      window.removeEventListener('touchstart', unlockPlay);
    };
  }, []);

  const handleTap = () => {
    if (advanced.current) return;
    const video = videoRef.current;
    // 视频还没起来时，第一次点击先尝试播放；已起播后点击才是跳过进入
    if (video && video.paused && !video.ended && video.readyState > 0) {
      video.play().catch(() => { proceed(); });
      return;
    }
    proceed();
  };

  return (
    <div className="wc-cover" style={{ opacity }} onClick={handleTap}>
      <video
        ref={videoRef}
        className="wc-cover-video"
        playsInline
        webkit-playsinline=""
        x5-playsinline=""
        muted
        autoPlay
        preload="auto"
      />
    </div>
  );
}
