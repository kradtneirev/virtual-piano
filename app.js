(() => {
'use strict';

/* ========== Hằng số & tiện ích ========== */
const LO = 21, HI = 108;                // A0 .. C8 (đủ 88 phím)
const WHITE_COUNT = 52;
let fitMode = 'fit';                    // 'fit' = cả 88 phím vừa một màn hình, 'big' = phím to, phải cuộn
let tinyKeys = false, microKeys = false; // phím nhỏ: thu chữ / bớt nhãn
let WW = 40, BW = 24;                   // độ rộng phím trắng / đen (tự co giãn theo màn hình)
let KB_H = 180, FALL_H = 280;           // chiều cao phím, vùng nốt rơi
const PPB = 90;                         // px mỗi phách
const MAX_VOICES = 72; // bài chạy móc kép hai tay + sustain cần nhiều tiếng cùng lúc
const STORE_KEY = 'vnpiano.songs.v1';
const PREF_KEY = 'vnpiano.prefs.v1';
const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NAMES_VI = ['Đô', 'Đô#', 'Rê', 'Rê#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const { parseSong } = window.NotationParser;

function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ========== Hình học bàn phím ========== */
const keyX = {}, keyW = {};
let STAGE_W = 0;
function computeGeometry() {
  let wi = 0;
  for (let m = LO; m <= HI; m++) {
    if (!isBlack(m)) { keyX[m] = wi * WW; keyW[m] = WW; wi++; }
    else { keyX[m] = wi * WW - BW / 2; keyW[m] = BW; }
  }
  STAGE_W = wi * WW;
}
computeGeometry();

// Đặt kích thước đàn + vùng nốt rơi theo cỡ cửa sổ
function layout() {
  const sc = $('#scroller');
  const w = sc.clientWidth || 1000, h = sc.clientHeight || 600;
  const fit = fitMode === 'fit';
  // phím trắng đầu tiên đang xem (ghi lại khi người dùng cuộn) -> sau khi đổi cỡ / xoay máy vẫn xem đúng chỗ đó
  const anchor = viewLockX === null ? scrollAnchor : null;
  sc.style.overflowX = fit ? 'hidden' : 'auto';
  // Bố cục "Hai tay" / "Gọn": chỉ hiện đúng quãng phím gõ được, phóng to vừa màn hình và khóa cuộn.
  // Bố cục "Cả đàn": thu nhỏ để đủ 88 phím.
  const range = fit ? viewRange() : null;
  if (fit) {
    let whites = WHITE_COUNT;
    if (range) { whites = 0; for (let m = range[0]; m <= range[1]; m++) if (!isBlack(m)) whites++; }
    WW = w / whites;                         // các phím trắng vừa khít bề ngang, không cần cuộn
    BW = WW * 0.6;
    KB_H = clamp(Math.round(WW * 6), 96, Math.round(h * 0.4));
  } else if (/^o[2-5]$/.test(fitMode)) {
    // số quãng tám cố định: (7 × số quãng + 1) phím trắng vừa khít bề ngang, cuộn để xem phần còn lại
    WW = w / (7 * +fitMode[1] + 1);
    BW = WW * 0.6;
    KB_H = clamp(Math.round(WW * 5.5), h < 520 ? 110 : 150, Math.round(h * (h < 520 ? 0.5 : 0.42)));
  } else {
    WW = clamp(Math.round(w / 22), 38, 64);
    BW = Math.round(WW * 0.6);
    KB_H = clamp(Math.round(h * 0.4), h < 520 ? 120 : 190, 360); // điện thoại ngang: đàn thấp hơn, nhường chỗ cho nốt rơi
  }
  tinyKeys = WW < 30; microKeys = WW < 20;
  kbEl.classList.toggle('tiny', tinyKeys);
  kbEl.classList.toggle('micro', microKeys);
  document.body.classList.toggle('fit', fit);
  FALL_H = Math.max(100, h - KB_H - 4);
  computeGeometry();
  stageEl.style.width = STAGE_W + 'px';
  stageEl.style.height = (FALL_H + KB_H) + 'px';
  kbEl.style.top = FALL_H + 'px';
  kbEl.style.width = STAGE_W + 'px';
  kbEl.style.height = KB_H + 'px';
  for (let m = LO; m <= HI; m++) {
    const k = keyEls[m];
    if (!k) continue;
    const white = !isBlack(m);
    const gap = white ? (microKeys ? 0.5 : 1) : 0;          // phím trắng chừa khe cho giống đàn thật
    k.el.style.left = (keyX[m] + gap) + 'px';
    k.el.style.width = (keyW[m] - 2 * gap) + 'px';
    k.el.style.height = (isBlack(m) ? KB_H * 0.62 : KB_H) + 'px';
  }
  document.documentElement.style.setProperty('--fabTop', Math.round(sc.getBoundingClientRect().top + 6) + 'px');
  const dpr = window.devicePixelRatio || 1;
  fallEl.width = Math.round(STAGE_W * dpr); fallEl.height = Math.round(FALL_H * dpr);
  fallEl.style.width = STAGE_W + 'px'; fallEl.style.height = FALL_H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (keyEls[LO]) updateLabels(); // nhãn phụ thuộc cỡ phím
  viewLockX = fit ? (range ? keyX[range[0]] : 0) : null;
  layoutW = w;
  if (viewLockX !== null) sc.scrollLeft = viewLockX;
  else if (anchor !== null) sc.scrollLeft = keyX[anchor];
}
let scrollAnchor = null, layoutW = 0;
function noteScrollAnchor() {
  const sc = $('#scroller');
  if (viewLockX !== null || sc.clientWidth !== layoutW) return; // khung vừa đổi cỡ: trình duyệt tự kẹp vị trí, bỏ qua
  for (let m = LO; m <= HI; m++) if (!isBlack(m) && keyX[m] + WW / 2 >= sc.scrollLeft) { scrollAnchor = m; return; }
}
let viewLockX = null; // khác null = vị trí cuộn bị khóa (chế độ vừa màn hình)
function viewRange() {
  let lo, hi;
  if (kbLayout === 'twohand') { lo = leftBase; hi = Math.max(leftBase + LEFT_SPAN, rightBase + RIGHT_SPAN); }
  else if (kbLayout === 'compact') { lo = baseMidi; hi = baseMidi + 28; }
  else return null; // cả đàn
  lo = clamp(lo, LO, HI); hi = clamp(hi, LO, HI);
  if (isBlack(lo)) lo--;
  if (isBlack(hi)) hi++;
  return [lo, Math.min(hi, HI)];
}
// giữ nguyên vị trí khi đang khóa (chặn mọi thao tác cuộn: bánh xe, vuốt, nút, tự cuộn)
$('#scroller').addEventListener('scroll', () => {
  const sc = $('#scroller');
  if (viewLockX !== null && Math.abs(sc.scrollLeft - viewLockX) > 0.5) sc.scrollLeft = viewLockX;
  else noteScrollAnchor();
});

/* ========== Âm thanh (Web Audio, tự tổng hợp tiếng piano) ========== */
let actx = null, master = null, volume = 0.8;
const liveVoices = [];

// Tạo đáp ứng xung cho reverb: nhiễu tắt dần, làm mờ bớt âm cao cho tiếng vang ấm
function makeReverbIR(ctx, sec) {
  const rate = ctx.sampleRate, len = Math.floor(rate * sec);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * 0.28;
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < rate * 0.015 ? i / (rate * 0.015) : 1) * 3;
    }
  }
  return buf;
}
const tcOf = (long, def, defLong) => (typeof long === 'number' ? long : (long ? defLong : def));

function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = volume;
    // ấm + trầm hơn: tăng bass, giảm nhẹ âm chói
    const low = actx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 240; low.gain.value = 5;
    const high = actx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5500; high.gain.value = -3;
    const comp = actx.createDynamicsCompressor();
    // vang kiểu phòng hòa nhạc (reverb)
    const conv = actx.createConvolver(); conv.buffer = makeReverbIR(actx, 3.4);
    const wet = actx.createGain(); wet.gain.value = 0.3;
    master.connect(low); low.connect(high);
    high.connect(comp);                       // tiếng gốc
    high.connect(conv); conv.connect(wet); wet.connect(comp); // tiếng vang
    comp.connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function startSynthVoice(midi, when, vel) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = 0.32 * vel / 1.8 * clamp(1.25 - (midi - 36) / 80, 0.4, 1);
  const rel = actx.createGain();
  rel.gain.value = 1;
  rel.connect(master);
  const env = actx.createGain();
  env.connect(rel);
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(peak, when + 0.006);
  env.gain.exponentialRampToValueAtTime(peak * 0.4, when + 0.5);
  env.gain.exponentialRampToValueAtTime(0.0008, when + 5);

  const parts = [['triangle', 1, 1], ['sine', 2, 0.3], ['sine', 3, 0.1], ['sine', 1.004, 0.4]];
  const oscs = parts.map(([type, mul, g]) => {
    const o = actx.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    const og = actx.createGain();
    og.gain.value = g;
    o.connect(og); og.connect(env);
    o.start(when);
    o.stop(when + 5.1);
    return o;
  });

  const v = { released: false, when };
  v.release = (t, long) => {
    if (v.released) return;
    v.released = true;
    const now = actx.currentTime;
    if ((t === undefined ? now : t) < when) { // nốt chưa kịp vang (pause/seek): tắt ngay
      rel.gain.setValueAtTime(0, now);
      oscs.forEach(o => { try { o.stop(now); } catch (e) { /* bỏ qua */ } });
      return;
    }
    t = Math.max(t === undefined ? now : t, when + 0.02);
    rel.gain.setValueAtTime(1, t);
    const tc = tcOf(long, 0.07, 0.8);
    rel.gain.setTargetAtTime(0, t, tc);
    oscs.forEach(o => { try { o.stop(t + tc * 5 + 0.1); } catch (e) { /* đã dừng */ } });
  };
  v.cut = () => { // tắt ngay (pause/tua/vượt giới hạn), kể cả nốt đã hẹn giờ release
    const n = actx.currentTime;
    v.released = true;
    rel.gain.cancelScheduledValues(n);
    rel.gain.setTargetAtTime(0, n, 0.03);
    oscs.forEach(o => { try { o.stop(n + 0.4); } catch (e) { /* bỏ qua */ } });
  };
  oscs[0].onended = () => {
    try { rel.disconnect(); } catch (e) { /* bỏ qua */ }
    const i = liveVoices.indexOf(v);
    if (i >= 0) liveVoices.splice(i, 1);
  };
  liveVoices.push(v);
  while (liveVoices.length > MAX_VOICES) {
    liveVoices.shift().cut();
  }
  return v;
}

