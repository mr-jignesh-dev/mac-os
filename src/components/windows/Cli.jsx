import React, { useState, useRef, useEffect, useCallback } from "react";
import { RiGamepadLine, RiKeyboardFill } from "react-icons/ri";
import MacWindow from "./MacWindow";
import TypedText from "./TypedText";
import CommandChips from "./CommandChips";
import SnakeArcade from "./SnakeArcade";
import { QUIZ_QUESTIONS } from "./quizQuestions";
import { modKey } from "./Platformutils.js";
import "./cli.scss";

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