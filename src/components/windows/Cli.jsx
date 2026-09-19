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
const CELL = 20; // was 15 — bigger play area, per feedback

// Short, disconnected wall segments — used instead of full-width lines
// with a single shared gap. A "wall of length N starting at x0" with a
// single gap column is easy to accidentally cancel out where it crosses
// a perpendicular wall (that's exactly what made the old MAZE RUN
// unsolvable: the vertical wall's block sat right on top of both
// horizontal walls' only opening). Segments avoid that class of bug
// entirely, since there's no shared "gap coordinate" to misalign.
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

/** Decorative attract-mode loop for the game-select preview screen — a
 *  self-playing, non-interactive snake wandering the mini screen. */
const AttractPreview = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const size = 8;
    canvas.width = 96;
    canvas.height = 96;
    const cols = Math.floor(canvas.width / size);
    const rows = Math.floor(canvas.height / size);
    let path = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }];
    let dir = { x: 1, y: 0 };
    let raf;
    let last = 0;

    const step = (ts) => {
      if (ts - last > 180) {
        last = ts;
        if (Math.random() < 0.12) {
          dir = Math.random() < 0.5 ? { x: dir.y, y: dir.x } : { x: -dir.y, y: -dir.x };
        }
        let next = { x: path[0].x + dir.x, y: path[0].y + dir.y };
        if (next.x < 0 || next.x >= cols) { dir = { x: -dir.x, y: dir.y }; next = { x: path[0].x + dir.x, y: path[0].y }; }
        if (next.y < 0 || next.y >= rows) { dir = { x: dir.x, y: -dir.y }; next = { x: path[0].x, y: path[0].y + dir.y }; }
        path = [next, ...path].slice(0, 8);

        ctx.fillStyle = "#0a0d12";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        path.forEach((seg, i) => {
          ctx.fillStyle = i === 0 ? "#4dff88" : "#2fae63";
          ctx.fillRect(seg.x * size, seg.y * size, size - 1, size - 1);
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
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

    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(s.food.x * CELL, s.food.y * CELL, CELL - 1, CELL - 1);

    if (s.special) {
      const blinking = s.specialTicksLeft < 10 && s.specialTicksLeft % 4 < 2;
      if (!blinking) {
        ctx.fillStyle = s.special.kind === "bonus" ? "#ffd23f" : "#4fd9ff";
        ctx.fillRect(s.special.x * CELL, s.special.y * CELL, CELL - 1, CELL - 1);
      }
    }

    const invincible = s.invincibleTicksLeft > 0;
    s.snake.forEach((seg, i) => {
      const ghostFlash = invincible && s.tickCount % 2 === 0;
      ctx.fillStyle = ghostFlash ? (i === 0 ? "#4fd9ff" : "#2b9fc7") : i === 0 ? "#4dff88" : "#2fae63";
      ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL - 1, CELL - 1);
    });
  };

  // BUG FIX: this used to run once with an empty dependency array, which
  // fired while the arcade was still on the "menu" screen — before the
  // <canvas> even existed (canvasRef.current was null). That left the
  // canvas at the browser's default 300x150 buffer forever, so anything
  // drawn below roughly grid row 10 (food included) was silently clipped
  // outside the actual buffer. Keying this on `screen` re-runs it every
  // time the game screen (and a fresh <canvas> element) mounts.
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

      // Figure out whether this move eats something BEFORE checking
      // self-collision. If it doesn't, the tail cell vacates this same
      // tick — moving into it is the normal "chase your own tail" case,
      // not a collision (this was the original off-by-one bug).
      // Separately: ghost mode (the cyan pickup) now also forgives
      // self-collision, not just walls/obstacles — "ghost" reads as
      // full invincibility to a player, and a genuine self-hit still
      // ending the run while the badge says you're invincible felt
      // like the power-up was broken rather than intentional.
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
        // The fresh snake's body trails to the LEFT of its head, so
        // restarting with ArrowLeft would move the head straight into
        // its own second segment on the very first tick — instant
        // self-collision, which looked like "pressing arrow doesn't
        // restart it" when really it restarted and died in the same
        // frame. Only accept the pressed direction if it's actually safe.
        const nextHead = { x: s.snake[0].x + dir.x, y: s.snake[0].y + dir.y };
        const wouldHitSelf = s.snake.some((seg) => seg.x === nextHead.x && seg.y === nextHead.y);
        if (!wouldHitSelf) {
          s.dir = dir;
          s.pendingDir = dir;
        }
        // else: keep the safe default rightward direction from freshState()
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
    // Only steer while actually playing — arrows/D-pad no longer
    // double as a "start" trigger. Starting is R / Space / Enter, or
    // the Start / Resume / Play Again buttons, and nothing else.
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
  // the D-pad. Compares the touch's start/end position; whichever axis
  // moved further decides the direction, and a minimum distance keeps
  // an accidental tap (to dismiss an overlay, say) from registering as
  // a swipe in some random direction.
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
    if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return; // too small — treat as a tap, not a swipe

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

  return (
    <div
      className="cli-snake-wrap"
      // The terminal window refocuses its hidden text input on any
      // click so typing works from anywhere — but that also means
      // tapping the D-pad or any game button was bubbling up and
      // refocusing it, popping the mobile keyboard right over the
      // game. Stopping propagation here keeps every button's own
      // onClick working while never triggering that refocus.
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: screen === "game" ? GRID * CELL : 300,
        height: screen === "game" ? "100%" : "auto",
        margin: screen === "game" ? "0 auto" : "10px 0",
      }}
    >
      {screen === "menu" && (
        <div className="cli-arcade-device">
          <div className="cli-arcade-screen">
            <div className="cli-arcade-screen-games">
              <div className="cli-arcade-aside-title">SELECT GAME</div>
              <div className="cli-arcade-menu-item active" onClick={enterLevels}>▶ SNAKE</div>
              <div className="cli-arcade-menu-item disabled">TETRIS · SOON</div>
              <div className="cli-arcade-menu-item disabled">PONG · SOON</div>
            </div>
            <div className="cli-arcade-screen-preview">
              <AttractPreview />
            </div>
          </div>
          <div className="cli-arcade-device-buttons">
            <button type="button" className="cli-snake-btn cli-arcade-start-btn" onClick={enterLevels}>
              PRESS START
            </button>
          </div>
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
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="cli-snake-toolbar">
            <button type="button" className="cli-snake-icon-btn" onClick={backToLevels} title="Back to levels">‹</button>
            <span className="cli-snake-score">SCORE: {String(score).padStart(4, "0")}</span>
            <div className="cli-snake-toolbar-actions">
              {invincibleLeft > 0 && <span className="cli-snake-power-badge">⚡{invincibleLeft}s</span>}
              <button
                type="button"
                className="cli-snake-icon-btn"
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
            style={{
              position: "relative",
              // The ONE flexible element: takes whatever height remains
              // after the toolbar/legend/D-pad claim their natural size
              // (flex-basis 0 + grow 1), then aspect-ratio derives a
              // matching width from that — capped by max-width so it
              // never overflows horizontally either. This replaces
              // guessing at a vh-based cap: it fits by construction,
              // on any window size, because the browser does the math.
              flex: "1 1 0",
              minHeight: 0,
              width: "100%",
              maxWidth: "100%",
              aspectRatio: "1 / 1",
              margin: "0 auto",
              border: "1px solid #334155",
              borderRadius: "6px",
              overflow: "hidden",
              // Stops the browser from trying to scroll/zoom the page
              // on a swipe here, so the whole gesture is read as steering.
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
                <div className="cli-snake-overlay-title">🐍 {level.name}</div>
                <div className="cli-snake-overlay-text cli-snake-kbd-hint" style={{ whiteSpace: "pre-line", lineHeight: "1.5", margin: "8px 0" }}>
                  {"Press Space / Enter / Arrows to Start\nP to pause · Esc to quit"}
                </div>
                <button type="button" className="cli-snake-btn" onClick={() => { playClick(); beginGame(); }}>
                  Start
                </button>
              </div>
            )}

            {phase === "countdown" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-countdown">{countdown}</div>
              </div>
            )}

            {phase === "paused" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-overlay-title">PAUSED</div>
                <button type="button" className="cli-snake-btn" onClick={() => { playClick(); resumeGame(); }}>
                  Resume
                </button>
              </div>
            )}

            {phase === "over" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-overlay-title">GAME OVER</div>
                <div className="cli-snake-overlay-text" style={{ whiteSpace: "pre-line", lineHeight: "1.6", margin: "10px 0" }}>
                  {`${level.name}\nScore: ${score}  ·  Best: ${getBest(level.id)}`}
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
            )}
          </div>

          {/* Mobile-only retro D-pad — hidden on desktop via CSS media query,
              since desktop already has physical arrow keys. */}
          <div className="cli-snake-mobile-controls">
            <div className="cli-snake-dpad">
              <button type="button" className="cli-snake-dpad-btn up" onClick={() => handleDpadPress("ArrowUp")} aria-label="Up">▲</button>
              <button type="button" className="cli-snake-dpad-btn left" onClick={() => handleDpadPress("ArrowLeft")} aria-label="Left">◀</button>
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
      // still holding the on-screen keyboard open, which covers the
      // game. Drop focus immediately so it dismisses.
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
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;

    if (isCmdOrCtrl && e.key.toLowerCase() === "c") {
      if (window.getSelection()?.toString().length > 0) return;

      e.preventDefault();
      if (gameActive === "snake") {
        snakeRef.current?.quit();
        setGameActive(null);
      } else if (quiz) {
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

    if (gameActive === "snake") {
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
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
      }
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