/* ----- Tiếng đàn thật (mẫu âm FluidR3 trong thư mục sounds/) ----- */
const INSTRUMENTS = [
  ['salamander_grand', 'Concert Grand (Yamaha C5)'],
  ['acoustic_grand_piano', 'Grand Piano (GM)'],
  ['electric_piano_1', 'Piano điện'],
  ['music_box', 'Hộp nhạc'],
  ['acoustic_guitar_nylon', 'Guitar nylon'],
  ['orchestral_harp', 'Đàn hạc'],
  ['church_organ', 'Organ nhà thờ'],
  ['synth', 'Piano tổng hợp (nhẹ, không cần tải)']
];
let instrument = 'salamander_grand';
const INSTRUMENT_GAIN = { salamander_grand: 1.5 }; // bộ mẫu thu nhỏ tiếng hơn nên tăng âm lượng
const sampleBank = {};     // id -> { midi: AudioBuffer }
const sampleLoading = {};  // id -> Promise

function b64ToArrayBuffer(uri) {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('không tải được ' + src));
    document.head.appendChild(s);
  });
}
function loadInstrument(id) {
  if (id === 'synth' || sampleBank[id]) return Promise.resolve();
  if (sampleLoading[id]) return sampleLoading[id];
  ensureAudio();
  sampleLoading[id] = (async () => {
    if (!(window.VNP_SF && window.VNP_SF[id])) await loadScript('sounds/' + id + '.js');
    const raw = window.VNP_SF[id], bank = {};
    await Promise.all(Object.keys(raw).map(async name => {
      try { bank[window.NotationParser.parseNote(name)] = { b: await actx.decodeAudioData(b64ToArrayBuffer(raw[name])), r: 1 }; }
      catch (e) { /* bỏ qua nốt lỗi, sẽ dùng tiếng tổng hợp */ }
    }));
    delete window.VNP_SF[id]; // giải phóng bộ nhớ
    // bộ mẫu thưa (không đủ 88 nốt): nốt thiếu lấy mẫu gần nhất rồi chỉnh tốc độ phát để đổi cao độ
    const have = Object.keys(bank).map(Number).sort((a, b) => a - b);
    if (have.length) {
      for (let m = 21; m <= 108; m++) {
        if (bank[m]) continue;
        let best = have[0];
        for (const h of have) if (Math.abs(h - m) < Math.abs(best - m)) best = h;
        bank[m] = { b: bank[best].b, r: Math.pow(2, (m - best) / 12) };
      }
    }
    sampleBank[id] = bank;
  })().catch(err => {
    delete sampleLoading[id];
    toast('Không tải được tiếng đàn, chuyển sang piano tổng hợp.');
    if (instrument === id) { // chỉ chuyển nếu người dùng chưa chọn đàn khác
      instrument = 'synth';
      $('#instrument').value = 'synth';
      syncInstrumentUI();
    }
  });
  return sampleLoading[id];
}

function startSampleVoice(smp, when, vel) {
  const buf = smp.b;
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = smp.r || 1;
  const rel = actx.createGain();
  rel.gain.value = 1;
  rel.connect(master);
  const gn = actx.createGain();
  gn.gain.value = 0.9 * vel * (INSTRUMENT_GAIN[instrument] || 1);
  src.connect(gn); gn.connect(rel);
  src.start(when);
  const v = { released: false, when };
  v.release = (t, long) => {
    if (v.released) return;
    v.released = true;
    const now = actx.currentTime;
    if ((t === undefined ? now : t) < when) {
      rel.gain.setValueAtTime(0, now);
      try { src.stop(now); } catch (e) { /* bỏ qua */ }
      return;
    }
    t = Math.max(t === undefined ? now : t, when + 0.02);
    rel.gain.setValueAtTime(1, t);
    const tc = tcOf(long, 0.12, 1.4);
    rel.gain.setTargetAtTime(0, t, tc);
    try { src.stop(t + tc * 5 + 0.1); } catch (e) { /* bỏ qua */ }
  };
  v.cut = () => {
    const n = actx.currentTime;
    v.released = true;
    rel.gain.cancelScheduledValues(n);
    rel.gain.setTargetAtTime(0, n, 0.03);
    try { src.stop(n + 0.4); } catch (e) { /* bỏ qua */ }
  };
  src.onended = () => {
    try { rel.disconnect(); } catch (e) { /* bỏ qua */ }
    const i = liveVoices.indexOf(v);
    if (i >= 0) liveVoices.splice(i, 1);
  };
  liveVoices.push(v);
  while (liveVoices.length > MAX_VOICES) liveVoices.shift().cut();
  return v;
}

function startVoice(midi, when, vel) {
  if (instrument !== 'synth') {
    const bank = sampleBank[instrument];
    if (bank && bank[midi]) return startSampleVoice(bank[midi], when, vel);
    loadInstrument(instrument); // chưa tải xong: tạm dùng tiếng tổng hợp
  }
  return startSynthVoice(midi, when, vel);
}

/* ========== Bàn phím trên màn hình ========== */
const kbEl = $('#kb');
const stageEl = $('#stage');
const fallEl = $('#fall');
const keyEls = {};
let labelMode = 'en';
let hintMap = {};          // midi -> chữ cái phím máy tính tương ứng
const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); // điện thoại / máy tính bảng
let letterMode = 'auto';   // auto | on | off
let showLetters = false;
const hoverMQ = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
function updateShowLetters() {
  showLetters = letterMode === 'on' || (letterMode === 'auto' && !!(hoverMQ && hoverMQ.matches));
}
let baseMidi = 48; // phím máy tính hàng dưới bắt đầu từ C3

// Ánh xạ phím máy tính (dùng e.code để không phụ thuộc kiểu bàn phím)
const KEY_MAP = [
  ['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4], ['KeyV', 5], ['KeyG', 6],
  ['KeyB', 7], ['KeyH', 8], ['KeyN', 9], ['KeyJ', 10], ['KeyM', 11],
  ['KeyQ', 12], ['Digit2', 13], ['KeyW', 14], ['Digit3', 15], ['KeyE', 16], ['KeyR', 17],
  ['Digit5', 18], ['KeyT', 19], ['Digit6', 20], ['KeyY', 21], ['Digit7', 22], ['KeyU', 23],
  ['KeyI', 24], ['Digit9', 25], ['KeyO', 26], ['Digit0', 27], ['KeyP', 28],
  ['Comma', 12], ['KeyL', 13], ['Period', 14], ['Semicolon', 15], ['Slash', 16]
];
const CODE_OFFSET = new Map(KEY_MAP);

// Bố cục "hai tay": tay trái ở 2 hàng trên (hàng Q = phím trắng, hàng số = phím đen),
// tay phải ở 2 hàng dưới (hàng Z = phím trắng, hàng A = phím đen). Mỗi tay có quãng tám riêng.
const LEFT_MAP = new Map([
  ['KeyQ', 0], ['Digit2', 1], ['KeyW', 2], ['Digit3', 3], ['KeyE', 4], ['KeyR', 5], ['Digit5', 6],
  ['KeyT', 7], ['Digit6', 8], ['KeyY', 9], ['Digit7', 10], ['KeyU', 11], ['KeyI', 12], ['Digit9', 13],
  ['KeyO', 14], ['Digit0', 15], ['KeyP', 16], ['BracketLeft', 17], ['Equal', 18], ['BracketRight', 19]
]);
const RIGHT_MAP = new Map([
  ['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4], ['KeyV', 5], ['KeyG', 6],
  ['KeyB', 7], ['KeyH', 8], ['KeyN', 9], ['KeyJ', 10], ['KeyM', 11], ['Comma', 12], ['KeyL', 13],
  ['Period', 14], ['Semicolon', 15], ['Slash', 16]
]);
const LEFT_SPAN = 19, RIGHT_SPAN = 16;
let leftBase = 36, rightBase = 60; // C2 và C4
let foldHands = true;              // gập nốt ngoài tầm vào tầm phím của hai tay
let handMap = {};                  // midi -> 'L' | 'R' (chỉ dùng ở bố cục hai tay)
function inHands(m) {
  return (m >= leftBase && m <= leftBase + LEFT_SPAN) || (m >= rightBase && m <= rightBase + RIGHT_SPAN);
}
function foldToHands(m) {
  if (inHands(m)) return m;
  const hiR = rightBase + RIGHT_SPAN;
  let x = m;
  if (x > hiR) { while (x > hiR) x -= 12; }
  else if (x < leftBase) { while (x < leftBase) x += 12; }
  else x += (x >= rightBase - 6) ? 12 : -12; // nằm giữa hai tay: đưa về tay gần hơn
  return inHands(x) ? x : m;
}

// Bố cục "cổ điển" như virtualpiano.net: 36 phím trắng theo thứ tự 1234567890 qwertyuiop asdfghjkl zxcvbnm,
// giữ Shift để đánh nốt thăng (phím đen) ngay sau phím trắng đó.
let kbLayout = 'classic';
const CLASSIC_CODES = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'
];
const WHITES = [];
for (let m = 36; m <= 96; m++) if (!isBlack(m)) WHITES.push(m); // bố cục cổ điển: C2..C7
function classicMidi(code, shift) {
  const i = CLASSIC_CODES.indexOf(code);
  if (i < 0 || i >= WHITES.length) return null;
  let m = WHITES[i];
  if (shift && m + 1 <= HI && isBlack(m + 1)) m += 1;
  return m;
}
function codeLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { Comma: ',', Period: '.', Semicolon: ';', Slash: '/', BracketLeft: '[', BracketRight: ']', Equal: '=' }[code] || code;
}

