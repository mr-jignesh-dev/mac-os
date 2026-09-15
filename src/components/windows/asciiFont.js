


// A minimal 5x5 "block" font — good enough to render a FIGlet-style
// banner for any short name without pulling in the actual figlet package.
// Add more letters here if you ever change the display name.

const GLYPHS = {
  A: ['.███.', '█...█', '█████', '█...█', '█...█'],
  D: ['████.', '█...█', '█...█', '█...█', '████.'],
  E: ['█████', '█....', '████.', '█....', '█████'],
  G: ['.███.', '█....', '█.██.', '█...█', '.███.'],
  H: ['█...█', '█...█', '█████', '█...█', '█...█'],
  I: ['█████', '..█..', '..█..', '..█..', '█████'],
  J: ['....█', '....█', '....█', '█...█', '.███.'],
  K: ['█..█.', '█.█..', '██...', '█.█..', '█..█.'],
  M: ['█...█', '██.██', '█.█.█', '█...█', '█...█'],
  N: ['█...█', '██..█', '█.█.█', '█..██', '█...█'],
  S: ['.████', '█....', '.███.', '....█', '████.'],
  W: ['█...█', '█...█', '█.█.█', '██.██', '█...█'],
  ' ': ['.....', '.....', '.....', '.....', '.....'],
};

const FALLBACK = ['█████', '█...█', '█...█', '█...█', '█████'];

export function buildBanner(name) {
  const letters = name
    .toUpperCase()
    .split('')
    .map((ch) => GLYPHS[ch] || FALLBACK);

  const rows = [0, 1, 2, 3, 4].map((rowIdx) =>
    letters.map((glyph) => glyph[rowIdx]).join(' ')
  );

  return rows.join('\n');
}