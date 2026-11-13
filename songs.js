/* Bài hát có sẵn (chỉ đọc). Đây là các giai điệu kinh điển đã hết bản quyền, ghi đúng nốt gốc.
 *
 * Định dạng mỗi bài: { id, name, artist, bpm, notation }
 * (xem cú pháp ở đầu file parser.js)
 *
 * Bài nổi tiếng dùng riêng: thêm vào file songs.private.js hoặc dùng nút "＋ Thêm bài".
 */
window.BUNDLED_SONGS = [
  {
    id: 'gam-do-truong',
    name: 'Gam Đô trưởng (tập tay)',
    artist: 'Bài tập',
    bpm: 90,
    notation: [
      'C4:1 D4 E4 F4 G4 A4 B4 C5:2',
      'C5:1 B4 A4 G4 F4 E4 D4 C4:2'
    ].join('\n')
  },
  {
    id: 'twinkle',
    name: 'Twinkle Twinkle Little Star',
    artist: 'Dân ca Pháp (Ah! vous dirai-je, maman)',
    bpm: 100,
    notation: [
      'C4:1 C4 G4 G4 | A4 A4 G4:2 | F4:1 F4 E4 E4 | D4 D4 C4:2 |',
      'G4:1 G4 F4 F4 | E4 E4 D4:2 | G4:1 G4 F4 F4 | E4 E4 D4:2 |',
      'C4:1 C4 G4 G4 | A4 A4 G4:2 | F4:1 F4 E4 E4 | D4 D4 C4:2'
    ].join('\n')
  },
  {
    id: 'frere-jacques',
    name: 'Kìa con bướm vàng (Frère Jacques)',
    artist: 'Dân ca Pháp',
    bpm: 110,
    notation: [
      'C4:1 D4 E4 C4 | C4 D4 E4 C4 |',
      'E4:1 F4 G4:2 | E4:1 F4 G4:2 |',
      'G4:0.5 A4 G4 F4 E4:1 C4 | G4:0.5 A4 G4 F4 E4:1 C4 |',
      'C4:1 G3 C4:2 | C4:1 G3 C4:2'
    ].join('\n')
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy (Khúc hoan ca)',
    artist: 'Beethoven — Giao hưởng số 9',
    bpm: 120,
    notation: [
      'E4:1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |',
      'E4:1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 |',
      'D4:1 D4 E4 C4 | D4 E4:0.5 F4 E4:1 C4 | D4 E4:0.5 F4 E4:1 D4 | C4 D4 G3:2 |',
      'E4:1 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2'
    ].join('\n')
  },
  {
    id: 'happy-birthday',
    name: 'Happy Birthday (Chúc mừng sinh nhật)',
    artist: 'Patty & Mildred Hill',
    bpm: 100,
    notation: [
      'G4:0.75 G4:0.25 A4:1 G4 C5 B4:2 |',
      'G4:0.75 G4:0.25 A4:1 G4 D5 C5:2 |',
      'G4:0.75 G4:0.25 G5:1 E5 C5 B4 A4 |',
      'F5:0.75 F5:0.25 E5:1 C5 D5 C5:2'
    ].join('\n')
  },
  {
    id: 'jingle-bells',
    name: 'Jingle Bells (điệp khúc)',
    artist: 'James Pierpont',
    bpm: 140,
    notation: [
      'E4:1 E4 E4:2 | E4:1 E4 E4:2 | E4:1 G4 C4:1.5 D4:0.5 | E4:4 |',
      'F4:1 F4 F4:1.5 F4:0.5 | F4:1 E4 E4 E4:0.5 E4 | E4:1 D4 D4 E4 | D4:2 G4:2 |',
      'E4:1 E4 E4:2 | E4:1 E4 E4:2 | E4:1 G4 C4:1.5 D4:0.5 | E4:4 |',
      'F4:1 F4 F4:1.5 F4:0.5 | F4:1 E4 E4 E4:0.5 E4 | G4:1 G4 F4 D4 | C4:4'
    ].join('\n')
  },
  {
    id: 'fur-elise',
    name: 'Für Elise (đoạn mở đầu, hai tay)',
    artist: 'Beethoven',
    bpm: 66,
    notation: [
      '// nhịp 3/8: nốt móc kép = 0.25 phách; mỗi ô nhịp = 1.5 phách',
      '^0 E5:0.25 D#5',
      '^0.5 E5 D#5 E5 B4 D5 C5',
      '^2 A4:0.5 ^2.75 C4:0.25 E4 A4   ^2 A2 E3 A3',
      '^3.5 B4:0.5 ^4.25 E4:0.25 G#4 B4   ^3.5 E2 E3 G#3',
      '^5 C5:0.5 ^5.75 E4:0.25 E5 D#5   ^5 A2 E3 A3',
      '^6.5 E5 D#5 E5 B4 D5 C5',
      '^8 A4:0.5 ^8.75 C4:0.25 E4 A4   ^8 A2 E3 A3',
      '^9.5 B4:0.5 ^10.25 E4:0.25 C5 B4   ^9.5 E2 E3 G#3',
      '^11 A4:1   ^11 A2:0.25 E3 A3'
    ].join('\n')
  }
];