function buildKeyboard() {
  // kích thước từng phím do layout() đặt (z-index phím đen/trắng xử lý bằng CSS)
  for (let m = LO; m <= HI; m++) {
    const el = document.createElement('div');
    el.className = 'key ' + (isBlack(m) ? 'black' : 'white');
    el.dataset.midi = m;
    const hint = document.createElement('span'); hint.className = 'hint';
    const nm = document.createElement('span'); nm.className = 'nm';
    el.append(hint, nm);
    kbEl.appendChild(el);
    keyEls[m] = { el, hint, nm };
  }
  layout();
  updateLabels();
}

function noteLabel(m) {
  if (labelMode === 'none') return '';
  const i = m % 12;
  const oct = Math.floor(m / 12) - 1;
  if (microKeys && i !== 0) return '';      // phím rất nhỏ: chỉ ghi tên các nốt Đô
  if (tinyKeys && isBlack(m)) return '';
  const name = (labelMode === 'vi' && !tinyKeys) ? NAMES_VI[i] : NAMES_EN[i];
  return (i === 0 || coarsePointer) ? name + oct : name; // cảm ứng: ghi quãng tám trên mọi phím như onlinepianist
}

function updateLabels() {
  const hintByMidi = {};
  hintMap = hintByMidi; // dùng chung để vẽ chữ cái trong nốt rơi
  handMap = {};
  if (kbLayout === 'twohand') {
    for (const [code, off] of LEFT_MAP) {
      const m = leftBase + off;
      if (m >= LO && m <= HI && !(m in hintByMidi)) { hintByMidi[m] = codeLabel(code); handMap[m] = 'L'; }
    }
    for (const [code, off] of RIGHT_MAP) {
      const m = rightBase + off;
      if (m >= LO && m <= HI && !(m in hintByMidi)) { hintByMidi[m] = codeLabel(code); handMap[m] = 'R'; }
    }
  } else if (kbLayout === 'classic') {
    CLASSIC_CODES.forEach((code, i) => {
      const m = WHITES[i];
      hintByMidi[m] = codeLabel(code);
      if (m + 1 <= HI && isBlack(m + 1)) hintByMidi[m + 1] = '⇧' + codeLabel(code);
    });
  } else {
    for (const [code, off] of KEY_MAP) {
      const m = baseMidi + off;
      if (m >= LO && m <= HI && !(m in hintByMidi)) hintByMidi[m] = codeLabel(code);
    }
  }
  for (let m = LO; m <= HI; m++) {
    keyEls[m].nm.textContent = noteLabel(m);
    keyEls[m].hint.textContent = hintByMidi[m] || '';
    keyEls[m].el.classList.toggle('lh', handMap[m] === 'L');
    keyEls[m].el.classList.toggle('rh', handMap[m] === 'R');
  }
}

function scrollToBase() {
  const sc = $('#scroller');
  if (viewLockX !== null) { sc.scrollLeft = viewLockX; return; }
  sc.scrollLeft = Math.max(0, keyX[clamp(kbLayout === 'twohand' ? leftBase : baseMidi, LO, HI)] - 20);
}

/* ========== Phát âm khi người dùng bấm phím ========== */
let sustainOn = true;        // pedal: nốt người chơi bấm sẽ ngân dài khi nhả phím
const held = new Map();      // nguồn (chuột/phím) -> {midi, voice}
const downCount = {};        // midi -> số nguồn đang giữ

function press(midi, src, vel) {
  if (held.has(src) || midi < LO || midi > HI) return;
  ensureAudio();
  const voice = startVoice(midi, actx.currentTime, vel || 0.85);
  held.set(src, { midi, voice });
  downCount[midi] = (downCount[midi] || 0) + 1;
  onUserNote(midi);
}
function releaseSrc(src) {
  const h = held.get(src);
  if (!h) return;
  held.delete(src);
  h.voice.release(undefined, sustainOn);
  downCount[h.midi] = Math.max(0, (downCount[h.midi] || 1) - 1);
}
function releaseAllHeld() { [...held.keys()].forEach(releaseSrc); }

// --- đàn điện / bàn phím MIDI qua cáp USB hoặc Bluetooth (Web MIDI: Chrome, Edge, Opera, Chrome Android) ---
// Nhận lực bấm (velocity) và pedal vang thật (CC64). Khi đàn đã gửi pedal, nút Sustain trên web không áp dụng cho đàn.
const midiPedal = { seen: false, down: false, hold: new Map() }; // midi -> voice đang được pedal giữ
function midiNoteOn(note, vel) {
  if (!actx || actx.state !== 'running') { // trình duyệt chặn âm thanh khi chưa có cú bấm nào trên trang
    ensureAudio();
    if (!midiPedal.warned) { midiPedal.warned = true; toast('Bấm chuột vào trang một lần để bật âm thanh cho đàn'); }
    return; // không xếp nốt vào hàng chờ, tránh dồn tiếng khi âm thanh được mở
  }
  const old = midiPedal.hold.get(note);           // đánh lại nốt đang được pedal giữ: tắt tiếng cũ
  if (old) { old.release(undefined, false); midiPedal.hold.delete(note); }
  releaseSrc('m' + note);
  press(note, 'm' + note, 0.12 + 0.88 * Math.pow(vel / 127, 1.4));
}
function midiNoteOff(note) {
  const src = 'm' + note, h = held.get(src);
  if (!h) return;
  if (midiPedal.seen) {
    held.delete(src);
    downCount[note] = Math.max(0, (downCount[note] || 1) - 1);
    if (midiPedal.down) midiPedal.hold.set(note, h.voice);
    else h.voice.release(undefined, false);
  } else releaseSrc(src);
}
function midiPedalSet(down) {
  midiPedal.seen = true; midiPedal.down = down;
  if (!down) { midiPedal.hold.forEach(v => v.release(undefined, false)); midiPedal.hold.clear(); }
}
function midiPanic() { // nhả mọi nốt và pedal của đàn (ngắt cáp, lệnh All Notes Off)
  [...held.keys()].filter(k => k[0] === 'm').forEach(src => {
    const h = held.get(src); held.delete(src);
    downCount[h.midi] = Math.max(0, (downCount[h.midi] || 1) - 1);
    h.voice.release(undefined, false);
  });
  midiPedalSet(false);
}
function onMidiMessage(e) {
  const [st, a, b] = e.data, cmd = st & 0xf0;
  if (cmd === 0x90 && b > 0) midiNoteOn(a, b);
  else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) midiNoteOff(a);
  else if (cmd === 0xb0 && a === 64) midiPedalSet(b >= 64);
  else if (cmd === 0xb0 && (a === 120 || a === 123)) midiPanic();
}
const midiInputs = new Set();
function hookMidiInputs(access, announce) {
  access.inputs.forEach(inp => {
    if (midiInputs.has(inp.id) || inp.state !== 'connected') return;
    midiInputs.add(inp.id);
    inp.onmidimessage = onMidiMessage;
    if (announce) toast('Đã kết nối đàn: ' + (inp.name || 'thiết bị MIDI'));
  });
}
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(access => {
    hookMidiInputs(access, true);
    access.onstatechange = ev => {
      const p = ev.port;
      if (p.type !== 'input') return;
      if (p.state === 'disconnected') { midiInputs.delete(p.id); midiPanic(); toast('Đã ngắt đàn: ' + (p.name || 'thiết bị MIDI')); }
      else hookMidiInputs(access, true);
    };
  }).catch(() => { /* người dùng không cho phép hoặc trình duyệt chặn: vẫn chơi bằng chuột/bàn phím */ });
}

// --- chuột / cảm ứng (Pointer Events, hỗ trợ đa điểm và trượt ngón) ---
function keyAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const k = el && el.closest ? el.closest('.key') : null;
  return k ? Number(k.dataset.midi) : null;
}
kbEl.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
  const m = keyAt(e.clientX, e.clientY);
  if (m !== null) press(m, 'p' + e.pointerId);
});
kbEl.addEventListener('pointermove', e => {
  const src = 'p' + e.pointerId, cur = held.get(src);
  if (!cur) return;
  const m = keyAt(e.clientX, e.clientY);
  if (m !== null && m !== cur.midi) { releaseSrc(src); press(m, src); }
});
function pointerEnd(e) { releaseSrc('p' + e.pointerId); }
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);
kbEl.addEventListener('contextmenu', e => e.preventDefault());

