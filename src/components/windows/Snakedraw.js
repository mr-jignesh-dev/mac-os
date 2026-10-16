// ---------------------------------------------------------------------------
// Shared canvas drawing. Each function takes the cell size as an argument
// (not a module-level constant) so the real game AND the select-screen
// preview — which use different cell sizes — render through the exact same
// code. That is the actual fix for "the two snakes look different": there
// is only one snake renderer and one apple renderer, not two that can
// quietly drift apart from each other over time.
// ---------------------------------------------------------------------------

/** A little pixel-art apple: body, leaf, stem. */
export const drawApple = (ctx, cellX, cellY, cellSize) => {
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
export const drawPickup = (ctx, cellX, cellY, cellSize, color) => {
  const cx = cellX * cellSize + cellSize / 2;
  const cy = cellY * cellSize + cellSize / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
  ctx.fill();
};

/** Snake as one smooth stroked tube through segment centers, with a lighter
 *  highlight line down the middle. */
export const drawSnake = (ctx, snake, color, cellSize) => {
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