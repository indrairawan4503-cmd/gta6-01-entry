// main.js — Solmar Bay: bootstrap, game loop, camera rig, interactions,
// combat, crimes and the menu / pause / busted state machine.
// The world object is the single shared state every system reads.

import * as THREE from 'three';
import { buildCity, mulberry32, WORLD_HALF } from './city.js';
import { makeCarMesh, createPlayerCar, drivePlayerCar, spawnTraffic, updateTraffic, spawnParkedCars, CAR_NAMES } from './vehicles.js';
import { createPlayer, movePlayerOnFoot, spawnPedestrians, updatePedestrians, scarePedestrians } from './people.js';
import { createPoliceState, addHeat, updatePolice, clearPolice } from './police.js';
import { MISSIONS, createMissionState, makeBeacon, startMission, updateMissions, updateTaxi, applyStep } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { loadSave, writeSave } from './save.js';
import { installDebugHooks } from './shots.js';

const canvas = document.getElementById('game-canvas');
// Software renderers (SwiftShader in headless Chrome) pay a steep price
// for MSAA: detect one with a probe context and turn antialias off there.
// Real desktop GPUs keep antialias on.
function softwareRenderer() {
  try {
    const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!probe) return false;
    const ext = probe.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const name = String(probe.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch (e) {
    return false;
  }
}
const isSoftwareRenderer = softwareRenderer();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSoftwareRenderer });
// under software rendering, render the 3D view at 0.75x backing size
// (CSS still fills the window; the DOM HUD stays crisp) so frames
// stay fast enough to play and screenshot in headless Chromium
renderer.setPixelRatio(isSoftwareRenderer ? 0.75 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 560);

// warm late-afternoon sun + sky bounce
const sun = new THREE.DirectionalLight(0xffd9a0, 1.5);
sun.position.set(-120, 180, 80);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffe0b3, 0x8a7a6a, 0.9));

const world = {
  scene, camera, renderer,
  time: 0,
  frozen: false, // set by SOLMAR_DEBUG.freeze() for screenshots
  state: 'menu', // menu | playing | paused | busted | wasted
  cash: 0,
  totalEarned: 0,
  missionsDone: [],
  coinsCollected: [],
  faresDone: 0,
  bestChaseSeconds: 0,
  chaseTimer: 0,
  player: null,
  playerCar: null,
  trafficCars: [],
  parkedCars: [],
  peds: [],
  police: createPoliceState(),
  missions: createMissionState(),
  hud: null,
  audio: createAudio(),
  input: createInput(canvas),
  colliders: [],
  landmarks: {},
  coinSpots: [],
  allCars: [],
  camYaw: 0,
  crashCooldown: 0,
  shootCooldown: 0,
  flashTimer: 0,
};
world.hud = createHud();
world.toast = (msg, s) => world.hud.showToast(msg, s);
world.dialogue = (who, text, s) => world.hud.showDialogue(who, text, s);
world.save = () => writeSave(world);
world.onCrash = () => { if (world.crashCooldown <= 0) { world.audio.crash(); world.crashCooldown = 0.6; } };

// --- build the city and its population ---
buildCity(scene, world);
const rand = mulberry32(777);
world.trafficCars = spawnTraffic(scene, 11, rand);
world.parkedCars = spawnParkedCars(scene, [
  { x: 24, z: -164, heading: Math.PI / 2, model: 0 },   // gold Vela GT at the showroom
  { x: 148, z: 48, heading: 0, model: 1 },              // Coral Cab at the taxi depot
  { x: -168, z: 128, heading: -Math.PI / 2, model: 3 }, // Brisa Sedan near the safehouse
  { x: -176, z: -88, heading: Math.PI, model: 5 },      // Dune Buggy at the marina
  { x: 168, z: -128, heading: Math.PI / 2, model: 2 },  // Marlin Coupe at the hotel
  { x: -48, z: 164, heading: 0, model: 6 },             // Tide Runner at the chop shop
]);
world.peds = spawnPedestrians(scene, 16, rand);
world.player = createPlayer(scene, -168, 128);
world.missions.beacon = makeBeacon(scene);
world.allCars = [...world.trafficCars, ...world.parkedCars];

