// =================================================================
// 02-audio.js — Web Audio API 合成音效
// 绿茵对决 · 足球游戏
//
// 全部音效通过 Web Audio API 实时合成，无需额外音频文件。
// 包括：裁判哨声、出牌哨声、观众噪音、欢呼、嘘声、鼓掌。
// =================================================================

let audioCtx= null;

function getAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
}

// --- 单次哨声（裁判用） ---
function playSingleWhistle(start, dur, vol) {
    const ac = getAudio();
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o1.type = 'square'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(2600, start);
    o2.frequency.setValueAtTime(3100, start);
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = 22; lfoG.gain.value = 180;
    lfo.connect(lfoG); lfoG.connect(o1.frequency); lfoG.connect(o2.frequency);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.03);
    g.gain.linearRampToValueAtTime(vol * 0.85, start + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, start + dur);
    o1.connect(g); o2.connect(g); g.connect(ac.destination);
    o1.start(start); o2.start(start); lfo.start(start);
    o1.stop(start + dur); o2.stop(start + dur); lfo.stop(start + dur);
}

// 裁判哨声：高频振荡 + 颤音
function playWhistle() {
    try {
        const ac = getAudio();
        const t = ac.currentTime;
        const dur = 0.45;
        const o1 = ac.createOscillator(), o2 = ac.createOscillator();
        const g = ac.createGain();
        o1.type = 'square'; o2.type = 'sawtooth';
        o1.frequency.setValueAtTime(2600, t);
        o2.frequency.setValueAtTime(3100, t);
        const lfo = ac.createOscillator(), lfoGain = ac.createGain();
        lfo.frequency.value = 22; lfoGain.gain.value = 180;
        lfo.connect(lfoGain); lfoGain.connect(o1.frequency); lfoGain.connect(o2.frequency);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.03);
        g.gain.linearRampToValueAtTime(0.15, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o1.connect(g); o2.connect(g); g.connect(ac.destination);
        o1.start(t); o2.start(t); lfo.start(t);
        o1.stop(t + dur); o2.stop(t + dur); lfo.stop(t + dur);
    } catch (e) { /* 静默处理 */ }
}

// 出牌哨声：黄牌两声短哨，红牌三声急促长哨
function playCardWhistle(color) {
    try {
        const ac = getAudio();
        const now = ac.currentTime;
        if (color === 'red') {
            playSingleWhistle(now, 0.55, 0.20);
            playSingleWhistle(now + 0.70, 0.50, 0.18);
            playSingleWhistle(now + 1.35, 0.65, 0.22);
        } else {
            playSingleWhistle(now, 0.30, 0.16);
            playSingleWhistle(now + 0.45, 0.35, 0.16);
        }
    } catch (e) { /* 静默处理 */ }
}

// =================================================================
// 观众音效系统
// =================================================================

let crowdNoiseNode = null;    // 背景噪声源
let crowdNoiseGain = null;   // 背景噪声增益节点

// 背景人群嗡嗡声（比赛开始时启动）
function startCrowdAmbience() {
    try {
        if (crowdNoiseNode) return;
        const ac = getAudio();
        const bufferSize = ac.sampleRate * 2;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ac.createBufferSource();
        noise.buffer = buffer; noise.loop = true;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        crowdNoiseGain = ac.createGain();
        crowdNoiseGain.gain.value = 0.04;
        noise.connect(bp); bp.connect(lp); lp.connect(crowdNoiseGain);
        crowdNoiseGain.connect(ac.destination);
        noise.start();
        crowdNoiseNode = noise;
    } catch (e) { /* 静默处理 */ }
}

function stopCrowdAmbience() {
    try {
        if (crowdNoiseNode) { crowdNoiseNode.stop(); crowdNoiseNode = null; crowdNoiseGain = null; }
    } catch (e) { /* 静默处理 */ }
}

// 进球欢呼：白噪声爆发 + 上升包络
function playCrowdCheer(intensity = 1.0, duration = 2.5) {
    try {
        const ac = getAudio();
        const t = ac.currentTime;
        const bufferSize = ac.sampleRate * duration;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const env = Math.min(1, i / (ac.sampleRate * 0.3));
            data[i] = (Math.random() * 2 - 1) * env;
        }
        const noise = ac.createBufferSource();
        noise.buffer = buffer;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8;
        const hp = ac.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 300;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.15 * intensity, t + 0.25);
        g.gain.linearRampToValueAtTime(0.12 * intensity, t + duration * 0.5);
        g.gain.linearRampToValueAtTime(0.06 * intensity, t + duration * 0.75);
        g.gain.linearRampToValueAtTime(0, t + duration);
        noise.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ac.destination);
        noise.start(t); noise.stop(t + duration);
        if (crowdNoiseGain) {
            crowdNoiseGain.gain.cancelScheduledValues(t);
            crowdNoiseGain.gain.setValueAtTime(crowdNoiseGain.gain.value, t);
            crowdNoiseGain.gain.linearRampToValueAtTime(0.10 * intensity, t + 0.2);
            crowdNoiseGain.gain.linearRampToValueAtTime(0.04, t + duration);
        }
    } catch (e) { /* 静默处理 */ }
}

// 嘘声/惊叹（犯规、失误）
function playCrowdGroan(duration = 0.8) {
    try {
        const ac = getAudio();
        const t = ac.currentTime;
        const bufferSize = ac.sampleRate * duration;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ac.createBufferSource();
        noise.buffer = buffer;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 500;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.10, t + 0.1);
        g.gain.linearRampToValueAtTime(0.07, t + duration * 0.6);
        g.gain.linearRampToValueAtTime(0, t + duration);
        noise.connect(lp); lp.connect(g); g.connect(ac.destination);
        noise.start(t); noise.stop(t + duration);
    } catch (e) { /* 静默处理 */ }
}

// 鼓掌（精彩拼抢、扑救）
function playCrowdClap(duration = 1.2) {
    try {
        const ac = getAudio();
        const t = ac.currentTime;
        const clapCount = Math.floor(duration / 0.12);
        for (let i = 0; i < clapCount; i++) {
            const ct = t + i * 0.12;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'square'; o.frequency.value = 200 + Math.random() * 100;
            g.gain.setValueAtTime(0.06, ct);
            g.gain.exponentialRampToValueAtTime(0.001, ct + 0.06);
            o.connect(g); g.connect(ac.destination);
            o.start(ct); o.stop(ct + 0.06);
        }
    } catch (e) { /* 静默处理 */ }
}
