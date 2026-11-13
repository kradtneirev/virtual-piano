/* Tạo "bản dễ" từ một bài đã đọc (parseSong) để đánh bằng bàn phím laptop:
 *  - Tay phải: chỉ giữ giai điệu, mỗi lúc một nốt (nốt cao nhất từ Mi giáng 4 trở lên).
 *  - Tay trái (tuỳ chọn): mỗi phách chỉ một nốt bass (nốt thấp nhất) thay cho cả hợp âm.
 *  - Bỏ nốt tay phải đến quá sát nhau (ngón tay không gõ kịp).
 *  - Dịch giọng sang giọng có ít nốt đen nhất (nốt đen phải giữ Shift) và đưa về quãng giữa đàn.
 * Trả về { notation, noteCount, rightCount, leftCount, dropped, shift, whitePct }.
 */
(function (root) {
  'use strict';

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var WHITE_PC = { 0: 1, 2: 1, 4: 1, 5: 1, 7: 1, 9: 1, 11: 1 };
  var LO = 36, HI = 96;

  function name(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function fmt(x) { return String(Math.round(x * 10000) / 10000); }

  function make(parsed, bpm, opts) {
    opts = opts || {};
    var minGapSec = opts.minGapSec || 0.2;
    var lhMinGap = opts.lhMinGap || 1.6;    // tay trái: mỗi hợp âm (~2 phách) một nốt gốc
    var transpose = opts.transpose !== false; // true: dịch về giọng ít phím đen; false: giữ nguyên giọng
    var split = opts.split || 63;           // dưới mức này coi là tay trái
    var leftHand = opts.leftHand !== false; // mặc định có tay trái
    var spb = 60 / bpm;

    // 0) Gom các nốt theo thời điểm bắt đầu
    var onsets = [];
    var evs = parsed.events;
    for (var i = 0; i < evs.length; i++) {
      var lastO = onsets[onsets.length - 1];
      if (lastO && evs[i].start <= lastO.start + 1e-6) {
        for (var k = 0; k < evs[i].notes.length; k++) lastO.notes.push({ midi: evs[i].notes[k], dur: evs[i].dur });
      } else {
        onsets.push({ start: evs[i].start, notes: evs[i].notes.map(function (m) { return { midi: m, dur: evs[i].dur }; }) });
      }
    }

    // 1) Tay phải: nốt cao nhất (>= split) tại mỗi thời điểm
    var rh = [];
    onsets.forEach(function (o) {
      var best = null;
      o.notes.forEach(function (n) {
        if (n.midi >= split && (!best || n.midi > best.midi || (n.midi === best.midi && n.dur > best.dur))) best = n;
      });
      if (best) rh.push({ midi: best.midi, start: o.start, dur: best.dur });
    });
    var rhTotal = rh.length;
    var rhKept = [];
    rh.forEach(function (n) {
      var l = rhKept[rhKept.length - 1];
      if (l && (n.start - l.start) * spb < minGapSec) return;
      rhKept.push(n);
    });
    for (var b = 0; b < rhKept.length; b++) {
      var nx = rhKept[b + 1];
      if (nx) rhKept[b].dur = Math.min(rhKept[b].dur, nx.start - rhKept[b].start);
      rhKept[b].dur = Math.max(0.05, rhKept[b].dur);
    }

    // 2) Tay trái: mỗi "phách" (cụm nốt cách nhau >= 0.8 phách) giữ một nốt thấp nhất
    var lh = [];
    if (leftHand) {
      var cluster = null;
      var flush = function () { if (cluster) lh.push(cluster); cluster = null; };
      onsets.forEach(function (o) {
        var low = null;
        o.notes.forEach(function (n) { if (n.midi < split && (!low || n.midi < low.midi)) low = n; });
        if (!low) return;
        if (!cluster || o.start - cluster.start >= 0.8) {
          flush();
          cluster = { midi: low.midi, start: o.start, dur: low.dur };
        } else if (low.midi < cluster.midi) {
          cluster.midi = low.midi;
        }
      });
      flush();
      // chỉ giữ một nốt cho mỗi ~2 phách (nốt gốc của hợp âm), bỏ các nốt đổi bass giữa chừng
      lh = lh.filter(function (n, idx, arr) {
        if (!n.keep) {
          var lastKept = null;
          for (var z = idx - 1; z >= 0; z--) if (arr[z].keep) { lastKept = arr[z]; break; }
          if (!lastKept || n.start - lastKept.start >= lhMinGap - 1e-6) n.keep = true;
        }
        return n.keep;
      });
      for (var c = 0; c < lh.length; c++) {
        var nxt = lh[c + 1];
        lh[c].dur = nxt ? Math.min(4, nxt.start - lh[c].start) : Math.min(4, lh[c].dur);
        lh[c].dur = Math.max(0.25, lh[c].dur);
      }
    }
    if (!rhKept.length && !lh.length) throw new Error('Không có nốt nào để tạo bản dễ.');

    // 3) Chọn độ dịch giọng (-6..+5 nửa cung) để nhiều nốt trắng nhất; hòa thì chọn dịch ít nhất
    var all = rhKept.concat(lh);
    var bestShift = 0, bestWhite = -1;
    for (var sh = transpose ? -6 : 0; sh <= (transpose ? 5 : 0); sh++) {
      var w = 0;
      for (var q = 0; q < all.length; q++) if (WHITE_PC[(((all[q].midi + sh) % 12) + 12) % 12]) w++;
      if (w > bestWhite || (w === bestWhite && Math.abs(sh) < Math.abs(bestShift))) { bestWhite = w; bestShift = sh; }
    }
    // đưa giai điệu (tay phải) về quãng giữa đàn: trung vị ~ F#4
    var ref = (rhKept.length ? rhKept : lh).map(function (n) { return n.midi + bestShift; }).sort(function (x, y) { return x - y; });
    var median = ref[ref.length >> 1];
    var octave = Math.round((66 - median) / 12) * 12;
    var totalShift = bestShift + octave;

    function place(n) {
      var m = n.midi + totalShift;
      while (m < LO) m += 12;
      while (m > HI) m -= 12;
      return { midi: m, start: n.start, dur: n.dur };
    }
    var out = rhKept.map(place).concat(lh.map(place));
    out.sort(function (a, b2) { return a.start - b2.start || b2.midi - a.midi; });
    // cùng lúc + cùng độ dài thì gộp thành một token (A+B)
    var groups = [];
    out.forEach(function (n) {
      var g = groups[groups.length - 1];
      if (g && Math.abs(g.start - n.start) < 0.0006 && Math.abs(g.dur - n.dur) < 0.0006) g.notes.push(n.midi);
      else groups.push({ start: n.start, dur: n.dur, notes: [n.midi] });
    });

    // 4) Ghi ra dạng chữ, vị trí tuyệt đối (^) để không lệch nhịp
    var cursor = 0, lastDur = 1, lines = [], line = [];
    groups.forEach(function (g) {
      if (Math.abs(g.start - cursor) > 0.0006) line.push('^' + fmt(g.start));
      var tok = g.notes.map(name).join('+');
      if (Math.abs(g.dur - lastDur) > 0.0006) tok += ':' + fmt(g.dur);
      line.push(tok);
      lastDur = g.dur;
      cursor = g.start + g.dur;
      if (line.length >= 12) { lines.push(line.join(' ')); line = []; }
    });
    if (line.length) lines.push(line.join(' '));

    var whiteAfter = out.filter(function (n) { return WHITE_PC[n.midi % 12]; }).length;
    return {
      notation: lines.join('\n'),
      noteCount: out.length,
      rightCount: rhKept.length,
      leftCount: lh.length,
      dropped: rhTotal - rhKept.length,
      shift: totalShift - octave, // chỉ tính phần đổi giọng, không tính đổi quãng tám
      whitePct: Math.round(100 * whiteAfter / out.length),
      medianMidi: median + octave
    };
  }

  var api = { make: make };
  root.EasyVersion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
