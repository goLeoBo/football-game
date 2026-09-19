import { useEffect, useState } from 'react';

// 判断当前是否竖屏（用 matchMedia，回退到宽高比较）
function checkPortrait() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia) return window.matchMedia('(orientation: portrait)').matches;
  return window.innerHeight > window.innerWidth;
}

// 只在触屏设备上提示，桌面端缩放窗口不打扰
function checkTouch() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
}

// 竖屏提示：比赛时手机竖着拿会遮挡球场，提示用户转为横屏。
// iOS Safari 不认 manifest 的 orientation，所以必须有这个兜底。
export default function RotateHint() {
  const [portrait, setPortrait] = useState(checkPortrait);
  const [touch] = useState(checkTouch);

  useEffect(() => {
    if (!touch) return;
    const update = () => setPortrait(checkPortrait());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [touch]);

  if (!touch || !portrait) return null;

  return (
    <div className="rotate-hint">
      <div className="rh-phone" aria-hidden="true" />
      <div className="rh-title">请把手机横过来</div>
      <div className="rh-sub">横屏才能看清整个球场</div>
    </div>
  );
}
