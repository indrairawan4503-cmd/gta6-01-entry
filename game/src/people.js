// people.js — the player character on foot and the city's pedestrians.
// Characters are simple articulated box figures (torso, head, legs that
// swing while walking). Pedestrians wander the sidewalks and flee when
// scared by gunfire or a speeding car.

import * as THREE from 'three';
import { nearestRoadPoint, WORLD_HALF } from './city.js';

const SKIN = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];
const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0xa8e6cf];

export function makePersonMesh(shirtColor, skinColor, isPlayer) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: isPlayer ? 0x2b3a55 : 0x3a3a3a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.66;
  g.add(head);
  if (isPlayer) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0xff9a3c }));
    cap.position.y = 1.9;
    g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xff9a3c }));
    brim.position.set(0, 1.86, 0.3);
    g.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
    hair.position.y = 1.9;
    g.add(hair);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pants);
  legL.position.set(-0.17, 0.34, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pants);
  legR.position.set(0.17, 0.34, 0);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.05, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armR.position.set(0.42, 1.05, 0);
  g.add(armR);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export function createPlayer(scene, x, z) {
  const mesh = makePersonMesh(0xff9a3c, SKIN[0], true);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh, x, z, heading: 0, speed: 0,
    health: 100, walkPhase: 0, jumping: false, jumpV: 0, y: 0,
  };
}

// on-foot movement: WASD relative to camera heading, with collision
export function movePlayerOnFoot(player, input, camHeading, dt, world) {
  const { f, s } = input.moveAxes();
  const sprint = input.isDown('Shift');
  const targetSpeed = (f !== 0 || s !== 0) ? (sprint ? 10.5 : 6) : 0;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 10);
  if (player.speed > 0.1) {
    const moveAngle = camHeading + Math.atan2(s, f);
    const nx = player.x + Math.sin(moveAngle) * player.speed * dt;
    const nz = player.z + Math.cos(moveAngle) * player.speed * dt;
    const hit = resolvePersonCollision(world, nx, nz);
    player.x = hit.x;
    player.z = hit.z;
    player.heading = moveAngle;
    player.walkPhase += dt * player.speed * 1.6;
  }
  // jump
  if (input.wasPressed(' ') && !player.jumping) {
    player.jumping = true;
    player.jumpV = 7;
  }
  if (player.jumping) {
    player.jumpV -= 22 * dt;
    player.y += player.jumpV * dt;
    if (player.y <= 0) { player.y = 0; player.jumping = false; }
  }
  player.x = Math.max(-212, Math.min(WORLD_HALF, player.x));
  player.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, player.z));
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.heading;
  const swing = Math.sin(player.walkPhase) * Math.min(0.6, player.speed * 0.08);
  player.mesh.userData.legL.rotation.x = swing;
  player.mesh.userData.legR.rotation.x = -swing;
  player.mesh.userData.armL.rotation.x = -swing * 0.7;
  player.mesh.userData.armR.rotation.x = swing * 0.7;
  return player.speed;
}

export function resolvePersonCollision(world, nx, nz) {
  const r = 0.6;
  for (const b of world.colliders) {
    const cx = Math.max(b.minX, Math.min(nx, b.maxX));
    const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        nx += r;
      }
    }
  }
  return { x: nx, z: nz };
}

// --- pedestrians ---
export function spawnPedestrians(scene, count, rand) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const shirt = SHIRTS[Math.floor(rand() * SHIRTS.length)];
    const skin = SKIN[Math.floor(rand() * SKIN.length)];
    const mesh = makePersonMesh(shirt, skin, false);
    const snap = nearestRoadPoint(-180 + rand() * 360, -180 + rand() * 360);
    const ped = {
      mesh, x: snap.x, z: snap.z, heading: rand() * Math.PI * 2,
      speed: 1.4 + rand() * 1.2, walkPhase: rand() * 6,
      state: 'walk', fleeTimer: 0, target: null, health: 100,
    };
    mesh.position.set(ped.x, 0, ped.z);
    scene.add(mesh);
    peds.push(ped);
  }
  return peds;
}

export function updatePedestrians(peds, dt, world) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
    // pick a new sidewalk target when close to the old one
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 2) {
      const snap = nearestRoadPoint(ped.x + (Math.random() - 0.5) * 120, ped.z + (Math.random() - 0.5) * 120);
      ped.target = { x: snap.x, z: snap.z };
    }
    let tx = ped.target.x;
    let tz = ped.target.z;
    let speed = ped.speed;
    if (ped.state === 'flee' && world.player) {
      // run away from the player
      const dx = ped.x - world.player.x;
      const dz = ped.z - world.player.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 30;
      tz = ped.z + (dz / d) * 30;
      speed = 5.5;
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.2) {
      const want = Math.atan2(dx, dz);
      let dh = want - ped.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      ped.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      const hit = resolvePersonCollision(world, nx, nz);
      ped.x = hit.x;
      ped.z = hit.z;
      ped.walkPhase += dt * speed * 2.2;
    }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    const swing = Math.sin(ped.walkPhase) * 0.55;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.userData.armL.rotation.x = -swing * 0.6;
    ped.mesh.userData.armR.rotation.x = swing * 0.6;
  }
}

// scare nearby pedestrians (gunfire, car speeding past)
export function scarePedestrians(peds, x, z, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 3 + Math.random() * 2;
    }
  }
}
