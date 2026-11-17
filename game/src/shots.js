// shots.js — staging helpers for screenshots only.
// Exposes window.SOLMAR_DEBUG so a Playwright script can put the game
// into real, playable states (start a mission, raise wanted level,
// teleport, enter a car) and screenshot the live render. These helpers
// call the game's own public functions — they never fake the HUD or
// draw anything the game itself does not render.

import { updateStars } from './police.js';

export function installDebugHooks(world, fns) {
  const debug = {
    // current state, for the screenshot script to assert on
    state() {
      return {
        gameState: world.state,
        cash: world.cash,
        wanted: world.police.wanted,
        health: world.player.health,
        inCar: !!world.playerCar,
        carName: world.playerCar ? world.playerCar.name : null,
        carSpeed: world.playerCar ? Math.abs(world.playerCar.speed) * 2.237 : 0,
        mission: world.missions.activeIndex,
        missionStep: world.missions.stepIndex,
        x: world.playerCar ? world.playerCar.x : world.player.x,
        z: world.playerCar ? world.playerCar.z : world.player.z,
        policeCars: world.police.policeCars.length,
        footCops: world.police.footCops.length,
        traffic: world.trafficCars.length,
        peds: world.peds.length,
      };
    },
    startGame(newGame) { fns.startGame(newGame !== false); },
    startMission(i) { fns.startMission(world, i); },
    // raise the wanted level through the real heat system
    setWanted(n) {
      const heatFor = [0, 10, 28, 48, 68, 90][Math.max(0, Math.min(5, n))];
      world.police.heat = heatFor;
      world.police.lastCrimeAt = world.time;
      world.police.coolTimer = 0;
      world.police.spawnTimer = 0;
      updateStars(world.police);
    },
    teleport(x, z) {
      if (world.playerCar) {
        world.playerCar.x = x;
        world.playerCar.z = z;
        world.playerCar.speed = 0;
        world.playerCar.mesh.position.set(x, 0, z);
      } else {
        world.player.x = x;
        world.player.z = z;
        world.player.mesh.position.set(x, 0, z);
      }
    },
    // drive the player into the nearest car and enter it (real path:
    // teleport next to it, then use the game's own E handler logic)
    enterNearestCar() {
      let best = null;
      let bestD = 1e9;
      for (const car of world.allCars) {
        if (car.isPlayer) continue;
        const d = Math.hypot(car.x - world.player.x, car.z - world.player.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (!best) return false;
      world.player.x = best.x + 2;
      world.player.z = best.z;
      world.player.mesh.position.set(world.player.x, 0, world.player.z);
      return true;
    },
    // put the player in a car by name (e.g. the gold Vela GT)
    enterCarNamed(name) {
      const car = world.allCars.find((c) => c.name === name);
      if (!car) return false;
      world.player.x = car.x + 2;
      world.player.z = car.z;
      world.player.mesh.position.set(world.player.x, 0, world.player.z);
      return true;
    },
    // snap the chase camera directly behind the current focus (player
    // or car) so a staged shot is framed at once instead of mid-swing
    snapCamera() {
      const inCar = !!world.playerCar;
      const fx = inCar ? world.playerCar.x : world.player.x;
      const fz = inCar ? world.playerCar.z : world.player.z;
      const heading = inCar ? world.playerCar.heading : world.player.heading;
      world.camYaw = heading;
      const dist = inCar ? 11.5 : 8;
      const height = inCar ? 4.4 : 3.6;
      world.camera.position.set(fx - Math.sin(heading) * dist, height, fz - Math.cos(heading) * dist);
      world.camera.lookAt(fx + Math.sin(heading) * 4, 1.6, fz + Math.cos(heading) * 4);
    },
    // freeze the render loop (keeps the last presented frame) so a
    // screenshot can be taken under software rendering without the
    // compositor queue being busy; unfreeze() resumes the loop
    freeze() { world.frozen = true; },
    unfreeze() { world.frozen = false; },
  };
  window.SOLMAR_DEBUG = debug;
  window.__solmar = world;
  return debug;
}