// --- bàn phím máy tính ---
function typingTarget(t) {
  // chỉ chặn khi đang gõ chữ; thanh trượt/ô chọn không được chặn phím đàn
  return t && (t.closest && t.closest('textarea, input[type=text], input[type=number], input:not([type]), [contenteditable]'));
}
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($('#dlg').open || typingTarget(e.target)) return;
  let m;
  if (kbLayout === 'twohand') {
    if (LEFT_MAP.has(e.code)) m = leftBase + LEFT_MAP.get(e.code);
    else if (RIGHT_MAP.has(e.code)) m = rightBase + RIGHT_MAP.get(e.code);
    else return;
  } else if (kbLayout === 'classic') {
    m = classicMidi(e.code, e.shiftKey);
    if (m === null) return;
  } else {
    const off = CODE_OFFSET.get(e.code);
    if (off === undefined) return;
    m = baseMidi + off;
  }
  e.preventDefault();
  press(m, 'k' + e.code);
});
window.addEventListener('keyup', e => releaseSrc('k' + e.code));
window.addEventListener('blur', releaseAllHeld);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllHeld(); });

/* ========== Bộ phát bài ========== */
const P = {
  songKey: null, rec: null, parsed: null, bpm: 100,
  mode: 'auto', playing: false, pos: 0, t0: 0, next: 0, cur: 0, pending: new Set(),
  rate: 1, transpose: 0, voices: [], timer: 0, playReq: 0
};

function tn(m) { // chuyển giọng + gập về trong phạm vi bàn phím
  m += P.transpose;
  while (m < LO) m += 12;
  while (m > HI) m -= 12;
  if (kbLayout === 'twohand' && foldHands) m = foldToHands(m);
  return m;
}
function tnSound(m) { // cao độ phát ra khi tự chơi: đúng nốt gốc, KHÔNG gập theo tầm phím hai tay
  m += P.transpose;
  while (m < LO) m += 12;
  while (m > HI) m -= 12;
  return m;
}
const spb = () => 60 / (P.bpm * P.rate);  // giây mỗi phách
const bps = () => P.bpm * P.rate / 60;     // phách mỗi giây

function firstIdx(pos) {
  const evs = P.parsed.events;
  let i = 0;
  while (i < evs.length && evs[i].start < pos - 1e-6) i++;
  return i;
}
// Chế độ "chơi theo": gom mọi nốt bắt đầu cùng lúc (cả hai tay) thành một lượt cần bấm
function buildPending() {
  const evs = P.parsed && P.parsed.events;
  const set = new Set();
  let j = P.cur;
  if (evs && j < evs.length) {
    const s = evs[j].start;
    while (j < evs.length && evs[j].start <= s + 1e-6) { evs[j].notes.forEach(m => set.add(tn(m))); j++; }
  }
  P.pending = set;
  P.curEnd = j;
}

function schedule() {
  if (!P.playing || P.mode !== 'auto') return;
  const evs = P.parsed.events, s = spb();
  const now = actx.currentTime, horizon = now + 0.25;
  while (P.next < evs.length) {
    const ev = evs[P.next];
    const when = P.t0 + ev.start * s;
    if (when > horizon) break;
    const w = Math.max(when, now);
    const dur = Math.max(0.08, ev.dur * s * 0.95 - (w - when));
    for (const m of ev.notes) {
      const v = startVoice(tnSound(m), w, 0.8);
      v.release(w + dur, sustainOn ? 0.55 : undefined); // pedal nhẹ khi phát bài
      P.voices.push(v);
    }
    P.next++;
  }
  if (P.voices.length > 200) P.voices.splice(0, P.voices.length - 100);
}

function play() {
  if (!P.parsed) return;
  ensureAudio();
  if (instrument !== 'synth' && !sampleBank[instrument]) {
    toast('Đang tải tiếng đàn…');
    const tok = ++P.playReq;
    loadInstrument(instrument).then(() => { if (tok === P.playReq && !P.playing) doPlay(); });
    return;
  }
  doPlay();
}
function doPlay() {
  if (!P.parsed) return;
  if (P.pos >= P.parsed.total - 1e-6) P.pos = 0;
  P.playing = true;
  if (P.mode === 'auto') {
    P.t0 = actx.currentTime - P.pos / bps();
    P.next = firstIdx(P.pos);
    clearInterval(P.timer);
    P.timer = setInterval(schedule, 25);
    schedule();
  } else {
    P.cur = firstIdx(P.pos);
    buildPending();
  }
  updateUI();
}
function pause() {
  P.playReq++; // huỷ lệnh phát đang chờ tải tiếng đàn
  P.playing = false;
  clearInterval(P.timer);
  P.voices.forEach(v => v.cut());
  P.voices = [];
  updateUI();
}
function stop() {
  pause();
  P.pos = 0; P.cur = 0; P.next = 0;
  if (P.parsed) buildPending();
  updateUI();
}
function seekBeat(b) {
  if (!P.parsed) return;
  P.pos = clamp(b, 0, P.parsed.total);
  if (P.playing && P.mode === 'auto') {
    P.voices.forEach(v => v.cut()); P.voices = [];
    P.t0 = actx.currentTime - P.pos / bps();
    P.next = firstIdx(P.pos);
  }
  P.cur = firstIdx(P.pos);
  buildPending();
}

function onUserNote(m) {
  if (!P.playing || P.mode !== 'follow' || !P.parsed) return;
  const ev = P.parsed.events[P.cur];
  if (!ev || P.pos < ev.start - 0.75) return;
  if (P.pending.delete(m) && P.pending.size === 0) {
    P.cur = P.curEnd;
    buildPending();
  }
}

// Bố cục hai tay: tự chọn quãng tám cho mỗi tay sao cho nhiều nốt của bài nằm trong tầm phím nhất
function fitHands() {
  if (!P.parsed) return;
  const ms = [];
  P.parsed.events.forEach(ev => ev.notes.forEach(n => {
    let x = n + P.transpose;
    while (x < LO) x += 12;
    while (x > HI) x -= 12;
    ms.push(x);
  }));
  let best = -1, bl = leftBase, br = rightBase;
  for (const lb of [36, 48, 60]) for (const rb of [48, 60, 72]) {
    if (rb <= lb) continue;
    let c = 0;
    for (const m of ms) if ((m >= lb && m <= lb + LEFT_SPAN) || (m >= rb && m <= rb + RIGHT_SPAN)) c++;
    const score = c - 0.001 * (Math.abs(lb - 36) + Math.abs(rb - 60));
    if (score > best) { best = score; bl = lb; br = rb; }
  }
  leftBase = bl; rightBase = br;
  layout(); // quãng phím hiển thị phụ thuộc quãng tám của hai tay (layout tự cập nhật nhãn)
  syncHandsUI();
}
function syncHandsUI() {
  const nm = m => NAMES_EN[m % 12] + (Math.floor(m / 12) - 1);
  $('#leftBaseOut').textContent = nm(leftBase) + '–' + nm(leftBase + LEFT_SPAN);
  $('#rightBaseOut').textContent = nm(rightBase) + '–' + nm(rightBase + RIGHT_SPAN);
}

function loadSong(key) {
  const s = findSong(key);
  if (!s) return;
  stop();
  const parsed = parseSong(s.notation);
  if (parsed.errors.length) {
    toast('Bài này có lỗi: ' + parsed.errors[0].text);
    return;
  }
  P.songKey = key; P.rec = s; P.parsed = parsed;
  P.bpm = clamp(Number(s.bpm) || parsed.meta.bpm || 100, 20, 300);
  P.pos = 0; P.cur = 0; P.next = 0;
  if (kbLayout === 'twohand') fitHands();
  buildPending();
  $('#npTitle').textContent = s.name;
  $('#npSub').textContent = s.artist || '';
  $('#panelSongs').hidden = true;
  renderSongs();
  updateUI();
  // cuộn đàn tới quãng chứa giai điệu (trung vị các nốt)
  const ms = [];
  parsed.events.forEach(ev => ev.notes.forEach(m => ms.push(tn(m))));
  if (ms.length && viewLockX === null) { // khi đàn đang khóa vừa màn hình thì không cuộn
    ms.sort((a, b) => a - b);
    const sc = $('#scroller');
    sc.scrollLeft = Math.max(0, keyX[ms[ms.length >> 1]] - sc.clientWidth / 2);
  }
}
function unloadSong() {
  stop();
  P.songKey = null; P.rec = null; P.parsed = null;
  $('#npTitle').textContent = 'Chưa chọn bài — bấm BÀI HÁT';
  $('#npSub').textContent = 'Chơi bằng chuột, cảm ứng hoặc bàn phím máy tính.';
  renderSongs();
  updateUI();
}

/* ========== Vẽ nốt rơi + cập nhật phím sáng ========== */
const g = fallEl.getContext('2d'); // kích thước canvas do layout() đặt

