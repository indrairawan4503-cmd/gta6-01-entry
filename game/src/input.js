// input.js — keyboard + mouse-drag camera input for Solmar Bay.
// Tracks held keys and a drag-orbit camera offset (yaw/pitch) that the
// main camera rig reads every frame. No pointer lock: plain drag works
// in every desktop browser and in headless test runs.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    camYaw: 0,      // extra orbit angle added by dragging (radians)
    camPitch: 0,    // extra pitch added by dragging (radians)
    dragging: false,
    // one-shot edge triggers, consumed by the game loop each frame
    pressed: new Set(),
  };

  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) {
      input.pressed.add(k);
      input.pressed.add(e.key);
    }
    keys.add(k);
    keys.add(e.key);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(k);
    keys.delete(e.key);
  });
  window.addEventListener('blur', () => keys.clear());

  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    input.dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!input.dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    input.camYaw -= dx * 0.005;
    input.camPitch += dy * 0.004;
    input.camPitch = Math.max(-0.45, Math.min(0.55, input.camPitch));
  });
  window.addEventListener('mouseup', () => { input.dragging = false; });

  input.isDown = (name) => keys.has(name);
  input.wasPressed = (name) => input.pressed.has(name);
  input.endFrame = () => input.pressed.clear();
  // movement axes: forward +1 (W / ArrowUp), strafe right +1 (D)
  input.moveAxes = () => {
    let f = 0;
    let s = 0;
    if (keys.has('w') || keys.has('ArrowUp')) f += 1;
    if (keys.has('s') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) s += 1;
    if (keys.has('a') || keys.has('ArrowLeft')) s -= 1;
    return { f, s };
  };
  return input;
}
