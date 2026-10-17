import React, { useRef, useEffect } from "react";
import { getAccentColor } from "./Themeutils.js";
import { drawApple, drawSnake } from "./Snakedraw.js";

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

export default AttractPreview;