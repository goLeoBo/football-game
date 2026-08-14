import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/legacy.css';

// 注意：不使用 <React.StrictMode>。
// 该游戏引擎在 useEffect 中做一次性 DOM 绑定与 requestAnimationFrame 循环，
// StrictMode 的开发期双重挂载会导致引擎绑定到已卸载的 canvas。
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
