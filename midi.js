/* Đọc file MIDI chuẩn (.mid) và đổi sang định dạng nốt của trang.
 * - Hỗ trợ format 0/1, nhiều track (hai tay), đổi tempo giữa bài.
 * - Bỏ kênh 10 (trống). Bỏ qua pedal, bend, v.v.
 * - Thời gian đổi sang "phách" ở tốc độ BPM cố định (tempo đầu tiên). Đoạn đổi tempo được co giãn
 *   cho nghe đúng như bản gốc, nên mọi bài đều chạy ở một BPM duy nhất.
 * - Mỗi nốt đặt ở vị trí tuyệt đối bằng token ^phách nên không bị lệch dần.
 */
(function (root) {
  'use strict';

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var MAX_NOTES = 20000;

  function noteName(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  function readText(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function parseMidi(buf) {
    var d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var p = 0;
    function need(n) { if (p + n > d.length) throw new Error('File MIDI bị cắt hoặc hỏng.'); }
    function u8() { need(1); return d[p++]; }
    function u16() { need(2); var v = (d[p] << 8) | d[p + 1]; p += 2; return v; }
    function u32() { need(4); var v = (d[p] * 16777216) + ((d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]); p += 4; return v; }
    function tag() { need(4); var s = String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]); p += 4; return s; }

    if (tag() !== 'MThd') throw new Error('Đây không phải file MIDI (.mid).');
    var hlen = u32();
    var format = u16(), ntrks = u16(), division = u16();
    p += Math.max(0, hlen - 6);
    if (division & 0x8000) throw new Error('MIDI dùng thời gian SMPTE, chưa được hỗ trợ.');
    if (division === 0) throw new Error('File MIDI không hợp lệ (division = 0).');

    var notes = [], tempos = [], names = [], warnings = [];

    for (var tr = 0; tr < ntrks && p < d.length; tr++) {
      var id = tag(), len = u32();
      var end = Math.min(d.length, p + len);
      if (id !== 'MTrk') { p = end; continue; }
      var tick = 0, running = 0;
      var open = {}; // "kênh:nốt" -> [{start, vel}]
      while (p < end) {
        // delta time (quãng biến thiên)
        var delta = 0, b, guard = 0;
        do { b = u8(); delta = delta * 128 + (b & 0x7f); if (++guard > 5) throw new Error('File MIDI hỏng (delta time).'); } while (b & 0x80);
        tick += delta;
        var status = d[p];
        if (status < 0x80) { status = running; if (!status) throw new Error('File MIDI hỏng (running status).'); }
        else { p++; if (status < 0xF0) running = status; }

        if (status === 0xFF) {
          var type = u8(), mlen = 0; guard = 0;
          do { b = u8(); mlen = mlen * 128 + (b & 0x7f); if (++guard > 5) throw new Error('File MIDI hỏng.'); } while (b & 0x80);
          need(mlen);
          var data = d.subarray(p, p + mlen); p += mlen;
          if (type === 0x51 && mlen === 3) tempos.push({ tick: tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (type === 0x03 && tr <= 1 && mlen) names.push(readText(data));
          else if (type === 0x2F) break;
        } else if (status === 0xF0 || status === 0xF7) {
          var slen = 0; guard = 0;
          do { b = u8(); slen = slen * 128 + (b & 0x7f); if (++guard > 5) throw new Error('File MIDI hỏng.'); } while (b & 0x80);
          need(slen); p += slen;
        } else {
          var hi = status & 0xF0, ch = status & 0x0F;
          var n1 = u8(), n2 = (hi === 0xC0 || hi === 0xD0) ? 0 : u8();
          if (ch === 9) continue; // trống
          if (hi === 0x90 && n2 > 0) {
            var key = ch + ':' + n1;
            (open[key] = open[key] || []).push(tick);
          } else if (hi === 0x80 || (hi === 0x90 && n2 === 0)) {
            var k2 = ch + ':' + n1, st = open[k2];
            if (st && st.length) { notes.push({ midi: n1, on: st.shift(), off: tick }); }
          }
        }
      }
      // nốt chưa tắt đến hết track
      Object.keys(open).forEach(function (k) {
        // nốt không bao giờ tắt: coi như dài 1 phách (không kéo đến hết bài)
        open[k].forEach(function (s) { notes.push({ midi: Number(k.split(':')[1]), on: s, off: s + division }); });
      });
      p = end;
    }
    return { format: format, division: division, notes: notes, tempos: tempos, names: names, warnings: warnings };
  }

  function toSong(buf, fileName) {
    var m = parseMidi(buf);
    if (!m.notes.length) throw new Error('Không tìm thấy nốt nhạc nào trong file MIDI (có thể chỉ có trống).');
    if (m.notes.length > MAX_NOTES) throw new Error('Bài quá dài (' + m.notes.length + ' nốt, tối đa ' + MAX_NOTES + ').');

    // bản đồ tempo: tick -> giây
    var tempos = m.tempos.slice().sort(function (a, b) { return a.tick - b.tick; });
    if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
    var constant = tempos.every(function (t) { return t.us === tempos[0].us; });
    var bpm = Math.max(20, Math.min(300, Math.round(60e6 / tempos[0].us)));
    var segs = [], acc = 0;
    for (var i = 0; i < tempos.length; i++) {
      segs.push({ tick: tempos[i].tick, sec: acc, us: tempos[i].us });
      if (i + 1 < tempos.length) acc += (tempos[i + 1].tick - tempos[i].tick) * tempos[i].us / (m.division * 1e6);
    }
    function tickToBeat(tick) {
      if (constant) return tick / m.division * (tempos[0].us / (60e6 / bpm)); // = tick/division khi bpm khớp tempo
      // tìm nhị phân đoạn tempo cuối có tick <= tick
      var lo = 0, hi = segs.length - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (segs[mid].tick <= tick) lo = mid; else hi = mid - 1; }
      var s = segs[lo];
      var sec = s.sec + (tick - s.tick) * s.us / (m.division * 1e6);
      return sec * bpm / 60;
    }

    var ns = m.notes.map(function (n) {
      var a = tickToBeat(n.on), b = tickToBeat(n.off);
      // độ dài tối đa 64 phách (giới hạn của bộ đọc nốt)
      return { midi: n.midi, start: Math.round(a * 10000) / 10000, dur: Math.min(64, Math.max(0.05, Math.round((b - a) * 10000) / 10000)) };
    }).filter(function (n) { return n.midi >= 21 && n.midi <= 108; });
    var before = ns.length;
    ns = cleanNotes(ns, 60 / bpm);
    ns.sort(function (a, b) { return a.start - b.start || b.dur - a.dur || a.midi - b.midi; });

    // gom các nốt cùng lúc, cùng độ dài thành hợp âm
    var groups = [];
    ns.forEach(function (n) {
      var g = groups.length ? groups[groups.length - 1] : null;
      if (g && Math.abs(g.start - n.start) < 0.003 && Math.abs(g.dur - n.dur) < 0.003) g.notes.push(n.midi);
      else groups.push({ start: n.start, dur: n.dur, notes: [n.midi] });
    });

    if (groups.length > 12000) throw new Error('Bài quá dài (' + groups.length + ' nhóm nốt, tối đa 12000).');

    function fmt(x) { return String(Math.round(x * 10000) / 10000); }
    var cursor = 0, lastDur = 1, lines = [], line = [];
    groups.forEach(function (g) {
      if (Math.abs(g.start - cursor) > 0.0006) line.push('^' + fmt(g.start));
      var tok = g.notes.map(noteName).join('+');
      if (Math.abs(g.dur - lastDur) > 0.0006) tok += ':' + fmt(g.dur);
      line.push(tok);
      lastDur = g.dur;
      cursor = g.start + g.dur;
      if (line.length >= 10) { lines.push(line.join(' ')); line = []; }
    });
    if (line.length) lines.push(line.join(' '));

    var base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    var name = (base || m.names[0] || 'Bài từ MIDI').slice(0, 100);
    return {
      name: name, bpm: bpm, notation: lines.join('\n'),
      noteCount: ns.length, removedNotes: before - ns.length, tempoChanges: constant ? 0 : tempos.length - 1
    };
  }

  /* Dọn nốt lặp thường gặp trong MIDI nhiều nhạc cụ (spb = giây mỗi phách):
   * 1) Nhiều track/kênh đánh cùng một phím cùng lúc (lệch ≤ 30 ms) -> giữ một nốt (dài nhất).
   * 2) Rung (tremolo): cùng phím đánh lại liên tục cực nhanh (nốt ≤ 60 ms, nghỉ ≤ 25 ms, từ 3 nốt) -> một nốt ngân.
   *    Ngưỡng chặt để không gộp nhầm láy (trill) hay đoạn nốt lặp nhanh của bản piano thật.
   * 3) Một nốt đang ngân mà bên trong có ≥ 3 nốt cùng phím (track khác đánh lặp liên tục) -> bỏ các nốt bên trong.
   *    Ít hơn thì coi là đánh lại thật: giữ, chỉ cắt nốt đang ngân tại chỗ đánh lại. */
  function cleanNotes(ns, spb) {
    var SAME = 0.03 / spb, TREM_DUR = 0.06 / spb, TREM_GAP = 0.025 / spb;
    var byKey = {}, out = [];
    ns.forEach(function (n) { (byKey[n.midi] = byKey[n.midi] || []).push({ midi: n.midi, start: n.start, end: n.start + n.dur }); });
    Object.keys(byKey).forEach(function (k) {
      var a = byKey[k].sort(function (x, y) { return x.start - y.start || y.end - x.end; });
      // 1) gộp nốt cùng lúc
      var u = [];
      a.forEach(function (n) {
        var last = u.length ? u[u.length - 1] : null;
        if (last && n.start - last.start <= SAME) last.end = Math.max(last.end, n.end);
        else u.push({ midi: n.midi, start: n.start, end: n.end });
      });
      // 2) gộp chuỗi rung
      var t = [];
      for (var i = 0; i < u.length; i++) {
        var j = i;
        while (j + 1 < u.length && u[j].end - u[j].start <= TREM_DUR && u[j + 1].start - u[j].end <= TREM_GAP &&
               u[j + 1].end - u[j + 1].start <= TREM_DUR) j++;
        if (j - i >= 2) { t.push({ midi: u[i].midi, start: u[i].start, end: u[j].end }); i = j; }
        else t.push(u[i]);
      }
      // 3) nốt nằm gọn trong nốt đang ngân
      var keep = [];
      for (i = 0; i < t.length; i++) {
        var h = t[i], inner = [];
        for (j = i + 1; j < t.length && t[j].start < h.end; j++) if (t[j].end <= h.end + SAME) inner.push(j); else break;
        if (inner.length >= 3 && inner.length === j - i - 1) { keep.push(h); i = j - 1; continue; }
        if (i + 1 < t.length && t[i + 1].start < h.end) h.end = t[i + 1].start; // đánh lại: cắt nốt trước
        keep.push(h);
      }
      keep.forEach(function (n) { out.push({ midi: n.midi, start: Math.round(n.start * 10000) / 10000, dur: Math.min(64, Math.max(0.05, Math.round((n.end - n.start) * 10000) / 10000)) }); });
    });
    return out;
  }

  var api = { parseMidi: parseMidi, toSong: toSong };
  root.MidiImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
