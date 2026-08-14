import { useGame } from '../engine/store.js';
import Menu from './Menu.jsx';
import EndScreen from './EndScreen.jsx';
import WorldCup from './WorldCup/index.jsx';

export default function Overlay() {
  const { screen } = useGame();
  return (
    <div id="overlay">
      <div className="panel" id="panel">
        {screen === 'menu' && <Menu />}
        {screen === 'match-end' && <EndScreen kind="match" />}
        {screen === 'penalty-end' && <EndScreen kind="penalty" />}
        {screen === 'wc-select' && <WorldCup.Select />}
        {screen === 'wc-draw' && <WorldCup.Draw />}
        {screen === 'wc-standings' && <WorldCup.Standings />}
        {screen === 'wc-knockout' && <WorldCup.Knockout />}
        {screen === 'wc-trophy' && <WorldCup.Trophy />}
      </div>
    </div>
  );
}
