import TeamFlag from './TeamFlag.jsx';

// 复刻原 fixtureRow：左队名 + 队徽，中间 VS，右队名 + 队徽
export default function FixtureRow({ a, b }) {
  const initial = (n) => (n || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="fixture-row">
      <span className="t">
        <TeamFlag name={a} avatarText={initial(a)} />
        <span className="nm">{a}</span>
      </span>
      <span className="vs">VS</span>
      <span className="t right">
        <span className="nm">{b}</span>
        <TeamFlag name={b} avatarText={initial(b)} />
      </span>
    </div>
  );
}
