// store.js — 引擎 ↔ React 的响应式桥（useSyncExternalStore 兼容）
//
// 引擎（engine.js）通过 commit(patch) 把 UI 需要展示的状态浅合并进这里；
// React 组件通过 useSyncExternalStore(subscribe, getSnapshot) 订阅。
// 高频字段（比分/计时/消息/activeName）每次变化都会 commit；复杂面板数据
// （世界杯深层对象）通过 wcTick 递增触发重渲染，组件渲染时经 engine 的
// getter 读取最新对象，避免深拷贝。
import { useSyncExternalStore } from 'react';

let state = {
  // 当前要显示的面板：boot | prematch | menu | wc-cover | wc-select | wc-draw |
  // wc-standings | wc-knockout | wc-trophy | match-end | penalty-end | null(比赛中)
  screen: 'boot',
  screenData: null,

  // 记分牌 / HUD
  score: [0, 0],
  timerText: '1:30',
  activeName: '',
  msg: { text: '', key: 0 },
  penHud: { visible: false, redScore: 0, redShots: 0, blueScore: 0, blueShots: 0 },

  // 触屏控件 / 调试按钮
  touch: false,
  debug: false,

  // 队伍与菜单选择
  teamMode: 'club',
  selectedFormation: '4-3-3',
  selectedTime: 90,
  redClub: null,
  blueClub: null,
  redName: '世界明星',
  blueName: '传奇明星',
  matchup: { red: '世界明星', blue: '传奇明星' },

  // 赛前匹配界面
  pm: { selClub: null, theme: null, toast: { text: '', key: 0 } },

  // 世界杯：递增计数触发面板重渲染（数据经 engine.getWC() 读取）
  wcTick: 0,
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function commit(patch) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useGame() {
  return useSyncExternalStore(subscribe, getState, getState);
}