function drawFall() {
  g.clearRect(0, 0, STAGE_W, FALL_H);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let m = LO; m <= HI; m++) {
    if (!isBlack(m)) { g.beginPath(); g.moveTo(keyX[m] + 0.5, 0); g.lineTo(keyX[m] + 0.5, FALL_H); g.stroke(); }
  }
  if (!P.parsed) return;
  const top = P.pos + FALL_H / PPB;
  for (const ev of P.parsed.events) {
    if (ev.start > top) break;
    if (ev.start + ev.dur < P.pos - 0.01) continue;
    const active = ev.start <= P.pos + 1e-6 && P.pos < ev.start + ev.dur;
    const y = FALL_H - (ev.start + ev.dur - P.pos) * PPB;
    const h = Math.max(showLetters ? 26 : 8, ev.dur * PPB - 3);
    for (const raw of ev.notes) {
      const m = tn(raw);
      const black = isBlack(m);
      if (handMap[m] === 'L') g.fillStyle = active ? '#ffe0ad' : '#ffa938';  // tay trái: màu cam
      else g.fillStyle = black ? (active ? '#d1b8ff' : '#8a5cf0') : (active ? '#a5e8fb' : '#2fb4dc');
      const inset = tinyKeys ? 1 : Math.max(4, Math.round(keyW[m] * 0.16));   // khối nốt hẹp hơn phím, không dính nhau
      const x = keyX[m] + inset, w = keyW[m] - 2 * inset;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, Math.min(9, w / 2)); else g.rect(x, y, w, h);
      g.fill();
      if (showLetters && hintMap[m]) { // chữ cái phím cần bấm, nằm ở đáy khối nốt (gần vạch đỏ nhất)
        g.fillStyle = handMap[m] === 'L' ? '#3a2200' : (black ? '#ffffff' : '#032a33');
        g.font = 'bold ' + clamp(Math.round(WW * (hintMap[m].length > 1 ? 0.4 : 0.6)), 9, 22) + 'px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText(hintMap[m], x + w / 2, y + h - 3);
      }
    }
  }
  g.fillStyle = '#d62828';
  g.fillRect(0, FALL_H - 3, STAGE_W, 3);
}

const keyState = {};
function updateKeys() {
  const lit = new Set(), target = new Set();
  if (P.parsed && P.playing) {
    if (P.mode === 'auto') {
      for (const ev of P.parsed.events) {
        if (ev.start > P.pos) break;
        if (P.pos < ev.start + ev.dur * 0.95) ev.notes.forEach(m => lit.add(tn(m)));
      }
    } else {
      P.pending.forEach(m => target.add(m));
    }
  }
  for (let m = LO; m <= HI; m++) {
    const st = (downCount[m] ? 1 : 0) | (lit.has(m) ? 2 : 0) | (target.has(m) ? 4 : 0);
    if (keyState[m] !== st) {
      keyState[m] = st;
      const c = keyEls[m].el.classList;
      c.toggle('down', !!(st & 1)); c.toggle('song', !!(st & 2)); c.toggle('target', !!(st & 4));
    }
  }
}

let lastTs = 0, seeking = false;

// Tự cuộn đàn tới các phím sắp phải bấm (điện thoại chỉ thấy ~10 phím trắng)
let autoScroll = true, lastUserScroll = -1e9;
function followView(dt) {
  if (viewLockX !== null) { // đàn đang vừa màn hình: giữ nguyên vị trí, không cuộn
    const s0 = $('#scroller');
    if (Math.abs(s0.scrollLeft - viewLockX) > 0.5) s0.scrollLeft = viewLockX;
    return;
  }
  if (!autoScroll || !P.playing || !P.parsed || performance.now() - lastUserScroll < 2500) return;
  const sc = $('#scroller'), view = sc.clientWidth;
  if (STAGE_W <= view) return;
  let lo = Infinity, hi = -Infinity;
  const add = m => { lo = Math.min(lo, keyX[m]); hi = Math.max(hi, keyX[m] + keyW[m]); };
  if (P.mode === 'follow') P.pending.forEach(add);
  const evs = P.parsed.events;
  let a = 0, b = evs.length;
  const from = P.pos - 0.3;
  while (a < b) { const mid = (a + b) >> 1; if (evs[mid].start < from) a = mid + 1; else b = mid; }
  for (let i = a; i < evs.length && evs[i].start <= P.pos + 1.5; i++) evs[i].notes.forEach(n => add(tn(n)));
  if (lo === Infinity) return;
  const left = sc.scrollLeft;
  if (lo >= left + view * 0.1 && hi <= left + view * 0.9) return; // đang nằm trong vùng nhìn thoải mái
  if (hi - lo > view * 0.9 && hi <= left + view * 0.97 && hi >= left + view * 0.6) return; // tay phải đã hiện rõ
  // hai tay cách xa hơn bề rộng màn hình: ưu tiên hiện tay phải (giai điệu), nếu không thì căn giữa
  const wide = hi - lo > view * 0.9;
  const target = clamp(wide ? hi - view * 0.9 : (lo + hi) / 2 - view / 2, 0, STAGE_W - view);
  let delta = (target - left) * Math.min(1, dt * 4);
  if (Math.abs(delta) < 1) delta = Math.sign(target - left);
  sc.scrollLeft = left + delta;
}
const markUserScroll = () => { lastUserScroll = performance.now(); };
fallEl.addEventListener('pointerdown', markUserScroll);
fallEl.addEventListener('touchmove', markUserScroll, { passive: true });
$('#scroller').addEventListener('wheel', markUserScroll, { passive: true });
function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (P.playing && P.parsed) {
    if (P.mode === 'auto') {
      P.pos = (actx.currentTime - P.t0) * bps();
    } else {
      P.pos += dt * bps();
      const ev = P.parsed.events[P.cur];
      if (ev && P.pos > ev.start) P.pos = ev.start;
    }
    if (P.pos >= P.parsed.total + 0.2) {
      const wasFollow = P.mode === 'follow';
      stop();
      $('#status').textContent = wasFollow ? '🎉 Hoàn thành bài!' : '';
    }
  }
  drawFall();
  updateKeys();
  followView(dt);
  if (P.parsed) {
    if (!seeking) $('#seek').value = Math.round(P.pos / P.parsed.total * 1000);
    $('#timeOut').textContent = fmt(P.pos * spb()) + ' / ' + fmt(P.parsed.total * spb());
  }
}

/* ========== Kho bài hát ========== */
let userSongs = [];
function loadUserSongs() {
  const arr = lsGet(STORE_KEY, []);
  userSongs = Array.isArray(arr) ? arr.filter(s => s && typeof s.name === 'string' && typeof s.notation === 'string') : [];
}
function saveUserSongs() {
  if (!lsSet(STORE_KEY, userSongs)) toast('Không lưu được vào trình duyệt — hãy dùng "Xuất JSON" để sao lưu.');
}
function groups() {
  const mk = (arr, source) => (Array.isArray(arr) ? arr : []).map(s => ({ ...s, source, key: source + ':' + s.id }));
  return [
    { title: 'Có sẵn', list: mk(window.BUNDLED_SONGS, 'builtin') },
    { title: 'Riêng tư', list: mk(window.PRIVATE_SONGS, 'private'), hideIfEmpty: true },
    { title: 'Của tôi', list: mk(userSongs, 'user'), emptyText: 'Chưa có bài nào. Bấm "＋ Thêm bài".' }
  ];
}
function findSong(key) {
  for (const gr of groups()) for (const s of gr.list) if (s.key === key) return s;
  return null;
}
function newId() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function renderSongs() {
  const root = $('#songList');
  root.textContent = '';
  for (const gr of groups()) {
    if (gr.hideIfEmpty && !gr.list.length) continue;
    const h = document.createElement('h3'); h.textContent = gr.title;
    const ul = document.createElement('ul');
    if (!gr.list.length) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = gr.emptyText || '';
      ul.appendChild(li);
    }
    for (const s of gr.list) {
      const li = document.createElement('li');
      li.className = 'song' + (s.key === P.songKey ? ' active' : '');
      li.dataset.key = s.key;
      const t = document.createElement('button');
      t.className = 'title'; t.dataset.act = 'load';
      t.textContent = s.name;
      const sm = document.createElement('small'); sm.textContent = s.artist || '';
      t.appendChild(sm);
      const acts = document.createElement('span'); acts.className = 'acts';
      const mkBtn = (act, label, title) => {
        const b = document.createElement('button');
        b.dataset.act = act; b.textContent = label; b.title = title; b.type = 'button';
        return b;
      };
      if (s.source === 'user') {
        acts.append(mkBtn('edit', '✎', 'Sửa'), mkBtn('del', '🗑', 'Xóa'));
      } else {
        acts.append(mkBtn('copy', '⧉', 'Sao chép để sửa'));
      }
      li.append(t, acts);
      ul.appendChild(li);
    }
    root.append(h, ul);
  }
}

$('#songList').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  const li = e.target.closest('li.song');
  if (!btn || !li) return;
  const key = li.dataset.key, s = findSong(key);
  if (!s) return;
  switch (btn.dataset.act) {
    case 'load': loadSong(key); break;
    case 'edit': openDialog(s, true); break;
    case 'copy': openDialog({ ...s, name: s.name + ' (bản sao)' }, false); break;
    case 'del':
      if (confirm('Xóa bài "' + s.name + '"?')) {
        userSongs = userSongs.filter(u => u.id !== s.id);
        saveUserSongs();
        if (P.songKey === key) unloadSong(); else renderSongs();
      }
      break;
  }
});

/* ========== Admin: bài riêng tư đã mã hóa (songs.private.enc.js) ==========
   Trên web công khai chỉ có bản mã hóa AES-256-GCM; khóa sinh từ mật khẩu bằng PBKDF2-SHA256.
   "Ghi nhớ" lưu khóa đã sinh (không lưu mật khẩu) vào localStorage của máy này. */
