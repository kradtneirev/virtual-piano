// Mã hóa songs.private.js -> songs.private.enc.js (AES-256-GCM, khóa PBKDF2-SHA256 từ mật khẩu).
// Chạy: node tools/ma-hoa-bai-rieng.js   (mật khẩu nhập ẩn, không lưu ở đâu cả)
// Nếu mật khẩu giống lần trước thì giữ nguyên "salt" để các máy đã "Ghi nhớ" không phải nhập lại.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { webcrypto: wc } = require('crypto');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'songs.private.js');
const OUT = path.join(ROOT, 'songs.private.enc.js');
const ITER = 600000;

function askHidden(q) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    if (!stdin.isTTY) { // không có bàn phím (chạy tự động): lấy lần lượt từng dòng của stdin
      if (!askHidden.lines) askHidden.lines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
      process.stdout.write('\n');
      return resolve(askHidden.lines.shift() || '');
    }
    let pw = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = s => {
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(pw); }
        if (ch === '\u0003') { process.stdout.write('\n'); return reject(new Error('Đã hủy')); }
        if (ch === '\b' || ch === '\u007f') { if (pw) { pw = pw.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (ch >= ' ') { pw += ch; process.stdout.write('*'); }
      }
    };
    stdin.on('data', onData);
  });
}
const b64 = u => Buffer.from(u).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));

async function derive(pw, salt) {
  const base = await wc.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function readOld() {
  try {
    const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), ctx);
    const e = ctx.window.PRIVATE_SONGS_ENC; return e && e.v === 1 ? e : null;
  } catch (_) { return null; }
}

(async () => {
  if (!fs.existsSync(SRC)) throw new Error('Không thấy ' + SRC);
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), ctx);
  const songs = ctx.window.PRIVATE_SONGS;
  if (!Array.isArray(songs) || !songs.length) throw new Error('songs.private.js không có bài nào');
  console.log('Sẽ mã hóa ' + songs.length + ' bài riêng tư.');

  const pw = await askHidden('Mật khẩu admin (ít nhất 12 ký tự): ');
  if (pw.length < 12) throw new Error('Mật khẩu quá ngắn — cần ít nhất 12 ký tự.');
  const old = readOld();
  let salt = null;
  if (old && old.iter === ITER) { // thử mật khẩu với file cũ: đúng thì giữ salt
    try {
      const k = await derive(pw, unb64(old.salt));
      await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(old.iv) }, k, unb64(old.data));
      salt = unb64(old.salt);
      console.log('Mật khẩu giống lần trước — các máy đã "Ghi nhớ" vẫn tự mở được.');
    } catch (_) { /* mật khẩu mới */ }
  }
  if (!salt) {
    const pw2 = await askHidden('Nhập lại mật khẩu: ');
    if (pw2 !== pw) throw new Error('Hai lần nhập không khớp.');
    salt = wc.getRandomValues(new Uint8Array(16));
  }
  const key = await derive(pw, salt);
  const iv = wc.getRandomValues(new Uint8Array(12));
  const data = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(songs)));
  const obj = { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) };
  fs.writeFileSync(OUT, '// Bài riêng tư đã mã hóa (AES-256-GCM). Tạo bằng tools/ma-hoa-bai-rieng.js — đừng sửa tay.\n' +
    'window.PRIVATE_SONGS_ENC = ' + JSON.stringify(obj) + ';\n', 'utf8');
  console.log('Xong: ' + OUT + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
  // Đổi số phiên bản trong index.html để trình duyệt không dùng bản cũ đã lưu tạm.
  const IDX = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(IDX, 'utf8');
  const html2 = html.replace(/songs\.private\.enc\.js(\?v=\d+)?"/, 'songs.private.enc.js?v=' + Date.now() + '"');
  if (html2 !== html) fs.writeFileSync(IDX, html2, 'utf8');
})().catch(e => { console.error('LỖI: ' + e.message); process.exit(1); });