// muzzle flash light + tracer line, reused for every shot
const flashLight = new THREE.PointLight(0xffe08a, 0, 18);
scene.add(flashLight);
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, tracerMat);
tracer.visible = false;
scene.add(tracer);

// --- mission list on the start screen ---
function renderMissionList() {
  const el = document.getElementById('mission-list');
  el.innerHTML = '<b>STORY MISSIONS</b><br>' + MISSIONS.map((m, i) => {
    const done = world.missionsDone.includes(m.id);
    return `<span class="${done ? 'done' : 'todo'}">${done ? '&#10003;' : (i + 1) + '.'} ${m.name} — $${m.reward}${done ? ' (done)' : ''}</span>`;
  }).join('<br>') + '<br><span style="color:#9be7ff">Press 1, 2 or 3 in game to start a mission.</span>';
}

// --- game flow ---
function startGame(newGame) {
  const saved = loadSave();
  if (newGame || !saved) {
    world.cash = 50;
    world.totalEarned = 0;
    world.missionsDone = [];
    world.coinsCollected = [];
    world.faresDone = 0;
    world.bestChaseSeconds = 0;
    for (const c of world.coinSpots) { c.taken = false; c.mesh.visible = true; }
  } else {
    world.cash = saved.cash;
    world.totalEarned = saved.totalEarned || 0;
    world.missionsDone = saved.missionsDone || [];
    world.coinsCollected = saved.coinsCollected || [];
    world.faresDone = saved.faresDone || 0;
    world.bestChaseSeconds = saved.bestChaseSeconds || 0;
    for (const c of world.coinSpots) {
      const taken = world.coinsCollected.includes(coinKey(c));
      c.taken = taken;
      c.mesh.visible = !taken;
    }
  }
  resetPlayerToSafehouse();
  world.player.health = 100;
  clearPolice(world.police, world);
  world.missions.activeIndex = -1;
  world.missions.stepIndex = 0;
  world.missions.taxi = null;
  world.missions.markerPos = null;
  world.missions.beacon.visible = false;
  world.state = 'playing';
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('pause-screen').classList.add('hidden');
  world.hud.show();
  world.audio.init();
  world.audio.resume();
  world.audio.click();
  renderMissionList();
  world.hud.setObjective('FREE ROAM', 'Explore Solmar Bay — press 1 to start the first mission', null);
  if (newGame) {
    setTimeout(() => {
      if (world.state === 'playing') {
        world.dialogue('MARISOL (fixer)', 'Dario. First job, easy money. A parcel waits at the marina kiosk — take it to the Hotel Solmar. Press 1 to start the mission, or just drive around and enjoy the sunset.');
        startMission(world, 0);
      }
    }, 600);
  }
}

function resetPlayerToSafehouse() {
  const sh = world.landmarks.safehouse;
  if (world.playerCar) {
    world.scene.remove(world.playerCar.mesh);
    world.allCars = world.allCars.filter((c) => c !== world.playerCar);
    world.playerCar = null;
  }
  world.player.x = sh.x + 16;
  world.player.z = sh.z;
  world.player.heading = Math.PI / 2;
  world.player.y = 0;
  world.player.mesh.position.set(world.player.x, 0, world.player.z);
  world.player.mesh.visible = true;
  world.camYaw = Math.PI / 2;
}

