export const GRID = 18;
export const CELL = 14; // the board should stay compact, not fill the window

// Phones get a larger board (no on-screen D-pad any more, so the space is
// better spent on the play area). 18 * 20 = 360px internal resolution.
export const MOBILE_CELL = 20;
export const MOBILE_QUERY = "(max-width: 768px)";

// On phones the board grows TALLER (it can't get wider than the screen).
// Rows are picked per run from the space left on screen: viewport height
// minus this reserve (window chrome, header, toolbar, prompt line),
// capped so the whole board always fits without scrolling.
export const MOBILE_MAX_ROWS = 28;
export const MOBILE_RESERVED_HEIGHT = 320;

// Short, disconnected wall segments — used instead of full-width lines with
// a single shared gap, which is easy to accidentally cancel out where it
// crosses a perpendicular wall (that made the old MAZE RUN unsolvable).
export const hSegment = (y, xStart, length) =>
  Array.from({ length }, (_, i) => ({ x: xStart + i, y }));
export const vSegment = (x, yStart, length) =>
  Array.from({ length }, (_, i) => ({ x, y: yStart + i }));

export const LEVELS = [
  { id: 1, name: "OPEN FIELD", tick: 170, obstacles: [] },
  {
    id: 2,
    name: "OBSTACLE FIELD",
    tick: 155,
    obstacles: [
      { x: 3, y: 3 }, { x: 14, y: 3 }, { x: 3, y: 14 }, { x: 14, y: 14 },
      { x: 9, y: 2 }, { x: 9, y: 15 }, { x: 2, y: 6 }, { x: 15, y: 6 },
      { x: 2, y: 12 }, { x: 15, y: 12 },
    ],
  },
  {
    id: 3,
    name: "MAZE RUN",
    tick: 140,
    obstacles: [
      // Top wall: two segments, leaving open gaps at x 0-1, 8-9, and 16-17.
      ...hSegment(4, 2, 6),
      ...hSegment(4, 10, 6),
      // A few short center pillars — never a full column, so left/right
      // stay connected through the wide-open rows above and below them.
      ...vSegment(9, 6, 2),
      ...vSegment(9, 10, 2),
      // Bottom wall, gaps offset from the top wall's so the path zigzags.
      ...hSegment(13, 0, 6),
      ...hSegment(13, 8, 6),
    ],
  },
];

// Games listed on the select screen. Only Snake is playable for now.
export const GAMES = [
  { id: "snake", name: "SNAKE", desc: "Classic Nokia nibbler · 1997", available: true },
  { id: "tetris", name: "TETRIS", desc: "Falling blocks puzzle · 1984", available: false },
  { id: "pong", name: "PONG", desc: "Retro tennis rally · 1972", available: false },
];

export const bestKey = (levelId) => `snake-best-level-${levelId}`;

export const getBest = (levelId) => {
  try {
    return parseInt(localStorage.getItem(bestKey(levelId)) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

export const setBestIfHigher = (levelId, score) => {
  try {
    if (score > getBest(levelId)) localStorage.setItem(bestKey(levelId), String(score));
  } catch {
    /* private mode / storage disabled — ignore */
  }
};

export const INVINCIBLE_TICKS = 30; // ~4-5s depending on level speed
export const SPECIAL_EVERY_TICKS = 45;
export const SPECIAL_LIFETIME_TICKS = 40;
export const SPECIAL_SPAWN_CHANCE = 0.65;