const ADMIN_KEY = 'vnpiano.adminKey.v1';
const ENC = window.PRIVATE_SONGS_ENC;
const adminMode = !!(ENC && ENC.v === 1 && !Array.isArray(window.PRIVATE_SONGS));
let adminOpen = false;
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u => { let s = ''; for (const b of new Uint8Array(u)) s += String.fromCharCode(b); return btoa(s); };
async function adminDerive(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(ENC.salt), iterations: ENC.iter }, base, 256));
}
async function adminDecrypt(raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ENC.iv) }, key, b64d(ENC.data));
  const arr = JSON.parse(new TextDecoder().decode(pt));
  if (!Array.isArray(arr)) throw new Error('dữ liệu lạ');
  return arr;
}
function adminSync() {
  const b = $('#btnAdmin');
  b.hidden = !adminMode;
  b.textContent = adminOpen ? '🔓 Thoát admin' : '🔒 Admin';
}
function adminUnlock(arr) {
  window.PRIVATE_SONGS = arr; adminOpen = true;
  adminSync(); renderSongs();
}
async function adminAuto() {
  if (!adminMode || !window.crypto || !crypto.subtle) return;
  const saved = lsGet(ADMIN_KEY, null);
  if (!saved || saved.salt !== ENC.salt) return;
  try { adminUnlock(await adminDecrypt(b64d(saved.key))); }
  catch (e) { try { localStorage.removeItem(ADMIN_KEY); } catch (_) {} }
}
const dlgAdmin = $('#dlgAdmin');
$('#btnAdmin').addEventListener('click', () => {
  if (adminOpen) {
    if (!confirm('Thoát admin? Các bài riêng tư sẽ bị ẩn và máy này sẽ quên mật khẩu.')) return;
    try { localStorage.removeItem(ADMIN_KEY); } catch (_) {}
    window.PRIVATE_SONGS = undefined; adminOpen = false;
    if (P.songKey && P.songKey.startsWith('private:')) unloadSong(); else renderSongs();
    adminSync();
    return;
  }
  if (!window.crypto || !crypto.subtle) { toast('Trình duyệt chỉ giải mã được khi mở web qua https://'); return; }
  $('#adminPw').value = ''; $('#adminErr').hidden = true;
  dlgAdmin.showModal(); $('#adminPw').focus();
});
$('#adminCancel').addEventListener('click', () => dlgAdmin.close());
$('#adminForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#adminPw').value, ok = $('#adminOk'), err = $('#adminErr');
  if (!pw) return;
  ok.disabled = true; ok.textContent = 'Đang mở…'; err.hidden = true;
  try {
    const raw = await adminDerive(pw);
    const arr = await adminDecrypt(raw);
    if ($('#adminRemember').checked) lsSet(ADMIN_KEY, { salt: ENC.salt, key: b64e(raw) });
    dlgAdmin.close();
    adminUnlock(arr);
    toast('Đã mở ' + arr.length + ' bài riêng tư');
  } catch (ex) {
    err.textContent = 'Sai mật khẩu.'; err.hidden = false;
    $('#adminPw').select();
  } finally { ok.disabled = false; ok.textContent = 'Mở'; }
});

/* ========== Hộp thoại thêm / sửa bài ========== */
const dlg = $('#dlg');
let editingId = null;       // id bài đang sửa (null = thêm mới)
let previewPrevKey = null;  // bài đang mở trước khi nghe thử
let previewing = false;

function openDialog(rec, isEdit) {
  editingId = isEdit ? rec.id : null;
  $('#dlgTitle').textContent = isEdit ? 'Sửa bài' : (rec && rec.notation ? 'Sao chép bài' : 'Thêm bài mới');
  $('#fName').value = rec ? rec.name || '' : '';
  $('#fArtist').value = rec ? rec.artist || '' : '';
  $('#fBpm').value = rec && rec.bpm ? rec.bpm : '';
  $('#fNotes').value = rec ? rec.notation || '' : '';
  showErrors([]);
  dlg.showModal();
}
function showErrors(errs) {
  const box = $('#fErr');
  box.hidden = !errs.length;
  box.textContent = errs.slice(0, 8).map(x => x.text).join('\n') + (errs.length > 8 ? '\n… và ' + (errs.length - 8) + ' lỗi nữa' : '');
  box.style.whiteSpace = 'pre-wrap';
}
function readForm() {
  const notation = $('#fNotes').value;
  const parsed = parseSong(notation);
  const bpmField = Number($('#fBpm').value);
  if ($('#fBpm').value !== '' && !(bpmField >= 20 && bpmField <= 300)) {
    parsed.errors.push({ text: 'BPM phải từ 20 đến 300' });
  }
  const bpm = $('#fBpm').value !== '' ? bpmField : (parsed.meta.bpm || 100);
  const name = $('#fName').value.trim() || parsed.meta.name || '';
  if (!name) parsed.errors.push({ text: 'Hãy nhập tên bài' });
  const artist = $('#fArtist').value.trim() || parsed.meta.artist || '';
  return { parsed, rec: { version: 1, id: editingId || newId(), name, artist, bpm, notation } };
}
function endPreview() {
  if (!previewing) return;
  previewing = false;
  stop();
  if (previewPrevKey && findSong(previewPrevKey)) loadSong(previewPrevKey); else unloadSong();
}

$('#btnPreview').addEventListener('click', () => {
  const { parsed, rec } = readForm();
  const errs = parsed.errors.filter(x => x.text !== 'Hãy nhập tên bài');
  showErrors(errs);
  if (errs.length) return;
  if (!previewing) previewPrevKey = P.songKey;
  stop();
  previewing = true;
  P.songKey = '__preview'; P.rec = rec; P.parsed = parsed;
  P.bpm = clamp(rec.bpm, 20, 300);
  P.mode = 'auto'; $('#mode').value = 'auto';
  P.pos = 0; P.cur = 0; P.next = 0;
  buildPending();
  play();
});
$('#btnCancel').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', endPreview);
dlg.addEventListener('cancel', () => { /* Esc: để dialog tự đóng */ });

$('#songForm').addEventListener('submit', e => {
  e.preventDefault();
  const { parsed, rec } = readForm();
  showErrors(parsed.errors);
  if (parsed.errors.length) return;
  rec.bpm = clamp(rec.bpm, 20, 300);
  const i = userSongs.findIndex(u => u.id === rec.id);
  if (i >= 0) userSongs[i] = rec; else userSongs.push(rec);
  saveUserSongs();
  previewPrevKey = null;
  previewing = false; // sự kiện "close" chạy bất đồng bộ, không để nó gỡ bài vừa lưu
  dlg.close();
  loadSong('user:' + rec.id);
  toast('Đã lưu bài "' + rec.name + '"');
});
$('#btnAdd').addEventListener('click', () => openDialog(null, false));

/* ========== Nhập / xuất JSON ========== */
$('#btnExport').addEventListener('click', () => {
  if (!userSongs.length) { toast('Chưa có bài nào của bạn để xuất.'); return; }
  const blob = new Blob([JSON.stringify({ app: 'vn-piano', version: 1, songs: userSongs }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'piano-viet-bai-hat.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#btnMidi').addEventListener('click', () => $('#midiInput').click());
$('#midiInput').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('File MIDI quá lớn (tối đa 5 MB).'); return; }
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = window.MidiImport.toSong(r.result, f.name);
      const rec = { version: 1, id: newId(), name: s.name, artist: 'Nhập từ MIDI', bpm: s.bpm,
        notation: '// Nhập từ file MIDI: ' + f.name + '\n' + s.notation };
      const parsed = parseSong(rec.notation);
      if (parsed.errors.length) { toast('Không nhập được: ' + parsed.errors[0].text); return; }
      userSongs.push(rec);
      if (!lsSet(STORE_KEY, userSongs)) { // không lưu được (đầy bộ nhớ trình duyệt): không giữ bài "ma" trong bộ nhớ
        userSongs.pop();
        toast('Không lưu được bài này vào trình duyệt (bộ nhớ đầy). Hãy xóa bớt bài cũ.');
        return;
      }
      loadSong('user:' + rec.id);
      toast('Đã nhập "' + s.name + '": ' + s.noteCount + ' nốt' + (s.removedNotes ? ' (đã bỏ ' + s.removedNotes + ' nốt lặp)' : '') + (s.tempoChanges ? ', có đổi tempo' : '') + '.');
    } catch (err) {
      toast('Không nhập được MIDI: ' + err.message);
    }
  };
  r.readAsArrayBuffer(f);
});
$('#btnImport').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (err) { toast('File không phải JSON hợp lệ.'); return; }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.songs) ? data.songs : null);
    if (!list) { toast('File không đúng định dạng bài hát.'); return; }
    let added = 0, skipped = 0;
    for (const s of list) {
      if (!s || typeof s.name !== 'string' || !s.name.trim() || typeof s.notation !== 'string' || parseSong(s.notation).errors.length) { skipped++; continue; }
      if (userSongs.some(u => u.name === s.name && u.notation === s.notation)) { skipped++; continue; }
      let id = typeof s.id === 'string' && s.id ? s.id : newId();
      if (userSongs.some(u => u.id === id)) id = newId();
      userSongs.push({ version: 1, id, name: s.name.trim(), artist: String(s.artist || ''), bpm: clamp(Number(s.bpm) || 100, 20, 300), notation: s.notation });
      added++;
    }
    saveUserSongs();
    renderSongs();
    toast('Đã nhập ' + added + ' bài' + (skipped ? ', bỏ qua ' + skipped + ' bài (trùng hoặc lỗi)' : '') + '.');
  };
  r.readAsText(f);
});

/* ========== Điều khiển & giao diện ========== */
function updateUI() {
  const has = !!P.parsed;
  $('#btnPlay').disabled = !has;
  $('#btnStop').disabled = !has;
  $('#btnEasy').disabled = !has;
  $('#btnEasy1').disabled = !has;
  $('#seek').disabled = !has;
  $('#btnPlay').textContent = playLabel();
  const st = $('#status');
  if (!has) st.textContent = '';
  else if (P.mode === 'follow') st.textContent = P.playing ? 'Bấm đúng các phím có viền vàng để bài đi tiếp.' : 'Chế độ chơi theo: bài sẽ chờ bạn bấm đúng phím.';
  else st.textContent = '';
}

