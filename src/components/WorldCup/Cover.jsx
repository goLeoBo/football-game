import { useEffect, useRef, useState } from 'react';
import { game } from '../../engine/engine.js';
import coverVideo from '../../assets/cover.mp4';

// 世界杯封面动画：视频开场 + CSS 动画叠加（复刻原 showWCCover）
export default function Cover() {
  const [opacity, setOpacity] = useState(1);
  const [needTap, setNeedTap] = useState(false);
  const advanced = useRef(false);
  const videoRef = useRef(null);
  const playingRef = useRef(false);
  const userWantsPlayRef = useRef(false);
  const fallbackTimerRef = useRef(null);

  const proceed = () => {
    if (advanced.current) return;
    advanced.current = true;
    setOpacity(0);
    setTimeout(() => { game.startWorldCup(); }, 600);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const isMobile = !!coarsePointer || (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.innerWidth < 900;

    // 正常自动起播后仍保留自动进入（避免 76 秒完整视频把人卡住）；
    // 用户手动点过播放后 handleTap 会清掉该定时器，可看到视频自然结束。
    const autoAdvanceTimer = setTimeout(() => {
      if (!advanced.current) proceed();
    }, isMobile ? 12000 : 14000);
    fallbackTimerRef.current = autoAdvanceTimer;

    // 自动播放被 Safari/省电模式拦截时，约 1.5 秒后给出点击提示。
    const tipTimer = setTimeout(() => {
      if (!playingRef.current && !advanced.current) setNeedTap(true);
    }, 1500);

    // 视频通过 JSX src 声明式加载；若已经起播（如本地缓存极快），同步标记状态。
    if (!video.paused && !video.ended && video.readyState >= 2) {
      playingRef.current = true;
    }

    const tryPlay = () => {
      if (advanced.current || playingRef.current) return;
      video.muted = true;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    const onLoadedData = () => { tryPlay(); };
    const onCanPlay = () => { tryPlay(); };
    const onPlaying = () => {
      playingRef.current = true;
      setNeedTap(false);
      // 用户手动点播成功后，撤掉自动跳过，让视频自然播完或点击跳过；
      // 自动播放成功时保留到点自动进入的逻辑。
      if (userWantsPlayRef.current && fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
    const onError = () => {
      if (!advanced.current) proceed();
    };
    const onEnded = () => { setTimeout(proceed, 400); };

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    tryPlay();

    return () => {
      clearTimeout(autoAdvanceTimer);
      clearTimeout(tipTimer);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  const handleTap = () => {
    if (advanced.current) return;
    const video = videoRef.current;

    // 已起播：点击屏幕直接跳过进入。
    if (playingRef.current || (video && !video.paused && !video.ended)) {
      proceed();
      return;
    }

    // 还没起播：这次点击用于解锁/启动视频，而不是跳走。
    userWantsPlayRef.current = true;
    if (video) {
      video.muted = true;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };

  return (
    <div className="wc-cover" style={{ opacity }} onClick={handleTap}>
      <video
        ref={videoRef}
        className="wc-cover-video"
        src={coverVideo}
        playsInline
        webkit-playsinline=""
        x5-playsinline=""
        muted
        autoPlay
        preload="auto"
      />
      {needTap && !playingRef.current && (
        <div className="wc-cover-tip">▶ 点击播放开场视频</div>
      )}
    </div>
  );
}