function endRun(kind) {
  // kind: 'busted' | 'wasted'
  const fine = Math.min(world.cash, Math.max(100, Math.floor(world.cash * 0.1)));
  world.cash -= fine;
  world.state = kind;
  clearPolice(world.police, world);
  world.audio.busted();
  world.save();
  document.getElementById('gameover-title').textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED!';
  document.getElementById('gameover-text').textContent = kind === 'busted'
    ? `The Solmar Bay Police caught up with you. Bail and impound fees: -$${fine}.`
    : `You ran out of health on the streets of Solmar Bay. Hospital bill: -$${fine}.`;
  document.getElementById('gameover-screen').classList.remove('hidden');
  world.hud.hide();
}

function togglePause() {
  if (world.state === 'playing') {
    world.state = 'paused';
    document.getElementById('pause-screen').classList.remove('hidden');
  } else if (world.state === 'paused') {
    world.state = 'playing';
    document.getElementById('pause-screen').classList.add('hidden');
    world.audio.resume();
  }
}

// --- interactions ---
function coinKey(c) { return `${Math.round(c.x)},${Math.round(c.z)}`; }

function nearestCar(maxDist) {
  const px = world.player.x;
  const pz = world.player.z;
  let best = null;
  let bestD = maxDist;
  for (const car of world.allCars) {
    if (car.isPlayer) continue;
    const d = Math.hypot(car.x - px, car.z - pz);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryEnterCar() {
  if (world.playerCar) {
    // get out: step out to the side of the car
    const car = world.playerCar;
    world.player.x = car.x + Math.cos(car.heading) * 2.4;
    world.player.z = car.z - Math.sin(car.heading) * 2.4;
    world.player.heading = car.heading;
    world.player.mesh.visible = true;
    world.player.mesh.position.set(world.player.x, 0, world.player.z);
    car.isPlayer = false;
    car.isParked = true;
    world.parkedCars.push(car);
    if (!world.allCars.includes(car)) world.allCars.push(car);
    world.playerCar = null;
    world.audio.click();
    return;
  }
  const car = nearestCar(4.5);
  if (!car) return;
  const wasParked = !!car.isParked;
  const wasTraffic = !!car.isTraffic;
  const wasPolice = !!car.isPolice;
  // take the car out of its old list so traffic/police stop driving it
  if (wasTraffic) world.trafficCars = world.trafficCars.filter((c) => c !== car);
  if (wasParked) world.parkedCars = world.parkedCars.filter((c) => c !== car);
  if (wasPolice) world.police.policeCars = world.police.policeCars.filter((c) => c !== car);
  world.playerCar = car;
  car.isPlayer = true;
  car.name = car.name || 'Street Car';
  car.steer = 0; // stolen cars start with a straight wheel
  world.player.mesh.visible = false;
  world.allCars = world.allCars.filter((c) => c !== car);
  world.audio.steal();
  if (wasPolice) {
    addHeat(world.police, 30, world);
    world.toast('You stole a police cruiser! The whole force is coming.');
  } else if (wasTraffic) {
    addHeat(world.police, 15, world);
    world.toast(`You jacked a ${car.name}! +1 wanted star.`);
    scarePedestrians(world.peds, car.x, car.z, 18);
  } else if (wasParked) {
    world.toast(`You took the ${car.name}.`);
  }
  // mission: stealing the gold Vela GT completes the "steal" step
  if (world.missions.activeIndex === 1 && world.missions.stepIndex === 0 && car.name === 'Vela GT') {
    addHeat(world.police, 20, world);
    world.toast('The Vela GT is yours. Lose the heat and get it to the chop shop!');
    world.missions.stepIndex = 1;
    applyStep(world);
  }
}

function shoot() {
  if (world.shootCooldown > 0 || world.playerCar) return;
  world.shootCooldown = 0.45;
  world.audio.gunshot();
  flashLight.position.set(world.player.x, 1.7, world.player.z);
  flashLight.intensity = 6;
  world.flashTimer = 0.07;
  // aim: camera forward on the XZ plane
  const fx = Math.sin(world.camYaw);
  const fz = Math.cos(world.camYaw);
  const origin = new THREE.Vector3(world.player.x, 1.5, world.player.z);
  let best = null;
  let bestScore = 0.5; // cos angle threshold
  let bestDist = 38;
  const targets = [];
  for (const cop of world.police.footCops) targets.push({ obj: cop, kind: 'cop' });
  for (const ped of world.peds) if (ped.state !== 'down') targets.push({ obj: ped, kind: 'ped' });
  for (const t of targets) {
    const dx = t.obj.x - world.player.x;
    const dz = t.obj.z - world.player.z;
    const d = Math.hypot(dx, dz);
    if (d > bestDist || d < 0.5) continue;
    const cos = (dx * fx + dz * fz) / d;
    if (cos > bestScore) { bestScore = cos; best = t; bestDist = d; }
  }
  const end = new THREE.Vector3(world.player.x + fx * 34, 1.5, world.player.z + fz * 34);
  if (best) {
    end.set(best.obj.x, 1.3, best.obj.z);
    best.obj.health = (best.obj.health ?? 100) - 34;
    if (best.kind === 'cop') {
      addHeat(world.police, 12, world);
      if (best.obj.health <= 0) {
        world.scene.remove(best.obj.mesh);
        world.police.footCops = world.police.footCops.filter((c) => c !== best.obj);
        world.toast('Cop down! The heat just got worse.');
        addHeat(world.police, 14, world);
      }
    } else {
      addHeat(world.police, 12, world);
      if (best.obj.health <= 0) {
        knockPedDown(best.obj);
      } else {
        best.obj.state = 'flee';
        best.obj.fleeTimer = 4;
      }
    }
    scarePedestrians(world.peds, world.player.x, world.player.z, 22);
  }
  tracerGeo.setFromPoints([origin, end]);
  tracer.visible = true;
  setTimeout(() => { tracer.visible = false; }, 90);
}

function knockPedDown(ped) {
  ped.state = 'down';
  ped.mesh.rotation.z = Math.PI / 2;
  ped.mesh.position.y = 0.3;
  setTimeout(() => {
    // the pedestrian gets up and the city replaces them
    world.scene.remove(ped.mesh);
    world.peds = world.peds.filter((p) => p !== ped);
    const fresh = spawnPedestrians(scene, 1, mulberry32((Math.random() * 1e9) | 0))[0];
    world.peds.push(fresh);
  }, 12000);
}

// --- per-frame update ---
let lastT = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fpsTimer = 0;

function animate(now) {
  // one frame of gameplay; animateWithMenu is the only rAF driver
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  fpsAcc += dt;
  fpsFrames += 1;
  fpsTimer += dt;
  // the fps readout is a debug aid: only show it with ?fps in the URL
  if (fpsTimer > 0.5 && window.location.search.includes('fps')) {
    world.hud.fpsNote.textContent = `${Math.round(fpsFrames / fpsAcc)} fps`;
    fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
  }
  if (world.state !== 'playing') {
    renderer.render(scene, camera);
    return;
  }
  world.time += dt;
  world.crashCooldown -= dt;
  world.shootCooldown -= dt;

  const input = world.input;

  // --- mission hotkeys ---
  if (input.wasPressed('1') || input.wasPressed('2') || input.wasPressed('3')) {
    const idx = input.wasPressed('1') ? 0 : input.wasPressed('2') ? 1 : 2;
    if (world.missionsDone.includes(MISSIONS[idx].id)) {
      world.toast(`${MISSIONS[idx].name} is already done. Pick another job.`);
    } else if (world.missions.activeIndex >= 0) {
      world.toast('Finish the current mission first (or press R to restart it).');
    } else {
      startMission(world, idx);
    }
  }
  if (input.wasPressed('r') && world.missions.activeIndex >= 0) {
    const idx = world.missions.activeIndex;
    world.missions.stepIndex = 0;
    world.missions.timer = 0;
    world.toast(`${MISSIONS[idx].name} restarted.`);
    applyStep(world);
  }
  if (input.wasPressed('e')) tryEnterCar();
  if (input.wasPressed('f')) shoot();
  if (input.wasPressed('m')) {
    world.audio.setMuted(!world.audio.muted);
    world.toast(world.audio.muted ? 'Sound muted (M to unmute)' : 'Sound on');
  }
  if (input.wasPressed('Escape')) togglePause();
  if (input.wasPressed('h')) {
    world.dialogue('CONTROLS', 'WASD drive/walk · E enter car · F shoot · SHIFT sprint/boost · SPACE handbrake/jump · 1/2/3 missions · R restart mission · M mute · ESC pause. Drag the mouse to look around.');
  }

  // --- movement (inCar is read AFTER the interaction keys above, so
  // pressing E to enter/exit a car takes effect in this same frame) ---
  const inCar = !!world.playerCar;
  let speedMph = 0;
  if (inCar) {
    const sp = drivePlayerCar(world.playerCar, input, dt, world);
    speedMph = Math.abs(sp) * 2.237;
    // running over pedestrians
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - world.playerCar.x, ped.z - world.playerCar.z);
      if (d < 2.4 && Math.abs(sp) > 5) {
        knockPedDown(ped);
        addHeat(world.police, 12, world);
        world.playerCar.speed *= 0.7;
        world.audio.crash();
        world.toast('You hit a pedestrian! Wanted level up.');
        scarePedestrians(world.peds, ped.x, ped.z, 20);
      }
    }
    // bumping traffic cars
    for (const car of world.trafficCars) {
      const d = Math.hypot(car.x - world.playerCar.x, car.z - world.playerCar.z);
      if (d < 3.4 && Math.abs(sp) > 3) {
        world.playerCar.speed *= 0.75;
        car.x += (car.x - world.playerCar.x) * 0.4;
        car.z += (car.z - world.playerCar.z) * 0.4;
        if (world.crashCooldown <= 0) { world.audio.crash(); world.crashCooldown = 0.6; }
      }
    }
  } else {
    const sp = movePlayerOnFoot(world.player, input, world.camYaw, dt, world);
    speedMph = Math.abs(sp) * 2.237;
  }

  // --- traffic + pedestrians ---
  world.allCars = [...world.trafficCars, ...world.parkedCars, ...(world.playerCar ? [world.playerCar] : []), ...world.police.policeCars];
  updateTraffic(world.trafficCars, dt, world);
  updatePedestrians(world.peds, dt, world);

  // --- police ---
  const bustedTime = updatePolice(world.police, dt, world);
  if (world.police.wanted > 0) {
    world.chaseTimer += dt;
    world.bestChaseSeconds = Math.max(world.bestChaseSeconds, world.chaseTimer);
  } else {
    world.chaseTimer = 0;
  }
  if (bustedTime > 1.5) { endRun('busted'); return; }

  // --- missions + taxi ---
  updateMissions(world, dt);
  updateTaxi(world, dt);

  // --- sun coins: spin + collect ---
  for (const c of world.coinSpots) {
    if (c.taken) continue;
    c.mesh.rotation.y += dt * 2;
    c.mesh.position.y = 1.6 + Math.sin(world.time * 2 + c.mesh.userData.spin) * 0.25;
    const px = inCar ? world.playerCar.x : world.player.x;
    const pz = inCar ? world.playerCar.z : world.player.z;
    if (Math.hypot(c.x - px, c.z - pz) < 2.6) {
      c.taken = true;
      c.mesh.visible = false;
      world.cash += 25;
      world.totalEarned += 25;
      world.coinsCollected.push(coinKey(c));
      world.audio.coin();
      world.toast('Sun coin +$25');
      world.save();
    }
  }

  // --- health regen when clean ---
  if (world.police.wanted === 0 && world.player.health < 100) {
    world.player.health = Math.min(100, world.player.health + dt * 2);
  }
  if (world.player.health <= 0) { endRun('wasted'); return; }

  // --- beacon pulse ---
  if (world.missions.beacon.visible) {
    const ring = world.missions.beacon.userData.ring;
    const s = 1 + Math.sin(world.time * 4) * 0.15;
    ring.scale.set(s, s, 1);
  }

  // --- camera rig: third-person chase, drag adds orbit ---
  const focusX = inCar ? world.playerCar.x : world.player.x;
  const focusZ = inCar ? world.playerCar.z : world.player.z;
  const baseHeading = inCar ? world.playerCar.heading : world.player.heading;
  const targetYaw = baseHeading + world.input.camYaw;
  // a non-finite yaw (should never happen) snaps back instead of poisoning the camera
  if (!Number.isFinite(world.camYaw) || !Number.isFinite(targetYaw)) world.camYaw = baseHeading;
  let dy = targetYaw - world.camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  world.camYaw += dy * Math.min(1, dt * 4);
  const dist = inCar ? 11.5 : 8;
  const height = inCar ? 4.4 : 3.6;
  const camX = focusX - Math.sin(world.camYaw) * dist;
  const camZ = focusZ - Math.cos(world.camYaw) * dist;
  const camY = height + world.input.camPitch * 6;
  camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, dt * 8));
  camera.lookAt(focusX + Math.sin(world.camYaw) * 4, 1.6, focusZ + Math.cos(world.camYaw) * 4);

  // --- audio + HUD ---
  world.audio.update(speedMph, world.police.wanted, dt);
  world.hud.update(world, dt);
  if (world.flashTimer > 0) {
    world.flashTimer -= dt;
    if (world.flashTimer <= 0) flashLight.intensity = 0;
  }
  input.endFrame();
  renderer.render(scene, camera);
}

