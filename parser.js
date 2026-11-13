/* Bộ đọc nốt nhạc dạng chữ -> danh sách sự kiện.
 *
 * Cú pháp (các token cách nhau bằng khoảng trắng; "|" chỉ là vạch nhịp, bị bỏ qua):
 *   C4  C#4  Db4        nốt (A-G, # hoặc b, quãng tám 0-8)
 *   C4:2  C4:0.5  C4:1/2  độ dài tính theo phách; bỏ trống = dùng lại độ dài trước (mặc định 1)
 *   R:1  hoặc  -:1      nghỉ
 *   C4+E4+G4:2          hợp âm (các nốt đánh cùng lúc)
 *   ^12.5               nhảy tới phách 12.5 (tuyệt đối) — dùng cho nhạc nhiều bè / nhập từ MIDI
 *   // ghi chú          hoặc  # ghi chú (# chỉ là ghi chú khi đứng đầu token)
 *   @bpm 100  @name Tên bài  @artist Ca sĩ    dòng thông tin (tuỳ chọn)
 */
(function (root) {
  'use strict';

  var LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MAX_EVENTS = 12000;
  var MAX_BEATS_PER_NOTE = 64;

  function parseNote(s) {
    var m = /^([A-Ga-g])([#b]?)(\d)$/.exec(s);
    if (!m) throw new Error('tên nốt phải có dạng C4, C#4 hoặc Db4');
    var midi = 12 * (Number(m[3]) + 1) + LETTER[m[1].toUpperCase()] +
      (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    if (midi < 21 || midi > 108) throw new Error('nốt nằm ngoài phạm vi A0–C8');
    return midi;
  }

  function parseDur(s) {
    var m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(s);
    if (!m) throw new Error('độ dài phải là số như 1, 0.5, 1/2');
    var d = Number(m[1]) / (m[2] !== undefined ? Number(m[2]) : 1);
    if (!isFinite(d) || d <= 0) throw new Error('độ dài phải lớn hơn 0');
    if (d > MAX_BEATS_PER_NOTE) throw new Error('độ dài tối đa là ' + MAX_BEATS_PER_NOTE + ' phách');
    return d;
  }

  function parseSong(text) {
    var errors = [], events = [], meta = {};
    var t = 0, lastDur = 1, tooLong = false, maxEnd = 0;
    var lines = String(text == null ? '' : text).split(/\r?\n/);

    function err(line, col, tok, msg) {
      errors.push({ line: line, col: col, token: tok, message: msg,
        text: 'Dòng ' + line + ', cột ' + col + ': "' + tok + '" — ' + msg });
    }

    for (var li = 0; li < lines.length && !tooLong; li++) {
      var line = lines[li].replace(/\/\/.*$/, '');

      var h = /^\s*@(\w+)\s*(.*)$/.exec(line);
      if (h) {
        var key = h[1].toLowerCase(), val = h[2].trim();
        if (key === 'bpm') {
          var b = Number(val);
          if (!(b >= 20 && b <= 300)) err(li + 1, 1, '@bpm', 'BPM phải từ 20 đến 300');
          else meta.bpm = b;
        } else if (key === 'name' || key === 'artist') {
          meta[key] = val;
        } else {
          err(li + 1, 1, '@' + h[1], 'dòng thông tin không hợp lệ (chỉ có @bpm, @name, @artist)');
        }
        continue;
      }

      var re = /[^\s|]+/g, m;
      while ((m = re.exec(line)) !== null) {
        var tok = m[0], col = m.index + 1;
        if (tok.charAt(0) === '#') break; // ghi chú đến hết dòng
        if (tok.charAt(0) === '^') {      // nhảy tới vị trí tuyệt đối (tính bằng phách), dùng cho nhạc nhiều bè
          var jump = Number(tok.slice(1));
          if (tok.length > 1 && isFinite(jump) && jump >= 0 && jump <= 100000) t = jump;
          else err(li + 1, col, tok, 'sau ^ phải là số phách, ví dụ ^12.5');
          continue;
        }
        try {
          var ci = tok.indexOf(':');
          var head = ci < 0 ? tok : tok.slice(0, ci);
          var durS = ci < 0 ? null : tok.slice(ci + 1);
          if (durS !== null && durS.indexOf(':') >= 0) throw new Error('chỉ được có một dấu ":"');
          var dur = durS === null ? lastDur : parseDur(durS);
          if (/^(r|-)$/i.test(head)) {
            // nghỉ: chỉ tăng thời gian
          } else {
            var notes = head.split('+').map(parseNote);
            events.push({ start: t, dur: dur, notes: notes });
            if (t + dur > maxEnd) maxEnd = t + dur;
          }
          t += dur;
          lastDur = dur;
        } catch (e) {
          err(li + 1, col, tok, e.message);
        }
        if (events.length > MAX_EVENTS) {
          err(li + 1, col, tok, 'bài quá dài (tối đa ' + MAX_EVENTS + ' nốt)');
          tooLong = true;
          break;
        }
      }
    }

    if (!errors.length && !events.length) {
      errors.push({ line: 1, col: 1, token: '', message: 'chưa có nốt nào',
        text: 'Chưa có nốt nào — hãy nhập ví dụ: C4:1 D4 E4 G4:2' });
    }
    events.sort(function (a, b) { return a.start - b.start; }); // ổn định: giữ thứ tự nhập khi cùng thời điểm
    return { events: events, meta: meta, total: Math.max(t, maxEnd), errors: errors };
  }

  var api = { parseSong: parseSong, parseNote: parseNote, parseDur: parseDur };
  root.NotationParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
