import { useEffect, useRef } from 'react';
import { game } from './engine/engine.js';
import { useGame } from './engine/store.js';
import Scoreboard from './components/Scoreboard.jsx';
import Message from './components/Message.jsx';
import TouchControls from './components/TouchControls.jsx';
import PenaltyHud from './components/PenaltyHud.jsx';
import Overlay from './components/Overlay.jsx';
import Prematch from './components/Prematch.jsx';
import WorldCup from './components/WorldCup/index.jsx';

export default function App() {
  const { screen, touch, debug, activeName } = useGame();
  const canvasRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    game.init(canvasRef.current);
  }, []);

  const panelScreen = ['menu', 'match-end', 'penalty-end', 'wc-select', 'wc-draw', 'wc-standings', 'wc-knockout', 'wc-trophy'];

  return (
    <div id="wrap">
      <canvas id="cv" ref={canvasRef} />

      <Scoreboard />

      <div id="activeName">{activeName}</div>

      <Message />

      {debug && (
        <button id="btnDebug" title="重置比赛（调试）" onClick={() => game.debugResetMatch()}>
          ↻
        </button>
      )}

      {touch && <TouchControls />}

      <PenaltyHud />

      {panelScreen.includes(screen) && <Overlay />}

      {screen === 'prematch' && <Prematch />}

      {screen === 'wc-cover' && <WorldCup.Cover />}
    </div>
  );
}
