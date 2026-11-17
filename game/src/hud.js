// hud.js — the Solmar Bay HUD: cash, health, wanted stars, objective
// banner, speedometer, toasts, dialogue box, and the live minimap.
// The minimap is a 2D canvas drawn from the world state every frame:
// roads, water, buildings, player arrow, police, traffic and markers.

import { roadLines, WORLD_HALF } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    root: $('hud'),
    cash: $('cash'),
    healthFill: $('health-fill'),
    stars: $('stars'),
    objTitle: $('obj-title'),
    objText: $('obj-text'),
    objDist: $('obj-dist'),
    speedNum: $('speed-num'),
    speedLabel: $('speed-label'),
    toast: $('toast'),
    dialogue: $('dialogue'),
    dlgWho: $('dlg-who'),
    dlgText: $('dlg-text'),
    crosshair: $('crosshair'),
    minimap: $('minimap'),
    fpsNote: $('fps-note'),
    toastTimer: 0,
    dlgTimer: 0,
    minimapTimer: 0,
    lastCash: null,
    lastWanted: -1,
    lastHealth: -1,
    lastSpeed: -1,
  };
  const ctx = hud.minimap.getContext('2d');
  hud.ctx = ctx;

  hud.show = () => hud.root.classList.remove('hidden');
  hud.hide = () => hud.root.classList.add('hidden');

  hud.setObjective = (title, text, markerPos, dist) => {
    hud.objTitle.textContent = title;
    hud.objText.textContent = text;
    hud.objDist.textContent = (dist != null && Number.isFinite(dist)) ? `${Math.round(dist)}m to objective` : '';
  };

  hud.showToast = (text, seconds) => {
    hud.toast.textContent = text;
    hud.toastTimer = seconds || 3;
  };

  hud.showDialogue = (who, text, seconds) => {
    hud.dlgWho.textContent = who + ': ';
    hud.dlgText.textContent = text;
    hud.dialogue.classList.remove('hidden');
    hud.dlgTimer = seconds || 6;
  };

  hud.update = (world, dt) => {
    // cache DOM writes: only touch the DOM when a value actually changed
    const cash = Math.floor(world.cash);
    if (cash !== hud.lastCash) {
      hud.cash.textContent = '$' + cash.toLocaleString('en-US');
      hud.lastCash = cash;
    }
    const hp = Math.max(0, Math.min(100, world.player.health));
    if (Math.abs(hp - hud.lastHealth) > 0.5) {
      hud.healthFill.style.width = hp + '%';
      hud.lastHealth = hp;
    }
    if (world.police.wanted !== hud.lastWanted) {
      let starHtml = '';
      for (let i = 0; i < 5; i++) {
        starHtml += i < world.police.wanted ? '&#9733;' : '<span class="off">&#9733;</span>';
      }
      hud.stars.innerHTML = starHtml;
      hud.lastWanted = world.police.wanted;
    }
    const inCar = !!world.playerCar;
    const speedMph = inCar ? Math.abs(world.playerCar.speed) * 2.237 : Math.abs(world.player.speed) * 2.237;
    const speedInt = Math.round(speedMph);
    if (speedInt !== hud.lastSpeed) {
      hud.speedNum.textContent = speedInt;
      hud.lastSpeed = speedInt;
    }
    hud.speedLabel.textContent = inCar ? `MPH · ${world.playerCar.name || 'CAR'}` : 'MPH · ON FOOT';
    hud.crosshair.classList.toggle('hidden', inCar);
    if (hud.toastTimer > 0) {
      hud.toastTimer -= dt;
      if (hud.toastTimer <= 0) hud.toast.textContent = '';
    }
    if (hud.dlgTimer > 0) {
      hud.dlgTimer -= dt;
      if (hud.dlgTimer <= 0) hud.dialogue.classList.add('hidden');
    }
    // minimap at ~7 Hz is plenty and keeps the frame budget sane
    hud.minimapTimer -= dt;
    if (hud.minimapTimer <= 0) {
      hud.minimapTimer = 0.14;
      drawMinimap(hud, world);
    }
  };

  return hud;
}

function drawMinimap(hud, world) {
  const ctx = hud.ctx;
  const S = 190;
  const scale = S / (WORLD_HALF * 2 + 60);
  const toMap = (x, z) => [(x + WORLD_HALF + 30) * scale, (z + WORLD_HALF + 30) * scale];
  ctx.clearRect(0, 0, S, S);
  // sea + sand on the west edge
  ctx.fillStyle = '#1d6f92';
  ctx.fillRect(0, 0, toMap(-200, 0)[0], S);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(toMap(-200, 0)[0], 0, 8, S);
  // city base
  ctx.fillStyle = '#5c5a55';
  ctx.fillRect(toMap(-200, 0)[0], 0, S - toMap(-200, 0)[0], S);
  // roads
  ctx.strokeStyle = '#2c2f36';
  ctx.lineWidth = 5;
  for (const v of roadLines()) {
    const [ax] = toMap(v, 0);
    const [, bz] = toMap(0, v);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, bz); ctx.lineTo(S, bz); ctx.stroke();
  }
  // buildings (approximate: small blocks from colliders, capped count)
  ctx.fillStyle = '#8d8a82';
  const cols = world.colliders;
  for (let i = 0; i < cols.length; i += 2) {
    const b = cols[i];
    const [x1, z1] = toMap(b.minX, b.minZ);
    const [x2, z2] = toMap(b.maxX, b.maxZ);
    ctx.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
  }
  // mission / taxi marker: pulsing yellow diamond
  if (world.missions.markerPos) {
    const [mx, my] = toMap(world.missions.markerPos.x, world.missions.markerPos.z);
    const pulse = 5 + Math.sin(world.time * 5) * 2;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(mx, my - pulse - 3);
    ctx.lineTo(mx + pulse, my);
    ctx.lineTo(mx, my + pulse + 3);
    ctx.lineTo(mx - pulse, my);
    ctx.closePath();
    ctx.fill();
  }
  // traffic: white dots
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const car of world.trafficCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  // police: red dots
  ctx.fillStyle = '#ff3333';
  for (const car of world.police.policeCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const cop of world.police.footCops) {
    const [x, y] = toMap(cop.x, cop.z);
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }
  // player: white triangle pointing along heading
  const px = world.playerCar ? world.playerCar.x : world.player.x;
  const pz = world.playerCar ? world.playerCar.z : world.player.z;
  const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
  const [pxm, pzm] = toMap(px, pz);
  ctx.save();
  ctx.translate(pxm, pzm);
  ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
