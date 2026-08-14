import { useGame } from '../engine/store.js';

export default function Message() {
  const { msg } = useGame();
  return (
    <div id="msg" className={msg.text ? 'show' : ''} key={msg.key}>
      {msg.text}
    </div>
  );
}
