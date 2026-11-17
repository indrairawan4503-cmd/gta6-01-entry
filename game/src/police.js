// police.js — the wanted system and the Solmar Bay Police response.
// Stars 0-5: crimes add heat, police cars and foot cops spawn and chase,
// and the heat cools when the player stays unseen. Getting caught on
// foot (busted) or losing all health (wasted) costs cash and resets heat.

import * as THREE from 'three';
import { makeCarMesh, resolveCarCollision } from './vehicles.js';
import { makePersonMesh, resolvePersonCollision } from './people.js';
import { WORLD_HALF } from './city.js';

export const MAX_WANTED = 5;

export function createPoliceState() {
  return {
    wanted: 0,
    heat: 0,            // 0..100, drives star count
    lastCrimeAt: 0,
    coolTimer: 0,
    policeCars: [],
    footCops: [],
    bustedTimer: 0,     // how long a cop has been touching the player
    spawnTimer: 0,
  };
}

export function addHeat(police, amount, world) {
  police.heat = Math.min(100, police.heat + amount);
  police.lastCrimeAt = world.time;
  police.coolTimer = 0;
  updateStars(police);
}

export function updateStars(police) {
  const stars = police.heat <= 0 ? 0
    : police.heat < 18 ? 1
    : police.heat < 38 ? 2
    : police.heat < 58 ? 3
    : police.heat < 80 ? 4 : 5;
  police.wanted = stars;
}

// desired number of police units for the current wanted level
function desiredUnits(wanted) {
  return { cars: [0, 1, 2, 3, 4, 5][wanted], cops: [0, 1, 1, 2, 3, 4][wanted] };
}

export function spawnPoliceCar(scene, world, x, z) {
  const mesh = makeCarMesh(0xf2f2f2, true);
  const car = {
    mesh, x, z, heading: 0, speed: 0, isPolice: true,
    ramCooldown: 0,
  };
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return car;
}

export function spawnFootCop(scene, world, x, z) {
  const mesh = makePersonMesh(0x1c3d6e, 0xe8b98a, false);
  // navy cap on the cop
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x101c30 }));
  cap.position.y = 1.9;
  mesh.add(cap);
  const cop = { mesh, x, z, heading: 0, speed: 6.4, walkPhase: 0, state: 'chase' };
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return cop;
}

export function updatePolice(police, dt, world) {
  const player = world.player;
  const inCar = !!world.playerCar;
  const px = inCar ? world.playerCar.x : player.x;
  const pz = inCar ? world.playerCar.z : player.z;
  const playerSpeed = inCar ? Math.abs(world.playerCar.speed) : player.speed;

  // --- heat cools down when no crime happened recently and police are far ---
  if (police.wanted > 0 && world.time - police.lastCrimeAt > 9) {
    police.coolTimer += dt;
    if (police.coolTimer > 4) {
      police.heat = Math.max(0, police.heat - dt * 3.2);
      updateStars(police);
      if (police.wanted === 0) world.toast && world.toast('You lost the heat. Stay clean, Dario.');
    }
  }

  // --- spawn / despawn units to match the wanted level ---
  police.spawnTimer -= dt;
  const want = desiredUnits(police.wanted);
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.2;
    while (police.policeCars.length < want.cars) {
      const ang = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 25;
      const sx = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, px + Math.sin(ang) * d));
      const sz = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pz + Math.cos(ang) * d));
      police.policeCars.push(spawnPoliceCar(world.scene, world, sx, sz));
    }
    while (police.footCops.length < want.cops) {
      const ang = Math.random() * Math.PI * 2;
      const d = 22 + Math.random() * 12;
      police.footCops.push(spawnFootCop(world.scene, world, px + Math.sin(ang) * d, pz + Math.cos(ang) * d));
    }
    while (police.policeCars.length > want.cars) {
      const car = police.policeCars.pop();
      world.scene.remove(car.mesh);
    }
    while (police.footCops.length > want.cops) {
      const cop = police.footCops.pop();
      world.scene.remove(cop.mesh);
    }
  }

  // --- police cars: steer toward the player, ram to stop them ---
  for (const car of police.policeCars) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const maxTurn = 2.6 * dt;
    car.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
    const targetSpeed = dist > 90 ? 40 : dist > 12 ? 30 : 16;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = resolveCarCollision(world, car, nx, nz);
    car.x = hit.x;
    car.z = hit.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels || []) w.rotation.x += car.speed * dt * 1.6;
    // flashing light bar
    const phase = Math.floor(world.time * 6) % 2 === 0;
    if (car.mesh.userData.sirenRed) {
      car.mesh.userData.sirenRed.material.emissive.setHex(phase ? 0xff0000 : 0x220000);
      car.mesh.userData.sirenBlue.material.emissive.setHex(phase ? 0x000022 : 0x0022ff);
    }
    // ram: if the police car hits the player's car, slow the player down
    if (inCar && dist < 3.4 && car.ramCooldown <= 0) {
      world.playerCar.speed *= 0.55;
      car.speed *= 0.6;
      car.ramCooldown = 1.2;
      world.onCrash && world.onCrash(6);
      world.audio && world.audio.crash();
    }
    car.ramCooldown -= dt;
    // despawn if the chase drags too far away
    if (dist > 260) {
      const ang = Math.random() * Math.PI * 2;
      car.x = px + Math.sin(ang) * 60;
      car.z = pz + Math.cos(ang) * 60;
    }
  }

  // --- foot cops: run the player down on foot ---
  police.bustedTimer = 0;
  for (const cop of police.footCops) {
    const dx = px - cop.x;
    const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz);
    if (inCar) {
      // cops cannot catch a car: they jog after it, then give up close in
      if (dist > 40) {
        const ang = Math.random() * Math.PI * 2;
        cop.x = px + Math.sin(ang) * 30;
        cop.z = pz + Math.cos(ang) * 30;
      }
    }
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += Math.max(-3 * dt, Math.min(3 * dt, dh));
    const speed = inCar ? 3 : cop.speed;
    const nx = cop.x + Math.sin(cop.heading) * speed * dt;
    const nz = cop.z + Math.cos(cop.heading) * speed * dt;
    const hit = resolvePersonCollision(world, nx, nz);
    cop.x = hit.x;
    cop.z = hit.z;
    cop.walkPhase += dt * speed * 2.2;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    const swing = Math.sin(cop.walkPhase) * 0.55;
    cop.mesh.userData.legL.rotation.x = swing;
    cop.mesh.userData.legR.rotation.x = -swing;
    cop.mesh.userData.armL.rotation.x = -swing * 0.6;
    cop.mesh.userData.armR.rotation.x = swing * 0.6;
    // busted: a cop holds the player still on foot
    if (!inCar && dist < 1.6 && playerSpeed < 2.5) {
      police.bustedTimer += dt;
    }
  }
  return police.bustedTimer;
}

// clear all police units (after busted / wasted / mission reset)
export function clearPolice(police, world) {
  for (const car of police.policeCars) world.scene.remove(car.mesh);
  for (const cop of police.footCops) world.scene.remove(cop.mesh);
  police.policeCars = [];
  police.footCops = [];
  police.heat = 0;
  police.wanted = 0;
  police.bustedTimer = 0;
  police.coolTimer = 0;
}