// --- menu buttons ---
document.getElementById('btn-start').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-quit').addEventListener('click', () => {
  world.state = 'menu';
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
  world.hud.hide();
  renderMissionList();
  refreshContinueButton();
});
document.getElementById('btn-retry').addEventListener('click', () => {
  document.getElementById('gameover-screen').classList.add('hidden');
  resetPlayerToSafehouse();
  world.player.health = 100;
  world.state = 'playing';
  world.hud.show();
});
document.getElementById('btn-menu').addEventListener('click', () => {
  world.state = 'menu';
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
  renderMissionList();
  refreshContinueButton();
});

function refreshContinueButton() {
  const saved = loadSave();
  document.getElementById('btn-continue').classList.toggle('hidden', !saved);
  if (saved) {
    document.getElementById('btn-continue').textContent = `CONTINUE — $${saved.cash} · ${saved.missionsDone.length}/3 missions`;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- menu backdrop: slow orbit over the city before play starts ---
const menuCamAngle = { a: 0 };
function menuCamera(dt) {
  menuCamAngle.a += dt * 0.05;
  const r = 190;
  camera.position.set(Math.sin(menuCamAngle.a) * r, 90, Math.cos(menuCamAngle.a) * r);
  camera.lookAt(0, 0, 0);
}
const origAnimate = animate;
function animateWithMenu(now) {
  // frozen (screenshot staging): keep the last presented frame, do no work
  if (world.frozen) {
    requestAnimationFrame(animateWithMenu);
    return;
  }
  if (world.state === 'menu' || world.state === 'busted' || world.state === 'wasted') {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (world.state === 'menu') menuCamera(dt);
    // keep the city alive behind the menu
    world.time += dt;
    updateTraffic(world.trafficCars, dt, world);
    updatePedestrians(world.peds, dt, world);
    renderer.render(scene, camera);
    requestAnimationFrame(animateWithMenu);
    return;
  }
  origAnimate(now);
  requestAnimationFrame(animateWithMenu);
}

// --- boot ---
renderMissionList();
refreshContinueButton();
installDebugHooks(world, { startGame, startMission, addHeat });
requestAnimationFrame(animateWithMenu);
