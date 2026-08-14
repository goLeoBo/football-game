# 绿茵对决 · 足球游戏（React 版）

一个纯浏览器 Canvas 足球游戏。由原单文件 `football.html`（4300+ 行，含 739KB 内嵌视频）深度重构为 **React + Vite** 工程：Canvas 游戏引擎与 React UI 组件分离。

## 目录结构

```
football_game/
├── football.html              # 原始单文件（权威功能基准，重构时逐段迁移）
├── vite.config.js             # Vite 配置（root=src，输出 dist/）
├── package.json               # npm scripts 与依赖
├── src/
│   ├── index.html             # Vite 入口 HTML（挂载点 #root）
│   ├── main.jsx               # React 入口（createRoot + 渲染 <App/>）
│   ├── App.jsx                # 根组件：canvas + HUD + 各屏幕分派
│   ├── assets/
│   │   └── video.txt          # 世界杯开场视频（739KB base64 原文）
│   ├── engine/
│   │   ├── data.js            # 纯数据常量（阵型/俱乐部/国家队/队徽映射）
│   │   ├── store.js           # 响应式状态桥（useSyncExternalStore）
│   │   └── engine.js          # 游戏引擎（Canvas 渲染 + 物理 + AI + 音频 + 输入）
│   ├── styles/
│   │   └── legacy.css         # 原 <style> 全部样式（类名/ID 保持不变）
│   └── components/
│       ├── Scoreboard.jsx      # 记分牌（队名 + 比分 + 计时）
│       ├── Message.jsx         # 居中提示消息（进球/犯规/重置）
│       ├── PenaltyHud.jsx      # 点球大战五轮圆点 HUD
│       ├── TouchControls.jsx   # 触屏摇杆 + 按钮
│       ├── Overlay.jsx         # 面板容器（菜单/结算/世界杯）
│       ├── Menu.jsx            # 主菜单（阵容模式/俱乐部/阵型/时长）
│       ├── Prematch.jsx        # 赛前匹配界面（选主队 + 阵型 + 粒子背景）
│       ├── EndScreen.jsx       # 比赛/点球结算屏
│       └── WorldCup/
│           ├── index.jsx        # 世界杯组件聚合导出
│           ├── Cover.jsx        # 世界杯开场封面（视频 + CSS 动画）
│           ├── Select.jsx       # 国家队选择（4 档 48 队）
│           ├── Draw.jsx         # 抽签结果（12 组）
│           ├── Standings.jsx    # 小组赛积分榜 + 本轮对阵
│           ├── Knockout.jsx     # 淘汰赛对阵（32→决赛）
│           ├── Trophy.jsx       # 冠军/结束屏
│           ├── TeamFlag.jsx     # 队徽组件（俱乐部 png → 国旗 svg → 头像兜底）
│           └── FixtureRow.jsx   # 对阵行（队名 + 队徽 + VS）
└── dist/                      # 构建产物（Vite 输出）
```

## 安装与运行

```bash
npm install        # 安装依赖（react/react-dom/vite/@vitejs/plugin-react）
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 构建生产版本到 dist/
npm run preview    # 本地预览生产构建
```

## 关键决策（可追溯）

### 1. 引擎与 React 的边界：`store.js` 响应式桥

原单文件的全部逻辑在一个 IIFE 闭包内，60+ 个函数直接读写 `let/const` 全局状态，并直接 `document.getElementById(...)` 操作 DOM。改造时：

- **引擎保持一个闭包**（`engine.js`），内部仍用共享变量，只是把原来「直接操作 DOM」的语句替换为 `commit({...})` 写入 store。
- **`store.js`** 提供 `useSyncExternalStore` 兼容的订阅接口，React 组件通过 `useGame()` 订阅状态。
- **高频字段做变化检测**：主循环里 `timerText`/`activeName` 仅在值变化时 `commit`，避免每帧 60 次触发 React 重渲染（这是与原实现的性能关键差异点）。
- **深层对象（世界杯数据）通过 `getWC()` getter + `wcTick` 递增计数**触发组件重渲染，组件渲染时读取最新对象，避免深拷贝大对象。

### 2. JSX 转换：从 `innerHTML` 字符串到组件

原 `showMenu`/`showPrematch`/世界杯各面板都用模板字符串拼 HTML。重构后：

- 每个面板对应一个 `.jsx` 组件，用 JSX 表达原 DOM 结构，`onClick` 替代原事件委托（`data-*` + `closest()`）。
- 引擎暴露 `game.ui*` / `game.uiPm*` / `game.uiWCAct` 等动作函数，语义与原事件委托分支一一对应。
- `class` → `className`、`style` 字符串 → 对象、内联 `onerror` → React `onError` 状态。

### 3. CSS 迁移：原样保留 + 类名不变

原 `<style>` 整体迁到 `src/styles/legacy.css`，**所有类名/ID/选择器保持不变**（如 `#prematch`、`.pm-battle`、`.wc-cover`），因此组件只需在 JSX 里复刻相同 className 即可无缝复用样式。`#wrap`、`#overlay`、`#mctrl` 等容器结构由 React 组件重建，与原 HTML 结构一致。

### 4. 世界杯开场视频：内联 base64 → 独立资源

原 `EMBEDDED_VIDEO` 是 739KB 的 `data:video/mp4;base64,...` 内联在 JS 里。提取到 `src/assets/video.txt`（纯 base64），在 `Cover.jsx` 里通过 Vite 的 `?raw` 导入，运行时拼接 `data:video/mp4;base64,` 前缀——**与原始 data URI 逐字节等价**。Vite 配置 `assetsInlineLimit` 放大后仍内联进产物，保持单文件可部署。

### 5. 不用 `<React.StrictMode>`

引擎在 `useEffect` 中做一次性 DOM 绑定（canvas、摇杆）+ `requestAnimationFrame` 循环。StrictMode 开发期会双重执行 effect，导致引擎绑定到已卸载的 canvas，故 `main.jsx` 显式不用 StrictMode。

## 功能完整性说明

- 比赛物理/碰撞、慢动作回放、犯规与红黄牌、任意球/球门球/角球/边线球、越位、AI、点球大战、世界杯完整赛制（48 队分组 → 淘汰赛 → 冠军）均**保留原逻辑**，仅将 UI 呈现层改为 React。
- 音频系统（哨声/观众/进球呐喊）原样保留在引擎内。
- 键盘/摇杆/触屏输入原样保留；触屏按钮由 `TouchControls.jsx` 渲染，动作经 `game.touch*` 触发。
