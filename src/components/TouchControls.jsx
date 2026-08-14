import { useCallback } from 'react';
import { game } from '../engine/engine.js';

export default function TouchControls() {
  // ref 回调：摇杆 DOM 挂载时绑定引擎；同时拿到元素供后续使用
  const bindStick = useCallback((stickEl) => {
    if (stickEl) {
      const knobEl = stickEl.querySelector('#stickKnob');
      game.bindStick(stickEl, knobEl);
    }
  }, []);

  return (
    <div id="mctrl" className="show">
      <div id="stick" ref={bindStick}>
        <div id="stickKnob" />
      </div>
      <div id="mbtns">
        <button id="btnPass" onPointerDown={(e) => { e.preventDefault(); game.touchPass(); }}>
          传球
        </button>
        <button id="btnLong" onPointerDown={(e) => { e.preventDefault(); game.touchLong(); }}>
          长传
        </button>
        <button id="btnShoot" onPointerDown={(e) => { e.preventDefault(); game.touchShoot(); }}>
          射门
        </button>
        <button id="btnTackle" onPointerDown={(e) => { e.preventDefault(); game.touchTackle(); }}>
          铲断
        </button>
        <button
          id="btnSprint"
          onPointerDown={(e) => { e.preventDefault(); game.setSprint(true); }}
          onPointerUp={() => game.setSprint(false)}
          onPointerLeave={() => game.setSprint(false)}
          onPointerCancel={() => game.setSprint(false)}
        >
          疾跑
        </button>
      </div>
    </div>
  );
}
