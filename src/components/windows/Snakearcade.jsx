import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { getAccentColor } from "./Themeutils.js";
import {
  GRID,
  CELL,
  MOBILE_CELL,
  MOBILE_QUERY,
  MOBILE_MAX_ROWS,
  MOBILE_RESERVED_HEIGHT,
  LEVELS,
  GAMES,
  getBest,
  setBestIfHigher,
  INVINCIBLE_TICKS,
  SPECIAL_EVERY_TICKS,
  SPECIAL_LIFETIME_TICKS,
  SPECIAL_SPAWN_CHANCE,
} from "./Snakeconstants.js";
import { drawApple, drawPickup, drawSnake } from "./Snakedraw.js";
import AttractPreview from "./Attractpreview.jsx";

// ---------------------------------------------------------------------------
// Snake Arcade — retro cabinet flow: select game -> select level -> play.
// Levels add obstacles and increase speed; two special pickups spawn during
// play (gold = +5 bonus points, cyan = temporary "ghost mode" through walls
// and obstacles). Best score per level is kept in localStorage.
// ---------------------------------------------------------------------------

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

  // On phones the board is drawn at a larger cell size. The canvas's
  // internal resolution changes with it, so the snake stays crisp instead
  // of being CSS-stretched.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const cell = isMobile ? MOBILE_CELL : CELL;
  // draw() runs from long-lived interval closures, so it reads the cell
  // size through a ref instead of capturing a stale value.
  const cellRef = useRef(cell);
  cellRef.current = cell;

  // The board is as wide as the screen allows, so on a portrait phone the
  // only way to get a bigger play area is to make it TALLER. Rows are
  // chosen once per run from the space actually left on screen (never
  // mid-run, which would invalidate the snake's position), and capped so
  // the whole board always stays visible — touch scrolling is disabled on
  // it, so a board taller than the screen would hide part of the game.
  const [rows, setRows] = useState(GRID);
  const pickRows = () => {
    if (typeof window === "undefined" || !window.matchMedia(MOBILE_QUERY).matches) return GRID;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const boardPx = Math.min(GRID * MOBILE_CELL, vw - 60);
    const cellPx = boardPx / GRID;
    const fit = Math.floor((vh - MOBILE_RESERVED_HEIGHT) / cellPx);
    return Math.max(GRID, Math.min(MOBILE_MAX_ROWS, fit));
  };

  // ---------------------------------------------------------------------
  // Synthesized sound effects — no audio files to host or load.
  // ---------------------------------------------------------------------
  // Read through a ref so sounds scheduled from long-lived timers/intervals
  // (the countdown, the game loop) still respect a mute toggled mid-game.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  // One oscillator note. `at` delays it (seconds) so several notes can be
  // scheduled together as a little jingle; `to` makes it glide from freq
  // to that pitch.
  const tone = ({ freq, to, at = 0, dur = 0.08, type = "square", vol = 0.09 }) => {
    if (!soundOnRef.current) return;
    try {
      const ctx = getAudioCtx();
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* Web Audio unavailable — game still works without sound */
    }
  };

  // Every action gets its own sound so you can tell them apart by ear.
  // Steering (swipes / arrow keys) is deliberately silent.
  const sfx = {
    // menus
    nav: () => tone({ freq: 700, dur: 0.03, type: "triangle", vol: 0.06 }),
    confirm: () => {
      tone({ freq: 523, dur: 0.07 });
      tone({ freq: 784, at: 0.07, dur: 0.09 });
    },
    levelPick: () => {
      tone({ freq: 392, dur: 0.06, type: "triangle" });
      tone({ freq: 523, at: 0.06, dur: 0.06, type: "triangle" });
      tone({ freq: 659, at: 0.12, dur: 0.1, type: "triangle" });
    },
    back: () => {
      tone({ freq: 523, dur: 0.06, type: "triangle" });
      tone({ freq: 330, at: 0.06, dur: 0.09, type: "triangle" });
    },
    // run flow
    start: () => tone({ freq: 300, to: 900, dur: 0.16 }),
    tick: () => tone({ freq: 480, dur: 0.08, type: "triangle" }),
    go: () => {
      tone({ freq: 880, dur: 0.07 });
      tone({ freq: 1175, at: 0.07, dur: 0.14 });
    },
    pause: () => {
      tone({ freq: 660, dur: 0.07 });
      tone({ freq: 440, at: 0.07, dur: 0.12 });
    },
    resume: () => {
      tone({ freq: 440, dur: 0.07 });
      tone({ freq: 660, at: 0.07, dur: 0.12 });
    },
    // pickups
    eat: () => tone({ freq: 420, to: 840, dur: 0.08, type: "triangle", vol: 0.12 }), // red apple: soft blip
    bonus: () => {
      // yellow +5: bright two-note coin
      tone({ freq: 988, dur: 0.08, vol: 0.1 });
      tone({ freq: 1319, at: 0.08, dur: 0.22, vol: 0.1 });
    },
    power: () => {
      // ghost: long rising whoosh, then a shimmer
      tone({ freq: 200, to: 1200, dur: 0.4, type: "sine", vol: 0.12 });
      tone({ freq: 1568, at: 0.4, dur: 0.08, type: "sine", vol: 0.08 });
      tone({ freq: 2093, at: 0.48, dur: 0.12, type: "sine", vol: 0.08 });
    },
    gameOver: () => tone({ freq: 420, to: 110, dur: 0.35, type: "sawtooth" }),
  };

  // Low "shaking" rumble, for devices that can't vibrate: a deep sawtooth
  // run through a lowpass, with an LFO opening and closing the volume ~24x
  // a second — that tremolo is what makes it feel like a shake, not a hum.
  const rumble = () => {
    if (!soundOnRef.current) return;
    try {
      const ctx = getAudioCtx();
      const t0 = ctx.currentTime;
      const dur = 0.55;

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(95, t0);
      osc.frequency.linearRampToValueAtTime(55, t0 + dur);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 420;

      const shake = ctx.createGain();
      shake.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 24;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.5;
      lfo.connect(lfoDepth);
      lfoDepth.connect(shake.gain);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.3, t0 + 0.04);
      env.gain.linearRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(lowpass);
      lowpass.connect(shake);
      shake.connect(env);
      env.connect(ctx.destination);

      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + dur + 0.02);
      lfo.stop(t0 + dur + 0.02);
    } catch {
      /* Web Audio unavailable */
    }
  };

  // On death: phones vibrate; everything else gets the rumble. A touch
  // screen is detected by its pointer, not by navigator.vibrate existing —
  // desktop Chrome has that function too, but it does nothing there. iPhones
  // have no vibrate API at all, so they fall through to the rumble as well.
  // The sound toggle silences both, so one button means "quiet".
  const deathFeedback = () => {
    if (!soundOnRef.current) return;
    const touchPrimary = window.matchMedia("(pointer: coarse)").matches;
    if (touchPrimary && typeof navigator.vibrate === "function") {
      navigator.vibrate([150, 70, 150, 70, 250]);
    } else {
      rumble();
    }
  };

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
  const randomEmptyCell = (snake, obstacles, exclude = [], rowCount = GRID) => {
    let pos;
    let guard = 0;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * rowCount) };
      guard += 1;
    } while (
      guard < 200 &&
      (snake.some((s) => s.x === pos.x && s.y === pos.y) ||
        obstacles.some((o) => o.x === pos.x && o.y === pos.y) ||
        exclude.some((e) => e.x === pos.x && e.y === pos.y))
    );
    return pos;
  };

  const freshState = (lvl, rowCount = GRID) => {
    // Level layouts are authored for an 18x18 board. On a taller board,
    // shift them down so they stay centred instead of hugging the top.
    const yOff = Math.floor((rowCount - GRID) / 2);
    const midY = 9 + yOff;
    const snake = [{ x: 8, y: midY }, { x: 7, y: midY }, { x: 6, y: midY }];
    const obstacles = lvl.obstacles.map((o) => ({ x: o.x, y: o.y + yOff }));
    return {
      snake,
      rows: rowCount,
      dir: { x: 1, y: 0 },
      // Turns waiting for the next game step. A queue (not one slot) so
      // two quick swipes inside a single step both register.
      dirQueue: [],
      obstacles,
      food: randomEmptyCell(snake, obstacles, [], rowCount),
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
    const c = cellRef.current;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!s) return;

    ctx.fillStyle = "#3b4457";
    s.obstacles.forEach((o) => ctx.fillRect(o.x * c, o.y * c, c - 1, c - 1));

    drawApple(ctx, s.food.x, s.food.y, c);

    if (s.special) {
      const blinking = s.specialTicksLeft < 10 && s.specialTicksLeft % 4 < 2;
      if (!blinking) {
        drawPickup(ctx, s.special.x, s.special.y, c, s.special.kind === "bonus" ? "#ffd23f" : "#4fd9ff");
      }
    }

    const invincible = s.invincibleTicksLeft > 0;
    const ghostFlash = invincible && s.tickCount % 2 === 0;
    // Ghost mode stays a fixed cyan regardless of theme — it's the same
    // status color as the "Ghost" legend dot and the power badge. Normal
    // body color follows whichever theme is active.
    drawSnake(ctx, s.snake, ghostFlash ? "#4fd9ff" : getAccentColor(canvas), c);
  };

  // Size the canvas every time the game screen (and a fresh <canvas>)
  // mounts, or the cell size / row count changes — the canvas doesn't
  // exist while on the menu/levels screens.
  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = GRID * cell;
      canvas.height = rows * cell;
      draw(); // avoid a blank flash before the next tick/countdown redraws it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, cell, rows]);

  useEffect(() => {
    if (screen !== "game" || phase !== "playing") return;

    const endGame = (s) => {
      s.over = true;
      draw();
      setPhase("over");
      sfx.gameOver();
      deathFeedback();
      setBestIfHigher(level.id, s.score);
      onGameOver && onGameOver(s.score);
    };

    const tick = () => {
      const s = stateRef.current;
      if (!s) return;
      // Take the next waiting turn, if any (see dirQueue above).
      if (s.dirQueue.length) s.dir = s.dirQueue.shift();
      let head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
      const invincible = s.invincibleTicksLeft > 0;

      const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= s.rows;
      if (hitWall) {
        if (invincible) {
          head = { x: (head.x + GRID) % GRID, y: (head.y + s.rows) % s.rows }; // ghost-mode tunnel
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
        s.food = randomEmptyCell(s.snake, s.obstacles, s.special ? [s.special] : [], s.rows);
        sfx.eat();
        grew = true;
      } else if (eatsSpecial) {
        if (s.special.kind === "bonus") {
          s.score += 5;
          sfx.bonus();
        } else {
          s.invincibleTicksLeft = INVINCIBLE_TICKS;
          sfx.power();
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
          ...randomEmptyCell(s.snake, s.obstacles, [s.food], s.rows),
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

  // The first beat plays whatever sound belongs to the action that started
  // the countdown (start vs resume), then tick, tick, and a "go" as play
  // begins — so Start, Play Again and Resume each sound different.
  const runCountdownThen = (afterFn, openingSound) => {
    clearCountdownTimers();
    setPhase("countdown");
    setCountdown(3);
    if (openingSound) openingSound();
    [2, 1].forEach((n, i) => {
      const t = setTimeout(() => {
        setCountdown(n);
        sfx.tick();
      }, (i + 1) * 700);
      countdownTimers.current.push(t);
    });
    const finalT = setTimeout(() => {
      setCountdown(null);
      sfx.go();
      afterFn();
    }, 3 * 700);
    countdownTimers.current.push(finalT);
  };

  const beginGame = (initialDirKey, lvl = level) => {
    const r = pickRows();
    setRows(r);
    stateRef.current = freshState(lvl, r);
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
    }, sfx.start);
  };

  const resumeGame = () => runCountdownThen(() => setPhase("playing"), sfx.resume);

  const togglePause = () => {
    if (phase === "playing") {
      setPhase("paused");
      sfx.pause();
    } else if (phase === "paused") resumeGame();
  };

  // Returns true only when a turn was actually queued, so callers (the
  // swipe handler) can skip feedback for ignored input.
  const applyDirection = (key) => {
    if (screen === "levels") {
      if (key === "ArrowUp") {
        sfx.nav();
        setLevelIndex((i) => (i - 1 + LEVELS.length) % LEVELS.length);
      } else if (key === "ArrowDown") {
        sfx.nav();
        setLevelIndex((i) => (i + 1) % LEVELS.length);
      }
      return false;
    }
    if (screen !== "game") return false;
    // Only steer while actually playing — arrows/swipes never start the game.
    if (phase !== "playing") return false;

    const s = stateRef.current;
    const map = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const next = map[key];
    if (!next || !s) return false;
    // Judge the new turn against the LAST turn already waiting, not the
    // current heading, so queued turns chain correctly (e.g. up, then left).
    const last = s.dirQueue.length ? s.dirQueue[s.dirQueue.length - 1] : s.dir;
    if (next.x === last.x && next.y === last.y) return false; // already going that way
    if (next.x === -last.x && next.y === -last.y) return false; // can't reverse
    if (s.dirQueue.length >= 3) return false;
    s.dirQueue.push(next);
    return true;
  };

  const handleStartPause = () => {
    if (screen !== "game") return;
    if (phase === "playing" || phase === "paused") togglePause();
    else beginGame();
  };

  // --- Swipe-to-steer: on phones this is the only way to steer (there is
  // no on-screen D-pad).
  const touchStartRef = useRef(null);
  const SWIPE_THRESHOLD = 14; // px of finger travel before it counts as a swipe

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  // The turn is applied the moment the finger has travelled far enough —
  // NOT when it lifts. Waiting for touchend made every turn start a full
  // gesture late, which is what felt like lag. After a swipe is recognised
  // the anchor moves to the finger's current spot, so one continuous drag
  // can chain several turns without lifting.
  const handleTouchMove = (e) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    const key =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? "ArrowRight" : "ArrowLeft"
        : dy > 0 ? "ArrowDown" : "ArrowUp";

    touchStartRef.current = { x: t.clientX, y: t.clientY };
    applyDirection(key);
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  const enterLevels = () => {
    sfx.confirm();
    setScreen("levels");
  };

  const playLevel = (idx) => {
    sfx.levelPick();
    setLevelIndex(idx);
    beginGame(null, LEVELS[idx]);
  };

  const backToLevels = () => {
    sfx.back();
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
        maxWidth: screen === "game" ? GRID * cell : screen === "menu" ? 360 : 300,
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
        <div
          // Swipes are read on the whole game area, not just the board, so
          // there is plenty of room to swipe in. touch-action:none stops
          // the browser scrolling/zooming the page instead.
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{ touchAction: "none", paddingBottom: 12 }}
        >
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
                title={soundOn ? "Mute sound & vibration" : "Unmute sound & vibration"}
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
            className="cli-snake-board"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: GRID * cell,
              aspectRatio: `${GRID} / ${rows}`,
              margin: "0 auto",
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              className="cli-snake-canvas"
              width={GRID * cell}
              height={rows * cell}
              style={{ display: "block", width: "100%", height: "100%" }}
            />

            {phase === "ready" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-modal">
                  <div className="cli-snake-overlay-title">🐍 {level.name}</div>
                  <div className="cli-snake-overlay-text cli-snake-kbd-hint" style={{ whiteSpace: "pre-line", lineHeight: "1.5", margin: "8px 0" }}>
                    {"Press Space / Enter / Arrows to Start\nP to pause · Esc to quit"}
                  </div>
                  <div className="cli-snake-touch-hint">Swipe to change direction</div>
                  <button type="button" className="cli-snake-btn" onClick={() => beginGame()}>
                    Start
                  </button>
                </div>
              </div>
            )}

            {phase === "countdown" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-countdown">{countdown}</div>
                <div className="cli-snake-touch-hint">Swipe to change direction</div>
              </div>
            )}

            {phase === "paused" && (
              <div className="cli-snake-overlay">
                <div className="cli-snake-modal">
                  <div className="cli-snake-overlay-title">PAUSED</div>
                  <button type="button" className="cli-snake-btn" onClick={() => resumeGame()}>
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
                    <button type="button" className="cli-snake-btn" onClick={() => beginGame()}>
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
        </div>
      )}
    </div>
  );
});

export default SnakeArcade;