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
    // 视频加载失败/6 秒未起播则隐藏，最迟 14 秒后无论是否播完都自动进入，
    // 避免 76 秒的完整视频把用户卡在封面上。
    const videoFailTimer = setTimeout(hideVideo, 6000);
    const autoAdvanceTimer = setTimeout(proceed, 14000);

    video.src = coverVideo;
    video.load();

    // 数据就绪或可播放时再尝试播放；play() 被拒（数据未就绪/自动播放策略）不隐藏视频，
    // 只有真正的 error 才隐藏。
    const tryPlay = () => { video.play().catch(() => {}); };
    const onLoadedData = () => { tryPlay(); };
    const onCanPlay = () => { tryPlay(); };
    const onPlaying = () => { videoActive = true; clearTimeout(videoFailTimer); };
    const onError = () => { hideVideo(); };
    const onEnded = () => { setTimeout(proceed, 400); };

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);
    tryPlay();

    return () => {
      clearTimeout(videoFailTimer);
      clearTimeout(autoAdvanceTimer);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div className="wc-cover" style={{ opacity }} onClick={proceed}>
      <video ref={videoRef} className="wc-cover-video" playsInline muted />
    </div>
  );
}
