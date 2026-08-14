import { useGame } from '../engine/store.js';

export default function Scoreboard() {
  const { score, timerText, redName, blueName } = useGame();
  return (
    <div id="hud">
      <div id="scoreboard">
        <div className="team">
          <span className="dot red" />
          <span id="redName">{redName}</span>
          <span className="score">{score[0]}</span>
        </div>
        <span className="vs">VS</span>
        <div className="team">
          <span className="score">{score[1]}</span>
          <span id="blueName">{blueName}</span>
          <span className="dot blue" />
        </div>
        <div className="time">{timerText}</div>
      </div>
    </div>
  );
}