$('#btnPlay').addEventListener('click', () => { if (P.playing) pause(); else play(); });
$('#btnStop').addEventListener('click', stop);
$('#mode').addEventListener('change', e => {
  const was = P.pos;
  stop();
  P.mode = e.target.value;
  if (P.parsed) { P.pos = was >= P.parsed.total ? 0 : was; P.cur = firstIdx(P.pos); buildPending(); }
  updateUI();
});
$('#speed').addEventListener('input', e => {
  const v = Number(e.target.value);
  if (P.playing && P.mode === 'auto') { const pos = P.pos; P.rate = v; P.t0 = actx.currentTime - pos / bps(); }
  else P.rate = v;
  $('#speedOut').textContent = v.toFixed(2) + '×';
});
$('#trans').addEventListener('input', e => {
  P.transpose = Number(e.target.value);
  $('#transOut').textContent = (P.transpose > 0 ? '+' : '') + P.transpose;
  if (P.parsed) buildPending();
});
const seekEl = $('#seek');
seekEl.addEventListener('pointerdown', () => { seeking = true; });
window.addEventListener('pointerup', () => { seeking = false; });
seekEl.addEventListener('input', () => { if (P.parsed) seekBeat(Number(seekEl.value) / 1000 * P.parsed.total); });

$('#volume').addEventListener('input', e => {
  volume = Number(e.target.value);
  if (master) master.gain.value = volume;
  savePrefs();
});
$('#labelMode').addEventListener('change', e => { labelMode = e.target.value; updateLabels(); savePrefs(); });
$('#octDown').addEventListener('click', () => { baseMidi = clamp(baseMidi - 12, 36, 72); layout(); scrollToBase(); });
$('#octUp').addEventListener('click', () => { baseMidi = clamp(baseMidi + 12, 36, 72); layout(); scrollToBase(); });
$('#scrollL').addEventListener('click', () => $('#scroller').scrollBy({ left: -280, behavior: 'smooth' }));
$('#scrollR').addEventListener('click', () => $('#scroller').scrollBy({ left: 280, behavior: 'smooth' }));

// --- điện thoại: nút cuộn đàn, chữ nút gọn, mở khóa âm thanh (iOS) ---
const scrollByPart = d => { const sc = $('#scroller'); sc.scrollBy({ left: d * sc.clientWidth * 0.6, behavior: 'smooth' }); };
$('#fabL').addEventListener('click', () => scrollByPart(-1));
$('#fabR').addEventListener('click', () => scrollByPart(1));
const smallMQ = window.matchMedia ? window.matchMedia('(max-width: 760px), (max-height: 520px)') : null;
function playLabel() {
  const s = !!(smallMQ && smallMQ.matches);
  return P.playing ? (s ? '⏸' : '⏸ Tạm dừng') : (s ? '▶' : '▶ Phát');
}
// màn nhỏ: chuyển thanh Tốc độ / Cao độ vào Cài đặt cho thanh điều khiển gọn
function placeSliders() {
  const s = $('#sliders'), home = $('#slidersHome');
  if (smallMQ && smallMQ.matches) home.appendChild(s); else $('.tctl').appendChild(s);
}
placeSliders();
if (smallMQ && smallMQ.addEventListener) smallMQ.addEventListener('change', () => { placeSliders(); updateUI(); });
// Safari/iOS chỉ cho phát âm thanh sau touchend/click: mở khóa ở lần chạm đầu tiên
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown', 'pointerup'];
function unlockAudio() {
  try {
    ensureAudio();
    const s = actx.createBufferSource();
    s.buffer = actx.createBuffer(1, 1, 22050);
    s.connect(actx.destination);
    s.start(0);
  } catch (e) { /* bỏ qua */ }
  if (actx && actx.state === 'running') UNLOCK_EVENTS.forEach(ev => window.removeEventListener(ev, unlockAudio, true));
}
UNLOCK_EVENTS.forEach(ev => window.addEventListener(ev, unlockAudio, true));
// nút bấm không giữ focus để phím Space/Enter không kích hoạt lại nút khi đang chơi
document.addEventListener('mouseup', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

let easyKey = 'keep'; // 'keep' = giữ nguyên giọng gốc, 'white' = dịch về phím trắng
function savePrefs() { lsSet(PREF_KEY, { volume, labelMode, instrument, kbLayout, sustainOn, letterMode, easyKey, autoScroll, foldHands, fitMode,
  metroBpm: metro.bpm, metroMeter: metro.meter, metroVol: metro.vol }); }
$('#easyKey').addEventListener('change', e => { easyKey = e.target.value; savePrefs(); });
$('#autoScroll').addEventListener('change', e => { autoScroll = e.target.value === 'on'; savePrefs(); });
$('#fitMode').addEventListener('change', e => { fitMode = e.target.value; savePrefs(); layout(); scrollToBase(); });

$('#letterMode').addEventListener('change', e => { letterMode = e.target.value; updateShowLetters(); savePrefs(); });
if (hoverMQ && hoverMQ.addEventListener) hoverMQ.addEventListener('change', updateShowLetters);

// --- Bản dễ: chỉ giai điệu, ít phím đen, để đánh bằng bàn phím laptop ---
function makeEasy(opts, tag) {
  if (!P.parsed || !P.rec) return;
  try {
    const r = window.EasyVersion.make(P.parsed, P.bpm, Object.assign({ transpose: easyKey === 'white' }, opts));
    const base = P.rec.name.replace(/\s*\((bản dễ|giai điệu)\)$/, '');
    const what = opts.leftHand === false ? 'chỉ giai điệu (tay phải)' : 'tay phải 1 nốt giai điệu + tay trái 1 nốt gốc mỗi hợp âm';
    const rec = { version: 1, id: newId(), name: base + ' (' + tag + ')', artist: P.rec.artist || '', bpm: P.bpm,
      notation: '// Bản dễ của "' + base + '": ' + what + ', ' + (r.shift ? 'dịch ' + (r.shift > 0 ? '+' : '') + r.shift + ' nửa cung' : 'giữ nguyên giọng') + '\n' + r.notation };
    const parsed = parseSong(rec.notation);
    if (parsed.errors.length) { toast('Không tạo được bản dễ: ' + parsed.errors[0].text); return; }
    userSongs.push(rec);
    if (!lsSet(STORE_KEY, userSongs)) {
      userSongs.pop();
      toast('Không lưu được bản dễ (bộ nhớ trình duyệt đầy). Hãy xóa bớt bài cũ.');
      return;
    }
    loadSong('user:' + rec.id);
    toast('Bản dễ: tay phải ' + r.rightCount + ' nốt' + (r.leftCount ? ', tay trái ' + r.leftCount + ' nốt' : '') +
      ' (bỏ ' + r.dropped + ' nốt quá nhanh), ' + (r.shift ? 'dịch ' + (r.shift > 0 ? '+' : '') + r.shift + ' nửa cung' : 'giữ nguyên giọng') + ', ' + r.whitePct + '% là phím trắng.');
  } catch (err) {
    toast('Không tạo được bản dễ: ' + err.message);
  }
}
$('#btnEasy').addEventListener('click', () => makeEasy({}, 'bản dễ'));
$('#btnEasy1').addEventListener('click', () => makeEasy({ leftHand: false }, 'giai điệu'));

// --- hiển thị chọn tiếng đàn kiểu cuộn (trước / hiện tại / sau) ---
function syncInstrumentUI() {
  const i = Math.max(0, INSTRUMENTS.findIndex(x => x[0] === instrument));
  const nm = k => (INSTRUMENTS[k] ? INSTRUMENTS[k][1] : '');
  const num = k => String(k + 1).padStart(3, '0') + '  ';
  $('#instPrevName').textContent = i > 0 ? num(i - 1) + nm(i - 1) : '';
  $('#instNextName').textContent = i < INSTRUMENTS.length - 1 ? num(i + 1) + nm(i + 1) : '';
  const cur = $('#instName');
  cur.textContent = '';
  const sm = document.createElement('small'); sm.textContent = String(i + 1).padStart(3, '0');
  cur.append(sm, nm(i));
}
function stepInstrument(d) {
  const i = INSTRUMENTS.findIndex(x => x[0] === instrument);
  const j = clamp(i + d, 0, INSTRUMENTS.length - 1);
  if (j === i) return;
  const sel = $('#instrument');
  sel.value = INSTRUMENTS[j][0];
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
$('#instPrev').addEventListener('click', () => stepInstrument(-1));
$('#instNext').addEventListener('click', () => stepInstrument(1));

// --- sustain, ngăn kéo, thanh công cụ ---
function setSustain(on) {
  sustainOn = on;
  $('#tabSustain').classList.toggle('on', on);
  $('#tabSustain').setAttribute('aria-pressed', String(on));
  savePrefs();
}
$('#tabSustain').addEventListener('click', () => setSustain(!sustainOn));

/* --- Máy đếm nhịp (metronome) ---
   Đang tự phát bài: gõ đúng phách của bài (theo P.t0 và tốc độ). Ngoài ra: chạy tự do theo metro.bpm.
   Lên lịch trước ~0,15 s bằng đồng hồ Web Audio nên không bị lệch khi trang bận. */
const metro = { on: false, bpm: 80, meter: 4, vol: 0.6, timer: 0, out: null, mode: '', lastK: -1, next: 0, k: 0 };
function metroClick(t, down) {
  if (!metro.out) { metro.out = actx.createGain(); metro.out.connect(actx.destination); }
  metro.out.gain.value = metro.vol;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'square';
  o.frequency.value = down ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(down ? 0.32 : 0.2, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(metro.out);
  o.start(t); o.stop(t + 0.06);
  const ms = Math.max(0, (t - actx.currentTime) * 1000), tab = $('#tabMetro');
  const h = setTimeout(() => { if (!metro.on) return; tab.classList.add('beat'); tab.classList.toggle('down', down);
    setTimeout(() => tab.classList.remove('beat', 'down'), 110); }, ms);
  metro.queued = (metro.queued || []).filter(q => q.t > actx.currentTime);
  metro.queued.push({ t, g, h });
}
function metroFlush() { // huỷ các tiếng gõ đã xếp lịch nhưng chưa kêu (khi đổi chế độ / tua / tắt)
  if (actx && metro.queued) metro.queued.forEach(q => { if (q.t > actx.currentTime) { q.g.disconnect(); clearTimeout(q.h); } });
  metro.queued = [];
}
function metroTick() {
  if (!metro.on || !actx || actx.state !== 'running') return;
  const now = actx.currentTime, hor = now + 0.15, M = Math.max(1, metro.meter);
  const want = P.playing && P.mode === 'auto' && P.parsed ? 'song' : 'free';
  if (metro.mode && metro.mode !== want) { metroFlush(); metro.mode = ''; }
  if (want === 'song') {
    const b = bps(), cur = (now - P.t0) * b;
    // mới vào / vừa tua / đổi tốc độ (P.t0 hoặc tốc độ đổi) -> xếp lịch lại từ phách hiện tại
    if (metro.mode !== 'song' || metro.t0 !== P.t0 || metro.b !== b) {
      metroFlush(); metro.lastK = Math.ceil(cur - 0.02) - 1; metro.t0 = P.t0; metro.b = b;
    }
    metro.mode = 'song';
    for (let k = Math.max(metro.lastK + 1, Math.ceil(cur - 0.02)); ; k++) {
      const t = P.t0 + k / b;
      if (t > hor) break;
      if (k >= 0 && t >= now - 0.02) metroClick(Math.max(t, now), M > 1 && k % M === 0);
      metro.lastK = k;
    }
  } else {
    const s = 60 / metro.bpm;
    if (metro.mode !== 'free' || metro.next < now - 0.2) { metro.mode = 'free'; metro.next = now + 0.06; metro.k = 0; }
    while (metro.next < hor) { metroClick(metro.next, M > 1 && metro.k % M === 0); metro.k++; metro.next += s; }
  }
}
function setMetro(on) {
  metro.on = on;
  $('#tabMetro').classList.toggle('on', on);
  $('#tabMetro').setAttribute('aria-pressed', String(on));
  clearInterval(metro.timer);
  metroFlush();
  metro.mode = '';
  if (on) { ensureAudio(); metro.timer = setInterval(metroTick, 25); metroTick(); }
}
$('#tabMetro').addEventListener('click', () => setMetro(!metro.on));
$('#metroBpm').addEventListener('input', e => {
  metro.bpm = clamp(+e.target.value || 80, 30, 240); $('#metroBpmOut').textContent = metro.bpm;
  if (metro.mode === 'free') { metroFlush(); metro.mode = ''; } // áp tốc độ mới ngay
  savePrefs();
});
$('#metroMeter').addEventListener('change', e => { metro.meter = +e.target.value || 4; metro.k = 0; savePrefs(); });
$('#metroVol').addEventListener('input', e => { metro.vol = clamp(+e.target.value, 0, 1); if (metro.out) metro.out.gain.value = metro.vol; savePrefs(); });

function togglePanel(id) {
  const p = $('#' + id), open = p.hidden;
  $('#panelSongs').hidden = true; $('#panelSettings').hidden = true;
  p.hidden = !open;
}
$('#tabSongs').addEventListener('click', () => togglePanel('panelSongs'));
$('#tabSettings').addEventListener('click', () => togglePanel('panelSettings'));
$('#tabNotepad').addEventListener('click', () => openDialog(null, false));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $('#' + b.dataset.close).hidden = true; }));
$('#scroller').addEventListener('pointerdown', () => { $('#panelSongs').hidden = true; $('#panelSettings').hidden = true; });
window.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#panelSongs').hidden = true; $('#panelSettings').hidden = true; } });
// tính lại kích thước đàn mỗi khi vùng đàn đổi cỡ (đổi cửa sổ, tải xong font...)
let layoutRaf = 0;
const relayoutSoon = () => { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(layout); };
if (window.ResizeObserver) new ResizeObserver(relayoutSoon).observe($('#scroller'));
window.addEventListener('resize', relayoutSoon);
window.addEventListener('load', relayoutSoon);

