import { useGame } from '../engine/store.js';

function PenRow({ label, color, score, shots }) {
  const dots = [];
  for (let i = 0; i < 5; i++) {
    const s = score > i ? 'in' : shots > i ? 'out' : '';
    dots.push(<div key={i} className={`pen-dot ${s}`} />);
  }
  return (
    <div className="pen-row">
      <span className="pen-label" style={{ color }}>{label}</span>
      {dots}
    </div>
  );
}

export default function PenaltyHud() {
  const { penHud } = useGame();
  if (!penHud.visible) return null;
  return (
    <div id="penHUD" style={{ display: 'flex' }}>
      <PenRow label="红" color="#e63946" score={penHud.redScore} shots={penHud.redShots} />
      <PenRow label="蓝" color="#3a86ff" score={penHud.blueScore} shots={penHud.blueShots} />
    </div>
  );
}
