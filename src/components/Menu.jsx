import { game } from '../engine/engine.js';
import { useGame } from '../engine/store.js';
import { CLUBS } from '../engine/data.js';

export default function Menu() {
  const { teamMode, selectedFormation, selectedTime, redClub, matchup } = useGame();
  const forms = [['4-3-3', '4-3-3'], ['4-4-2', '4-4-2'], ['3-5-2', '3-5-2']];
  const times = [[60, '60秒'], [90, '90秒'], [120, '120秒']];

  return (
    <>
      <h1>绿茵对决</h1>
      <div className="tag">FOOTBALL · 明星阵容</div>
      <p>选择阵型与时长，操控世界球星出战</p>

      <div className="sel-group">
        <div className="sel-label">阵容模式</div>
        <div className="sel-btns" id="teamBtns">
          <button className={`chip${teamMode === 'club' ? ' active' : ''}`} onClick={() => game.uiSetTeamMode('club')}>
            俱乐部自选
          </button>
          <button className={`chip${teamMode === 'allstar' ? ' active' : ''}`} onClick={() => game.uiSetTeamMode('allstar')}>
            全明星随机
          </button>
        </div>
      </div>

      <div className="sel-group">
        <div className="sel-label">选择俱乐部</div>
        <div className="club-grid">
          {CLUBS.map((c) => (
            <button
              key={c.name}
              className={`club-chip${redClub && redClub.name === c.name ? ' selected' : ''}`}
              onClick={() => game.uiPickClub(c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="matchup" id="matchup">
          <span style={{ color: '#e63946' }}>{matchup.red}</span>{' '}
          <b style={{ color: '#888', margin: '0 6px' }}>VS</b>{' '}
          <span style={{ color: '#3a86ff' }}>{matchup.blue}</span>
        </div>
      </div>

      <div className="sel-group">
        <div className="sel-label">阵型</div>
        <div className="sel-btns" id="formBtns">
          {forms.map(([v, l]) => (
            <button
              key={v}
              className={`chip${selectedFormation === v ? ' active' : ''}`}
              onClick={() => game.uiSetFormation(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="sel-group">
        <div className="sel-label">比赛时长</div>
        <div className="sel-btns" id="timeBtns">
          {times.map(([v, l]) => (
            <button
              key={v}
              className={`chip${selectedTime === v ? ' active' : ''}`}
              onClick={() => game.uiSetTime(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="btns">
        <button className="btn btn-primary" onClick={() => game.uiMode('match')}>
          友谊赛 11v11
        </button>
      </div>
      <button
        className="btn"
        onClick={() => game.uiMode('worldcup')}
        style={{ width: '100%', marginTop: 8, background: 'linear-gradient(135deg,#ffd60a,#ff8c00)', color: '#222', fontWeight: 800 }}
      >
        🌍 2026 世界杯 · 争夺大力神杯
      </button>

      <div className="keys">
        <div><b>↑↓←→</b>移动</div>
        <div><b>空格</b>射门</div>
        <div><b>WASD</b>移动</div>
        <div><b>Shift</b>传球</div>
        <div><b>Q</b>长传</div>
        <div><b>X</b>切换队员</div>
        <div><b>Z</b>疾跑</div>
        <div><b>P</b>暂停</div>
      </div>
      <div className="small">
        俱乐部：皇马/巴萨/拜仁/利物浦/曼城/巴黎/尤文/米兰/国米/阿森纳
        <br />
        角色色环：<span style={{ color: '#7CFC00' }}>■</span>后卫 ·{' '}
        <span style={{ color: '#ffd60a' }}>■</span>中场 ·{' '}
        <span style={{ color: '#fff' }}>■</span>前锋
        <br />
        长传：按 Q 瞄准，方向键调节落点，虚线预览轨迹
        <br />
        移动端：左下摇杆移动，右下按钮传球/长传/射门
      </div>
    </>
  );
}
