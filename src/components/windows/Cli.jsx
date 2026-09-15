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

// Helper function to check if user is on mobile
const checkIsMobile = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
// Snake Game — retro handheld styling, synthesized SFX, mobile D-pad
// ---------------------------------------------------------------------------

const GRID = 18;
const CELL = 15;
const TICK_MS = 160;

const SnakeGame = forwardRef(({ onGameOver, onGameStart }, ref) => {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [phase, setPhase] = useState("ready");
  const [score, setScore] = useState(0);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      const saved = localStorage.getItem("snake-sound");
      return saved === null ? true : JSON.parse(saved);
    } catch {
      return true;
    }
  });

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
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
      if (sweepFrom) {
        osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* Web Audio unavailable — fail silently */
    }
  };

  const playClick = () => beep(520, 0.045, "square");
  const playEat = () => beep(880, 0.09, "square", 480);
  const playGameOver = () => beep(110, 0.35, "sawtooth", 420);

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try {
        localStorage.setItem("snake-sound", JSON.stringify(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  };

  const randomFood = (snake) => {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
    return pos;
  };

  const freshState = () => {
    const snake = [
      { x: 8, y: 9 },
      { x: 7, y: 9 },
      { x: 6, y: 9 },
    ];
    return {
      snake,
      dir: { x: 1, y: 0 },
      pendingDir: { x: 1, y: 0 },
      food: randomFood(snake),
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

    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(s.food.x * CELL, s.food.y * CELL, CELL - 1, CELL - 1);

    s.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? "#4dff88" : "#2fae63";
      ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL - 1, CELL - 1);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = GRID * CELL;
      canvas.height = GRID * CELL;
      stateRef.current = freshState();
      draw();
    }
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const tick = () => {
      const s = stateRef.current;
      if (!s) return;
      s.dir = s.pendingDir;
      const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };

      const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
      const hitSelf = s.snake.some((seg) => seg.x === head.x && seg.y === head.y);
      if (hitWall || hitSelf) {
        s.over = true;
        draw();
        setPhase("over");
        playGameOver();
        onGameOver && onGameOver(s.score);
        return;
      }

      s.snake.unshift(head);
      if (head.x === s.food.x && head.y === s.food.y) {
        s.score += 1;
        setScore(s.score);
        s.food = randomFood(s.snake);
        playEat();
      } else {
        s.snake.pop();
      }
      draw();
    };

    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [phase, onGameOver, soundOn]);

  const countdownTimers = useRef([]);
  const [countdown, setCountdown] = useState(null);

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

  const beginGame = (initialDirKey) => {
    stateRef.current = freshState();
    if (initialDirKey) {
      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const dir = map[initialDirKey];
      if (dir) {
        stateRef.current.dir = dir;
        stateRef.current.pendingDir = dir;
      }
    }
    setScore(0);
    draw();
    runCountdownThen(() => {
      setPhase("playing");
      onGameStart && onGameStart();
    });
  };

  const resumeGame = () => {
    runCountdownThen(() => setPhase("playing"));
  };

  const togglePause = () => {
    if (phase === "playing") setPhase("paused");
    else if (phase === "paused") resumeGame();
  };

  const applyDirection = (key) => {
    if (phase === "ready" || phase === "over") {
      beginGame(key);
      return;
    }
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
    if (phase === "playing" || phase === "paused") togglePause();
    else beginGame();
  };

  const handleDpadPress = (key) => {
    playClick();
    applyDirection(key);
  };

  useImperativeHandle(ref, () => ({
    startGame: () => {
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
    <div className="cli-snake-wrap" style={{ position: "relative", width: GRID * CELL, margin: "10px 0" }}>
      <div className="cli-snake-toolbar">
        <span className="cli-snake-score">SCORE: {String(score).padStart(4, "0")}</span>
        <div className="cli-snake-toolbar-actions">
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

      <div style={{ position: "relative", width: GRID * CELL, height: GRID * CELL, border: "1px solid #334155", borderRadius: "6px", overflow: "hidden" }}>
        <canvas ref={canvasRef} className="cli-snake-canvas" style={{ display: "block" }} />

        {phase === "ready" && (
          <div className="cli-snake-overlay">
            <div className="cli-snake-overlay-title">🐍 SNAKE</div>
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
              {`Final Score: ${score}`}
              <span className="cli-snake-kbd-hint">{"\n(Press R, Enter, or Space to restart)"}</span>
            </div>
            <button type="button" className="cli-snake-btn" onClick={() => { playClick(); beginGame(); }}>
              Play Again
            </button>
          </div>
        )}
      </div>

      <div className="cli-snake-mobile-controls">
        <div className="cli-snake-dpad">
          <button type="button" className="cli-snake-dpad-btn up" onClick={() => handleDpadPress("ArrowUp")} aria-label="Up">▲</button>
          <button type="button" className="cli-snake-dpad-btn left" onClick={() => handleDpadPress("ArrowLeft")} aria-label="Left">◀</button>
          <button type="button" className="cli-snake-dpad-btn right" onClick={() => handleDpadPress("ArrowRight")} aria-label="Right">▶</button>
          <button type="button" className="cli-snake-dpad-btn down" onClick={() => handleDpadPress("ArrowDown")} aria-label="Down">▼</button>
        </div>
      </div>
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

const Cli = ({ windowName, setWindowsState }) => {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyPointer, setHistoryPointer] = useState(null);
  const [theme, setTheme] = useState("default");
  const [quiz, setQuiz] = useState(null);
  const [gameActive, setGameActive] = useState(null);
  const [isMobile, setIsMobile] = useState(checkIsMobile);

  const inputRef = useRef(null);
  const bodyRef = useRef(null);
  const snakeRef = useRef(null);
  const idRef = useRef(0);

  const quizRef = useRef(quiz);
  const cmdHistoryRef = useRef(cmdHistory);
  const isMobileRef = useRef(isMobile);

  useEffect(() => {
    quizRef.current = quiz;
  }, [quiz]);

  useEffect(() => {
    cmdHistoryRef.current = cmdHistory;
  }, [cmdHistory]);

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    const handleResize = () => setIsMobile(checkIsMobile());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

      // Block shortcuts execution on mobile
      if (commandKey === "shortcuts" && isMobileRef.current) {
        pushLine("output", "Keyboard shortcuts are only available on desktop devices.");
        return;
      }

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
      if (isMobileRef.current) {
        pushLine("output", "Keyboard shortcuts are only available on desktop devices.");
        return null;
      }
      const altKey = isMac ? "Option" : "Alt";
      pushLine(
        "jsx",
        <div style={{ margin: "4px 0" }}>
          <div className="cli-out" style={{ fontWeight: "bold", marginBottom: "6px" }}>
            <RiKeyboardFill style={{ verticalAlign: "middle", marginRight: "6px" }} /> Keyboard Shortcuts:
          </div>
          <div className="cli-out" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9em", opacity: 0.9 }}>
            <div><kbd>{altKey} + S</kbd> — Switch/cycle through Dock apps</div>
            <div><kbd>{altKey} + X</kbd> — Close current focused window</div>
            <div style={{ height: "4px" }} />
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
      const availableCmds = Object.keys(commands).filter(
        (c) => !(c === "shortcuts" && isMobileRef.current)
      );

      pushLine(
        "jsx",
        <div style={{ margin: "6px 0" }}>
          <div className="cli-out" style={{ fontWeight: "bold", marginBottom: "6px" }}>
            Available Commands:
          </div>
          <CommandChips
            items={availableCmds.map((c) => ({ label: c, run: c }))}
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

      const availableCmds = Object.keys(commands).filter(
        (c) => !(c === "shortcuts" && isMobile)
      );
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
    <MacWindow windowName={windowName} setWindowsState={setWindowsState}>
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
                <SnakeGame
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