function syncLayoutUI() {
  $('#octGroup').hidden = kbLayout !== 'compact';
  $('#twoGroup').hidden = kbLayout !== 'twohand';
  if (kbLayout === 'twohand' && P.parsed) fitHands(); else layout();
  syncHandsUI();
  if (P.parsed) buildPending();
}
function shiftHand(hand, d) {
  if (hand === 'L') leftBase = clamp(leftBase + d, 36, 72);
  else rightBase = clamp(rightBase + d, 36, 72);
  layout();
  syncHandsUI();
  if (P.parsed) buildPending();
}
$('#leftDown').addEventListener('click', () => shiftHand('L', -12));
$('#leftUp').addEventListener('click', () => shiftHand('L', 12));
$('#rightDown').addEventListener('click', () => shiftHand('R', -12));
$('#rightUp').addEventListener('click', () => shiftHand('R', 12));
$('#foldHands').addEventListener('change', e => { foldHands = e.target.value === 'on'; savePrefs(); if (P.parsed) buildPending(); });
(() => {
  const sel = $('#instrument');
  INSTRUMENTS.forEach(([id, name]) => {
    const o = document.createElement('option'); o.value = id; o.textContent = name; sel.appendChild(o);
  });
  sel.value = instrument;
})();
$('#instrument').addEventListener('change', e => {
  instrument = e.target.value;
  savePrefs();
  syncInstrumentUI();
  if (instrument !== 'synth' && !sampleBank[instrument]) {
    toast('Đang tải tiếng đàn…');
    loadInstrument(instrument).then(() => { if (instrument !== 'synth') toast('Đã sẵn sàng: ' + e.target.selectedOptions[0].textContent); });
  }
});
$('#kbLayout').addEventListener('change', e => { kbLayout = e.target.value; savePrefs(); syncLayoutUI(); });
// ô chọn / thanh trượt không giữ focus sau khi chỉnh, để phím máy tính tiếp tục đánh đàn
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('select, input[type=range]')) e.target.blur(); });

/* ========== Khởi động ========== */
(function init() {
  const prefs = lsGet(PREF_KEY, {});
  if (typeof prefs.volume === 'number') { volume = clamp(prefs.volume, 0, 1); $('#volume').value = volume; }
  if (['en', 'vi', 'none'].includes(prefs.labelMode)) { labelMode = prefs.labelMode; $('#labelMode').value = labelMode; }
  // chuyển một lần từ tiếng Grand Piano (GM) cũ sang Concert Grand mới; sau đó tôn trọng lựa chọn của người dùng
  if (!lsGet('vnpiano.mig.salamander', false)) {
    lsSet('vnpiano.mig.salamander', true);
    if (prefs.instrument === 'acoustic_grand_piano') prefs.instrument = 'salamander_grand';
  }
  if (INSTRUMENTS.some(i => i[0] === prefs.instrument)) { instrument = prefs.instrument; $('#instrument').value = instrument; }
  if (['classic', 'compact', 'twohand'].includes(prefs.kbLayout)) kbLayout = prefs.kbLayout;
  if (typeof prefs.foldHands === 'boolean') foldHands = prefs.foldHands;
  $('#foldHands').value = foldHands ? 'on' : 'off';
  $('#kbLayout').value = kbLayout;
  if (typeof prefs.sustainOn === 'boolean') sustainOn = prefs.sustainOn;
  if (['fit', 'big', 'o2', 'o3', 'o4', 'o5'].includes(prefs.fitMode)) fitMode = prefs.fitMode;
  else if (coarsePointer) fitMode = 'big'; // điện thoại: 88 phím quá nhỏ để chạm, mặc định giữ phím to
  $('#fitMode').value = fitMode;
  if (typeof prefs.autoScroll === 'boolean') autoScroll = prefs.autoScroll;
  $('#autoScroll').value = autoScroll ? 'on' : 'off';
  if (['keep', 'white'].includes(prefs.easyKey)) easyKey = prefs.easyKey;
  $('#easyKey').value = easyKey;
  if (['auto', 'on', 'off'].includes(prefs.letterMode)) letterMode = prefs.letterMode;
  $('#letterMode').value = letterMode;
  updateShowLetters();
  $('#tabSustain').classList.toggle('on', sustainOn);
  if (typeof prefs.metroBpm === 'number') metro.bpm = clamp(Math.round(prefs.metroBpm), 30, 240);
  if ([1, 2, 3, 4, 6].includes(prefs.metroMeter)) metro.meter = prefs.metroMeter;
  if (typeof prefs.metroVol === 'number') metro.vol = clamp(prefs.metroVol, 0, 1);
  $('#metroBpm').value = metro.bpm; $('#metroBpmOut').textContent = metro.bpm;
  $('#metroMeter').value = String(metro.meter); $('#metroVol').value = metro.vol;
  syncInstrumentUI();
  buildKeyboard();
  syncLayoutUI();
  loadUserSongs();
  renderSongs();
  adminSync();
  adminAuto();
  updateUI();
  scrollToBase();
  requestAnimationFrame(frame);
})();

})();
