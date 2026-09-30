import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { RiGamepadLine, RiKeyboardFill } from "react-icons/ri";
import MacWindow from "./MacWindow";
import "./cli.scss";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl";

/** Reads the currently-active --cli-accent off a DOM node (CSS custom
 *  properties inherit down the tree, so this picks up whichever theme
 *  class — default/dracula/monokai/matrix — is on the ancestor .cli-window
 *  right now). Falls back to the default theme's teal if unavailable. */
const getAccentColor = (node, fallback = "#34d399") => {
  if (!node || typeof getComputedStyle === "undefined") return fallback;
  const val = getComputedStyle(node).getPropertyValue("--cli-accent").trim();
  return val || fallback;
};

const TypedText = ({ text, speed = 8, onDone, onUpdate }) => {
  const [shown, setShown] = useState("");

  useEffect(() => {
    let i = 0;
    setShown("");
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      onUpdate && onUpdate();
      if (i >= text.length) {
        clearInterval(id);
        onDone && onDone();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return <pre className="cli-out">{shown}</pre>;
};

const CommandChips = ({ items, onRun }) => (
  <div className="cli-chips">
    {items.map((item) => (
      <button
        key={item.label}
        type="button"
        className="cli-chip"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRun(item.run);
        }}
      >
        {item.label}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Snake Arcade — retro cabinet flow: select game -> select level -> play.
// Levels add obstacles and increase speed; two special pickups spawn during
// play (gold = +5 bonus points, cyan = temporary "ghost mode" through walls
// and obstacles). Best score per level is kept in localStorage.
// ---------------------------------------------------------------------------

const GRID = 18;
const CELL = 14; // the board should stay compact, not fill the window

// Short, disconnected wall segments — used instead of full-width lines
// with a single shared gap, which is easy to accidentally cancel out where
// it crosses a perpendicular wall (that made the old MAZE RUN unsolvable).
const hSegment = (y, xStart, length) =>
  Array.from({ length }, (_, i) => ({ x: xStart + i, y }));
const vSegment = (x, yStart, length) =>
  Array.from({ length }, (_, i) => ({ x, y: yStart + i }));

const LEVELS = [
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
const GAMES = [
  { id: "snake", name: "SNAKE", desc: "Classic Nokia nibbler · 1997", available: true },
  { id: "tetris", name: "TETRIS", desc: "Falling blocks puzzle · 1984", available: false },
  { id: "pong", name: "PONG", desc: "Retro tennis rally · 1972", available: false },
];

const bestKey = (levelId) => `snake-best-level-${levelId}`;
const getBest = (levelId) => {
  try {
    return parseInt(localStorage.getItem(bestKey(levelId)) || "0", 10) || 0;
  } catch {
    return 0;
  }
};
const setBestIfHigher = (levelId, score) => {
  try {
    if (score > getBest(levelId)) localStorage.setItem(bestKey(levelId), String(score));
  } catch {
    /* private mode / storage disabled — ignore */
  }
};

const INVINCIBLE_TICKS = 30; // ~4-5s depending on level speed
const SPECIAL_EVERY_TICKS = 45;
const SPECIAL_LIFETIME_TICKS = 40;
const SPECIAL_SPAWN_CHANCE = 0.65;

// ---------------------------------------------------------------------------
// Shared canvas drawing. These live at module level (not inside a component)
// and take the cell size as an argument, so the real game AND the select-
// screen preview render through the exact same code. That is the actual fix
// for "the two snakes look different": there is only one snake renderer.
// ---------------------------------------------------------------------------

/** A little pixel-art apple: body, leaf, stem. */
const drawApple = (ctx, cellX, cellY, cellSize) => {
  const cx = cellX * cellSize + cellSize / 2;
  const cy = cellY * cellSize + cellSize / 2;
  const r = cellSize * 0.4;

  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.15, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4caf50";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.55, cy - r * 0.95, r * 0.4, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = Math.max(1, cellSize * 0.09);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.75);
  ctx.lineTo(cx + r * 0.2, cy - r * 1.3);
  ctx.stroke();
};

/** A round pickup (bonus/power). */
const drawPickup = (ctx, cellX, cellY, cellSize, color) => {
  const cx = cellX * cellSize + cellSize / 2;
  const cy = cellY * cellSize + cellSize / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
  ctx.fill();
};

/** Snake as one smooth stroked tube through segment centers, with a lighter
 *  highlight line down the middle. */
const drawSnake = (ctx, snake, color, cellSize) => {
  if (snake.length === 1) {
    const cx = snake[0].x * cellSize + cellSize / 2;
    const cy = snake[0].y * cellSize + cellSize / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let prev = null;
  snake.forEach((seg) => {
    const cx = seg.x * cellSize + cellSize / 2;
    const cy = seg.y * cellSize + cellSize / 2;
    // Adjacent segments are always exactly 1 cell apart. A bigger gap only
    // happens right after a ghost-mode wall wrap, where the head teleports
    // to the opposite edge while the segments behind it are still on the far
    // side — start a new subpath there instead of stretching a line across.
    if (!prev || Math.abs(seg.x - prev.x) > 1 || Math.abs(seg.y - prev.y) > 1) {
      ctx.moveTo(cx, cy);
    } else {
      ctx.lineTo(cx, cy);
    }
    prev = seg;
  });

  ctx.strokeStyle = color;
  ctx.lineWidth = cellSize * 0.72;
  ctx.stroke();

  // lighter centerline — the "double outline" tube look
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = cellSize * 0.72 * 0.3;
  ctx.stroke();
};

/** Self-playing demo for the select screen. It uses the same drawSnake and
 *  drawApple as the real game, and actually hunts the apple, so what you see
 *  here is what you get when you press start. */
const AttractPreview = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const COLS = 12;
    const ROWS = 12;
    const size = 14;
    canvas.width = COLS * size;
    canvas.height = ROWS * size;
    const accent = getAccentColor(canvas);

    const DIRS = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ];
    const startSnake = () => [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
    const inBounds = (p) => p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS;
    const onSnake = (snake, p) => snake.some((s) => s.x === p.x && s.y === p.y);
    const randomFood = (snake) => {
      let p;
      let guard = 0;
      do {
        p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        guard += 1;
      } while (guard < 100 && onSnake(snake, p));
      return p;
    };

    let snake = startSnake();
    let dir = { x: 1, y: 0 };
    let food = randomFood(snake);
    let raf;
    let last = 0;

    const render = () => {
      ctx.fillStyle = "#0a0d12";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawApple(ctx, food.x, food.y, size);
      drawSnake(ctx, snake, accent, size);
    };

    const step = () => {
      const head = snake[0];
      // Candidate moves: never reverse, stay on the board, never hit itself.
      const options = DIRS.filter((d) => !(d.x === -dir.x && d.y === -dir.y))
        .map((d) => ({ d, p: { x: head.x + d.x, y: head.y + d.y } }))
        .filter(({ p }) => inBounds(p) && !onSnake(snake.slice(0, -1), p));

      if (options.length === 0) {
        // Boxed in — restart the demo.
        snake = startSnake();
        dir = { x: 1, y: 0 };
        food = randomFood(snake);
        return;
      }

      // Usually head toward the apple, occasionally wander.
      const dist = (p) => Math.abs(p.x - food.x) + Math.abs(p.y - food.y);
      options.sort((a, b) => dist(a.p) - dist(b.p));
      const pick = Math.random() < 0.8 ? options[0] : options[Math.floor(Math.random() * options.length)];

      dir = pick.d;
      const ate = pick.p.x === food.x && pick.p.y === food.y;
      snake = [pick.p, ...snake];
      if (ate) {
        if (snake.length > 12) snake.pop(); // cap the length so it never fills the screen
        food = randomFood(snake);
      } else {
        snake.pop();
      }
    };

    render();
    const loop = (ts) => {
      if (ts - last > 170) {
        last = ts;
        step();
        render();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="cli-snake-preview-canvas" />;
};

const SnakeArcade = forwardRef(({ onGameOver, onGameStart }, ref) => {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const audioCtxRef = useRef(null);
  const countdownTimers = useRef([]);

  const [screen, setScreen] = useState("menu"); // menu | levels | game
  const [levelIndex, setLevelIndex] = useState(0);
  const [phase, setPhase] = useState("ready"); // ready | countdown | playing | paused | over
  const [score, setScore] = useState(0);
  const [invincibleLeft, setInvincibleLeft] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      const saved = localStorage.getItem("snake-sound");
      return saved === null ? true : JSON.parse(saved);
    } catch {
      return true;
    }
  });

  const level = LEVELS[levelIndex];

  // ---------------------------------------------------------------------
  // Synthesized sound effects — no audio files to host or load.
  // ---------------------------------------------------------------------
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const beep = (freq, duration = 0.06, type = "square", sweepFrom) => {
    if (!soundOn) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(sweepFrom || freq, ctx.currentTime);
      if (sweepFrom) osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* Web Audio unavailable — game still works without sound */
    }
  };

  const playClick = () => beep(520, 0.045, "square");
  const playEat = () => beep(880, 0.09, "square", 480);
  const playBonus = () => beep(1200, 0.12, "square", 700);
  const playPower = () => beep(300, 0.22, "sine", 900);
  const playGameOver = () => beep(110, 0.35, "sawtooth", 420);

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try {
        localStorage.setItem("snake-sound", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ---------------------------------------------------------------------
  // Game state (mutable ref — avoids a re-render every tick)
  // ---------------------------------------------------------------------
  const randomEmptyCell = (snake, obstacles, exclude = []) => {
    let pos;
    let guard = 0;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      guard += 1;
    } while (
      guard < 200 &&
      (snake.some((s) => s.x === pos.x && s.y === pos.y) ||
        obstacles.some((o) => o.x === pos.x && o.y === pos.y) ||
        exclude.some((e) => e.x === pos.x && e.y === pos.y))
    );
    return pos;
  };

  const freshState = (lvl) => {
    const snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
    return {
      snake,
      dir: { x: 1, y: 0 },
      pendingDir: { x: 1, y: 0 },
      obstacles: lvl.obstacles,
      food: randomEmptyCell(snake, lvl.obstacles),
      special: null,
      specialTicksLeft: 0,
      invincibleTicksLeft: 0,
      tickCount: 0,
      score: 0,
      over: false,
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!s) return;

    ctx.fillStyle = "#3b4457";
    s.obstacles.forEach((o) => ctx.fillRect(o.x * CELL, o.y * CELL, CELL - 1, CELL - 1));

    drawApple(ctx, s.food.x, s.food.y, CELL);

    if (s.special) {
      const blinking = s.specialTicksLeft < 10 && s.specialTicksLeft % 4 < 2;
      if (!blinking) {
        drawPickup(ctx, s.special.x, s.special.y, CELL, s.special.kind === "bonus" ? "#ffd23f" : "#4fd9ff");
      }
    }

    const invincible = s.invincibleTicksLeft > 0;
    const ghostFlash = invincible && s.tickCount % 2 === 0;
    // Ghost mode stays a fixed cyan regardless of theme — it's the same
    // status color as the "Ghost" legend dot and the power badge. Normal
    // body color follows whichever theme is active.
    drawSnake(ctx, s.snake, ghostFlash ? "#4fd9ff" : getAccentColor(canvas), CELL);
  };

  // Size the canvas every time the game screen (and a fresh <canvas>)
  // mounts — the canvas doesn't exist while on the menu/levels screens.
  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = GRID * CELL;
      canvas.height = GRID * CELL;
      draw(); // avoid a blank flash before the next tick/countdown redraws it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (screen !== "game" || phase !== "playing") return;

    const endGame = (s) => {
      s.over = true;
      draw();
      setPhase("over");
      playGameOver();
      setBestIfHigher(level.id, s.score);
      onGameOver && onGameOver(s.score);
    };

    const tick = () => {
      const s = stateRef.current;
      if (!s) return;
      s.dir = s.pendingDir;
      let head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
      const invincible = s.invincibleTicksLeft > 0;

      const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
      if (hitWall) {
        if (invincible) {
          head = { x: (head.x + GRID) % GRID, y: (head.y + GRID) % GRID }; // ghost-mode tunnel
        } else {
          endGame(s);
          return;
        }
      }

      const hitObstacle = s.obstacles.some((o) => o.x === head.x && o.y === head.y);
      if (hitObstacle && !invincible) {
        endGame(s);
        return;
      }

      // Work out whether this move eats something BEFORE checking
      // self-collision: if it doesn't, the tail cell vacates this same tick,
      // so moving into it is legal. Ghost mode also forgives self-collision.
      const eatsFood = head.x === s.food.x && head.y === s.food.y;
      const eatsSpecial = !!(s.special && head.x === s.special.x && head.y === s.special.y);
      const willGrow = eatsFood || eatsSpecial;
      const bodyToCheck = willGrow ? s.snake : s.snake.slice(0, -1);

      const hitSelf = bodyToCheck.some((seg) => seg.x === head.x && seg.y === head.y);
      if (hitSelf && !invincible) {
        endGame(s);
        return;
      }

      s.snake.unshift(head);

      let grew = false;
      if (eatsFood) {
        s.score += 1;
        s.food = randomEmptyCell(s.snake, s.obstacles, s.special ? [s.special] : []);
        playEat();
        grew = true;
      } else if (eatsSpecial) {
        if (s.special.kind === "bonus") {
          s.score += 5;
          playBonus();
        } else {
          s.invincibleTicksLeft = INVINCIBLE_TICKS;
          playPower();
        }
        s.special = null;
        grew = true;
      }
      if (!grew) s.snake.pop();

      if (s.invincibleTicksLeft > 0) s.invincibleTicksLeft -= 1;
      setInvincibleLeft(Math.ceil((s.invincibleTicksLeft * level.tick) / 1000));

      s.tickCount += 1;
      if (s.special) {
        s.specialTicksLeft -= 1;
        if (s.specialTicksLeft <= 0) s.special = null;
      } else if (s.tickCount % SPECIAL_EVERY_TICKS === 0 && Math.random() < SPECIAL_SPAWN_CHANCE) {
        s.special = {
          ...randomEmptyCell(s.snake, s.obstacles, [s.food]),
          kind: Math.random() < 0.7 ? "bonus" : "power",
        };
        s.specialTicksLeft = SPECIAL_LIFETIME_TICKS;
      }

      setScore(s.score);
      draw();
    };

    const interval = setInterval(tick, level.tick);
    return () => clearInterval(interval);
  }, [screen, phase, soundOn, level, onGameOver]);

  // --- 3-2-1 countdown, shared by Start / Resume / Play Again ------------
  const clearCountdownTimers = () => {
    countdownTimers.current.forEach(clearTimeout);
    countdownTimers.current = [];
  };
  useEffect(() => clearCountdownTimers, []);

  const runCountdownThen = (afterFn) => {
    clearCountdownTimers();
    setPhase("countdown");
    setCountdown(3);
    playClick();
    [2, 1].forEach((n, i) => {
      const t = setTimeout(() => {
        setCountdown(n);
        playClick();
      }, (i + 1) * 700);
      countdownTimers.current.push(t);
    });
    const finalT = setTimeout(() => {
      setCountdown(null);
      afterFn();
    }, 3 * 700);
    countdownTimers.current.push(finalT);
  };

  const beginGame = (initialDirKey, lvl = level) => {
    stateRef.current = freshState(lvl);
    if (initialDirKey) {
      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const dir = map[initialDirKey];
      const s = stateRef.current;
      if (dir) {
        // The fresh snake's body trails to the LEFT of its head, so only
        // accept a starting direction that doesn't run into its own body.
        const nextHead = { x: s.snake[0].x + dir.x, y: s.snake[0].y + dir.y };
        const wouldHitSelf = s.snake.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y);
        if (!wouldHitSelf) {
          s.dir = dir;
          s.pendingDir = dir;
        }
      }
    }
    setScore(0);
    setInvincibleLeft(0);
    draw();
    setScreen("game");
    runCountdownThen(() => {
      setPhase("playing");
      onGameStart && onGameStart();
    });
  };

  const resumeGame = () => runCountdownThen(() => setPhase("playing"));

  const togglePause = () => {
    if (phase === "playing") setPhase("paused");
    else if (phase === "paused") resumeGame();
  };

  const applyDirection = (key) => {
    if (screen === "levels") {
      if (key === "ArrowUp") {
        playClick();
        setLevelIndex((i) => (i - 1 + LEVELS.length) % LEVELS.length);
      } else if (key === "ArrowDown") {
        playClick();
        setLevelIndex((i) => (i + 1) % LEVELS.length);
      }
      return;
    }
    if (screen !== "game") return;
    // Only steer while actually playing — arrows/D-pad never start the game.
    if (phase !== "playing") return;

    const s = stateRef.current;
    const map = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const next = map[key];
    if (!next || !s) return;
    if (next.x === -s.dir.x && next.y === -s.dir.y) return;
    s.pendingDir = next;
  };

  const handleStartPause = () => {
    playClick();
    if (screen !== "game") return;
    if (phase === "playing" || phase === "paused") togglePause();
    else beginGame();
  };

  const handleDpadPress = (key) => {
    playClick();
    applyDirection(key);
  };

  // --- Swipe-to-steer: swipe anywhere on the board instead of tapping
  // the D-pad. Whichever axis moved further decides the direction, and a
  // minimum distance keeps an accidental tap from counting as a swipe.
  const touchStartRef = useRef(null);
  const SWIPE_THRESHOLD = 24; // px

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

    let key;
    if (absDx > absDy) key = dx > 0 ? "ArrowRight" : "ArrowLeft";
    else key = dy > 0 ? "ArrowDown" : "ArrowUp";

    playClick();
    applyDirection(key);
  };

  const enterLevels = () => {
    playClick();
    setScreen("levels");
  };

  const playLevel = (idx) => {
    playClick();
    setLevelIndex(idx);
    beginGame(null, LEVELS[idx]);
  };

  const backToLevels = () => {
    playClick();
    setPhase("ready");
    setScreen("levels");
  };

  useImperativeHandle(ref, () => ({
    startGame: () => {
      if (screen === "menu") return enterLevels();
      if (screen === "levels") return playLevel(levelIndex);
      if (phase === "ready" || phase === "over") beginGame();
    },
    setDirection: (key) => applyDirection(key),
    togglePause: () => togglePause(),
    quit: () => {
      clearCountdownTimers();
      const s = stateRef.current;
      if (s) s.over = true;
      setPhase("over");
      onGameOver && onGameOver(s?.score ?? 0);
    },
  }));

  const overallBest = Math.max(...LEVELS.map((l) => getBest(l.id)));

  return (
    <div
      className="cli-snake-wrap"
      // The terminal window refocuses its hidden text input on any click so
      // typing works from anywhere — but that also means tapping any game
      // button bubbled up and popped the mobile keyboard over the game.
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: screen === "game" ? GRID * CELL : screen === "menu" ? 360 : 300,
        margin: "10px auto",
      }}
    >
      {screen === "menu" && (
        <div className="cli-arcade-device">
          <div className="cli-arcade-header-row">
            <span className="cli-arcade-header-title">SELECT GAME</span>
            <span className="cli-arcade-chip">{GAMES.length} LOADED</span>
          </div>

          <div className="cli-arcade-menu-grid">
            <div className="cli-arcade-game-list">
              {GAMES.map((g) => (
                <div
                  key={g.id}
                  className={`cli-arcade-game-card ${g.available ? "active" : "disabled"}`}
                  onClick={g.available ? enterLevels : undefined}
                >
                  {g.available && <div className="cli-arcade-game-card-bar" />}
                  <div className="cli-arcade-game-card-body">
                    <div className="cli-arcade-game-card-top">
                      <span className="cli-arcade-game-name">{g.name}</span>
                      <span className={`cli-arcade-chip ${g.available ? "active" : ""}`}>
                        {g.available ? "ACTIVE" : "SOON"}
                      </span>
                    </div>
                    <div className="cli-arcade-game-desc">{g.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="cli-arcade-preview-panel">
              <div className="cli-arcade-preview-header">
                <span>ROM: 01</span>
                <span>LIVE</span>
              </div>
              <div className="cli-arcade-preview-screen">
                <AttractPreview />
              </div>
              <div className="cli-arcade-preview-footer">
                <span>SNAKE.BIN</span>
                <span>HI: {overallBest}</span>
              </div>
            </div>
          </div>

          <div className="cli-arcade-controls-row cli-snake-kbd-hint">
            <span><b>↵ Enter</b> Start</span>
            <span><b>Esc</b> Quit</span>
          </div>

          <button type="button" className="cli-arcade-press-start" onClick={enterLevels}>
            <span>PRESS START</span>
            <span className="cli-arcade-enter-badge">▶</span>
          </button>
        </div>
      )}

      {screen === "levels" && (
        <div className="cli-arcade-levels">
          <div className="cli-arcade-aside-title">SELECT LEVEL</div>
          {LEVELS.map((lvl, i) => (
            <div
              key={lvl.id}
              className={`cli-arcade-level-card ${i === levelIndex ? "active" : ""}`}
              onClick={() => playLevel(i)}
            >
              <div className="cli-arcade-level-name">{lvl.name}</div>
              <div className="cli-arcade-level-best">BEST: {String(getBest(lvl.id)).padStart(4, "0")}</div>
            </div>
          ))}
        </div>
      )}

      {screen === "game" && (
        <div>
          <div className="cli-snake-toolbar">
            <button type="button" className="cli-snake-icon-btn" onClick={backToLevels} title="Back to levels">‹</button>
            <span className="cli-snake-score">🍎 {score}</span>
            <span className="cli-snake-best-badge">BEST <b>{getBest(level.id)}</b></span>
            <div className="cli-snake-toolbar-actions">
              {invincibleLeft > 0 && <span className="cli-snake-power-badge">⚡{invincibleLeft}s</span>}
              <button
                type="button"
                className={`cli-snake-icon-btn ${!soundOn ? "is-muted" : ""}`}
                onClick={toggleSound}
                title={soundOn ? "Mute sound" : "Unmute sound"}
              >
                {soundOn ? "🔊" : "🔇"}
              </button>
              <button type="button" className="cli-snake-icon-btn" onClick={handleStartPause}>
                {phase === "playing" ? "⏸" : "▶"}
              </button>
            </div>
          </div>

          <div className="cli-snake-legend">
            <span><i className="dot food" /> +1</span>
            <span><i className="dot bonus" /> +5</span>
            <span><i className="dot power" /> Ghost</span>
          </div>

          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="cli-snake-board"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: GRID * CELL,
              aspectRatio: "1 / 1",
              margin: "0 auto",
              overflow: "hidden",
              // Stops the browser from scrolling/zooming on a swipe here.
              touchAction: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              className="cli-snake-canvas"
              width={GRID * CELL}
              height={GRID * CELL}
              style={{ display: "block", width: "100%", height: "100%" }}
            />

            {phase === "ready" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-modal">
                  <div className="cli-snake-overlay-title">🐍 {level.name}</div>
                  <div className="cli-snake-overlay-text cli-snake-kbd-hint" style={{ whiteSpace: "pre-line", lineHeight: "1.5", margin: "8px 0" }}>
                    {"Press Space / Enter / Arrows to Start\nP to pause · Esc to quit"}
                  </div>
                  <button type="button" className="cli-snake-btn" onClick={() => { playClick(); beginGame(); }}>
                    Start
                  </button>
                </div>
              </div>
            )}

            {phase === "countdown" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-countdown">{countdown}</div>
              </div>
            )}

            {phase === "paused" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-modal">
                  <div className="cli-snake-overlay-title">PAUSED</div>
                  <button type="button" className="cli-snake-btn" onClick={() => { playClick(); resumeGame(); }}>
                    Resume
                  </button>
                </div>
              </div>
            )}

            {phase === "over" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-modal">
                  <div className="cli-snake-overlay-title">GAME OVER</div>
                  <div className="cli-snake-overlay-text" style={{ whiteSpace: "pre-line", lineHeight: "1.6", margin: "10px 0" }}>
                    {level.name}
                    {"\n"}Score: {score} · Best: <span className="cli-snake-best-inline">{getBest(level.id)}</span>
                    <span className="cli-snake-kbd-hint">{"\n(Press R, Enter, or Space to restart)"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="cli-snake-btn" onClick={() => { playClick(); beginGame(); }}>
                      Play Again
                    </button>
                    <button type="button" className="cli-snake-btn cli-snake-btn-secondary" onClick={backToLevels}>
                      Levels
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile-only retro D-pad — hidden on desktop via CSS media query,
              since desktop already has physical arrow keys. */}
          <div className="cli-snake-mobile-controls">
            <div className="cli-snake-dpad">
              <button type="button" className="cli-snake-dpad-btn up" onClick={() => handleDpadPress("ArrowUp")} aria-label="Up">▲</button>
              <button type="button" className="cli-snake-dpad-btn left" onClick={() => handleDpadPress("ArrowLeft")} aria-label="Left">◀</button>
              <div className="cli-snake-dpad-center"><span className="dot" /></div>
              <button type="button" className="cli-snake-dpad-btn right" onClick={() => handleDpadPress("ArrowRight")} aria-label="Right">▶</button>
              <button type="button" className="cli-snake-dpad-btn down" onClick={() => handleDpadPress("ArrowDown")} aria-label="Down">▼</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});


// ---------------------------------------------------------------------------
// Main Terminal Component
// ---------------------------------------------------------------------------

const QUIZ_QUESTIONS = [
  {
    q: "Which hook lets you run side effects in React?",
    options: ["useState", "useEffect", "useMemo", "useContext"],
    a: "useeffect",
  },
  {
    q: "What does CSS stand for?",
    options: ["Cascading Style Sheets", "Computer Style Syntax", "Creative Style System"],
    a: "cascading style sheets",
  },
  {
    q: "What HTTP method is idempotent and used to fetch data?",
    options: ["POST", "GET", "PUT", "DELETE"],
    a: "get",
  },
  {
    q: "What does 'npm' stand for?",
    options: ["Node Package Manager", "New Program Module", "Node Process Master"],
    a: "node package manager",
  },
];

const Cli = ({ windowName, setWindowsState, zIndex, bringToFront }) => {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyPointer, setHistoryPointer] = useState(null);
  const [theme, setTheme] = useState("default");
  const [quiz, setQuiz] = useState(null);
  const [gameActive, setGameActive] = useState(null);

  const inputRef = useRef(null);
  const bodyRef = useRef(null);
  const snakeRef = useRef(null);
  const idRef = useRef(0);

  const quizRef = useRef(quiz);
  const cmdHistoryRef = useRef(cmdHistory);

  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);

  useEffect(() => {
    cmdHistoryRef.current = cmdHistory;
  }, [cmdHistory]);

  const nextId = () => (idRef.current += 1);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
  }, []);

  const pushLine = useCallback(
    (kind, content) => {
      setLines((prev) => [...prev, { id: nextId(), kind, content }]);
      scrollToBottom();
    },
    [scrollToBottom]
  );

  const commands = {
    about: {
      description: "Learn about me",
      fn: () => "I am a full-stack web developer passionate about React and Node.js.",
    },
    skills: {
      description: "View my technical skills",
      fn: () => "Frontend: React, Vanilla JS, HTML/CSS\nBackend: Node.js, Express, Python",
    },
    projects: {
      description: "Check out my work",
      fn: () => "1. Portfolio Website\n2. AICareerCoach\ntip: try 'open github'",
    },
    github: {
      description: "Open GitHub profile",
      fn: () => {
        window.open("https://github.com/mr-jignesh-dev", "_blank");
        return "Opening GitHub...";
      },
    },
    snake: {
      description: "Play Snake game",
      fn: (args, ctx) => ctx.startSnake(),
    },
    quiz: {
      description: "Play trivia quiz",
      fn: (args, ctx) => ctx.startQuiz(),
    },
    history: {
      description: "Show command history",
      fn: (args, ctx) => ctx.showHistory(),
    },
    shortcuts: {
      description: "Show keyboard shortcuts",
      fn: (args, ctx) => ctx.showShortcuts(),
    },
    clear: { description: "Clear terminal", fn: (args, ctx) => ctx.clearLines() },
    cls: { description: "Clear terminal", fn: (args, ctx) => ctx.clearLines() },
    help: { description: "List commands", fn: (args, ctx) => ctx.showHelp() },
  };

  const runCommand = useCallback(
    (raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      pushLine("input", trimmed);

      setCmdHistory((h) => [...h, trimmed]);
      setHistoryPointer(null);

      const [cmd, ...args] = trimmed.split(/\s+/);
      const commandKey = cmd.toLowerCase();

      if (commands[commandKey]) {
        if (quizRef.current) {
          pushLine("output", "Quiz exited.");
          setQuiz(null);
        }
        const result = commands[commandKey].fn(args, ctx);
        if (typeof result === "string") pushLine("output", result);
        return;
      }

      const activeQuiz = quizRef.current;
      if (activeQuiz) {
        if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
          pushLine("output", "Quiz cancelled.");
          setQuiz(null);
          return;
        }

        const currentQ = QUIZ_QUESTIONS[activeQuiz.index];
        const normalizedInput = trimmed.toLowerCase();

        let isCorrect = normalizedInput === currentQ.a;
        if (!isCorrect && currentQ.options) {
          const selectedOptionIndex = parseInt(trimmed, 10) - 1;
          if (
            !isNaN(selectedOptionIndex) &&
            currentQ.options[selectedOptionIndex] &&
            currentQ.options[selectedOptionIndex].toLowerCase() === currentQ.a
          ) {
            isCorrect = true;
          }
        }

        const nextIndex = activeQuiz.index + 1;
        const newScore = activeQuiz.score + (isCorrect ? 1 : 0);

        if (nextIndex >= QUIZ_QUESTIONS.length) {
          pushLine(
            "output",
            `${isCorrect ? "✅ Correct!" : `❌ Incorrect (Answer: ${currentQ.a})`}\n\n🏆 Quiz Complete! Final Score: ${newScore}/${QUIZ_QUESTIONS.length}`
          );
          setQuiz(null);
        } else {
          const nextQ = QUIZ_QUESTIONS[nextIndex];
          const optionsText = nextQ.options
            ? "\n" + nextQ.options.map((opt, i) => `  ${i + 1}. ${opt}`).join("\n")
            : "";

          pushLine(
            "output",
            `${isCorrect ? "✅ Correct!" : `❌ Incorrect (Answer: ${currentQ.a})`}\n\nQ${nextIndex + 1}: ${nextQ.q}${optionsText}`
          );
          setQuiz({ index: nextIndex, score: newScore });
        }
        return;
      }

      pushLine("output", `command not found: ${cmd} (type 'help' for a list)`);
    },
    [pushLine]
  );

  const ctx = {
    setTheme,
    clearLines: () => {
      setLines([]);
      return null;
    },
    openWindow: (name) => setWindowsState && setWindowsState((s) => ({ ...s, [name]: true })),
    startSnake: () => {
      setGameActive("snake");
      pushLine("snake", null);
      // On mobile, the input that was just focused to type "snake" is
      // still holding the on-screen keyboard open over the game.
      inputRef.current?.blur();
      return null;
    },
    startQuiz: () => {
      setQuiz({ index: 0, score: 0 });
      const firstQ = QUIZ_QUESTIONS[0];
      const optionsText = firstQ.options
        ? "\n" + firstQ.options.map((opt, i) => `  ${i + 1}. ${opt}`).join("\n")
        : "";

      pushLine(
        "jsx",
        <pre className="cli-out">
          <RiGamepadLine style={{ verticalAlign: "middle", marginRight: "6px" }} />
          Dev Trivia Started! Type option number or full answer (type 'exit' to quit).
          {"\n\n"}
          Q1: {firstQ.q}
          {optionsText}
        </pre>
      );

      return null;
    },
    showHistory: () => {
      const historyList = cmdHistoryRef.current;
      if (historyList.length === 0) return "No commands run yet.";
      pushLine(
        "jsx",
        <CommandChips
          items={historyList.map((c, i) => ({ label: `${i + 1}  ${c}`, run: c }))}
          onRun={runCommand}
        />
      );
      return null;
    },
    showShortcuts: () => {
      pushLine(
        "jsx",
        <div style={{ margin: "4px 0" }}>
          <div className="cli-out" style={{ fontWeight: "bold", marginBottom: "6px" }}>
            <RiKeyboardFill style={{ verticalAlign: "middle", marginRight: "6px" }} /> Keyboard Shortcuts:
          </div>
          <div className="cli-out" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9em", opacity: 0.9 }}>
            <div><kbd>Tab</kbd> — Auto-complete command name</div>
            <div><kbd>{modKey} + C</kbd> — Cancel current input line or interrupt active quiz/game</div>
            <div><kbd>{modKey} + K</kbd> or <kbd>Ctrl + L</kbd> — Clear terminal screen</div>
            <div><kbd>↑</kbd> / <kbd>↓</kbd> — Navigate previous command history</div>
          </div>
        </div>
      );
      return null;
    },
    showHelp: () => {
      pushLine(
        "jsx",
        <div style={{ margin: "6px 0" }}>
          <div className="cli-out" style={{ fontWeight: "bold", marginBottom: "6px" }}>
            Available Commands:
          </div>
          <CommandChips
            items={Object.keys(commands).map((c) => ({ label: c, run: c }))}
            onRun={runCommand}
          />
        </div>
      );
      return null;
    },
  };

  const handleSnakeGameOver = useCallback(() => {
    setGameActive("snake");
  }, []);

  const handleSnakeGameStart = useCallback(() => {
    setGameActive("snake");
  }, []);

  const handleKeyDown = (e) => {
    // All snake-game keys are handled by a dedicated global listener
    // (see the effect below) that works regardless of whether this input
    // has focus. Nothing to do here while the game owns input.
    if (gameActive === "snake") return;

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;

    if (isCmdOrCtrl && e.key.toLowerCase() === "c") {
      if (window.getSelection()?.toString().length > 0) return;

      e.preventDefault();
      if (quiz) {
        pushLine("input", input + "^C");
        pushLine("output", "Quiz cancelled.");
        setQuiz(null);
        setInput("");
      } else {
        pushLine("input", input + "^C");
        setInput("");
      }
      return;
    }

    if ((e.ctrlKey && e.key.toLowerCase() === "l") || (isCmdOrCtrl && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      setLines([]);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (!input.trim() || quiz) return;

      const availableCmds = Object.keys(commands);
      const matches = availableCmds.filter((c) => c.startsWith(input.toLowerCase()));

      if (matches.length === 1) {
        setInput(matches[0]);
      } else if (matches.length > 1) {
        pushLine("input", input);
        pushLine("output", matches.join("   "));
      }
      return;
    }

    if (e.key === "Enter") {
      const val = input;
      setInput("");
      runCommand(val);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const historyList = cmdHistoryRef.current;
      if (historyList.length === 0) return;
      const nextPointer =
        historyPointer === null
          ? historyList.length - 1
          : Math.max(0, historyPointer - 1);
      setHistoryPointer(nextPointer);
      setInput(historyList[nextPointer]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const historyList = cmdHistoryRef.current;
      if (historyPointer === null) return;
      const nextPointer = historyPointer + 1;
      if (nextPointer >= historyList.length) {
        setHistoryPointer(null);
        setInput("");
      } else {
        setHistoryPointer(nextPointer);
        setInput(historyList[nextPointer]);
      }
      return;
    }
  };

  // Owns ALL snake-game keyboard controls, independent of focus. Any button
  // click blurs the hidden terminal input, and the effect below intentionally
  // does NOT refocus it during gameplay (that keeps the mobile keyboard from
  // popping over the game), so this listens on window directly instead.
  useEffect(() => {
    if (gameActive !== "snake") return;

    const handleSnakeKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        snakeRef.current?.quit();
        setGameActive(null);
        return;
      }
      if (e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "r") {
        e.preventDefault();
        snakeRef.current?.startGame();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        snakeRef.current?.setDirection(e.key);
        return;
      }
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        snakeRef.current?.togglePause();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        snakeRef.current?.quit();
        setGameActive(null);
      }
    };

    window.addEventListener("keydown", handleSnakeKeyDown);
    return () => window.removeEventListener("keydown", handleSnakeKeyDown);
  }, [gameActive]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey) return;
      if (gameActive === "snake") return;

      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [gameActive]);

  return (
    <MacWindow
      windowName={windowName}
      setWindowsState={setWindowsState}
      zIndex={zIndex}
      bringToFront={bringToFront}
    >
      <div
        className={`cli-window theme-${theme}`}
        onClick={() => {
          if (window.getSelection()?.toString().length === 0) {
            inputRef.current?.focus();
          }
        }}
      >
        <div className="cli-body" ref={bodyRef}>
          <div className="cli-out" style={{ marginBottom: 12 }}>
            Welcome! Type{" "}
            <span
              className="cli-inline-cmd"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                runCommand("help");
              }}
            >
              help
            </span>
            ,{" "}
            <span
              className="cli-inline-cmd"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                runCommand("quiz");
              }}
            >
              quiz
            </span>
            , or{" "}
            <span
              className="cli-inline-cmd"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                runCommand("snake");
              }}
            >
              snake
            </span>
            .
          </div>

          {lines.map((line) => {
            if (line.kind === "input") {
              return (
                <div key={line.id} className="cli-line-input">
                  <span className="cli-prompt">
                    {quiz && gameActive !== "snake" ? "quiz(answer):~$" : "jigneshmakwana:~$"}
                  </span>{" "}
                  {line.content}
                </div>
              );
            }
            if (line.kind === "jsx") {
              return <div key={line.id}>{line.content}</div>;
            }
            if (line.kind === "snake") {
              return (
                <SnakeArcade
                  key={line.id}
                  ref={snakeRef}
                  onGameOver={handleSnakeGameOver}
                  onGameStart={handleSnakeGameStart}
                />
              );
            }
            return <TypedText key={line.id} text={line.content} onUpdate={scrollToBottom} />;
          })}

          <div className="cli-line-input cli-active-row">
            <span className="cli-prompt">
              {quiz && gameActive !== "snake" ? "quiz(answer):~$" : "jigneshmakwana:~$"}
            </span>
            <input
              ref={inputRef}
              className="cli-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    </MacWindow>
  );
};

export default Cli;