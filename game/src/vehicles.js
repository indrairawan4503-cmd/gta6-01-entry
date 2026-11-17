// vehicles.js — car meshes, arcade driving physics and city traffic.
// Cars are built from boxes + cylinder wheels (no external models).
// Traffic cars follow the road grid, turning at intersections; the
// player's car uses simple arcade physics with drift on handbrake.

import * as THREE from 'three';
import { roadLines, nearestRoadPoint, WORLD_HALF } from './city.js';

export const CAR_NAMES = [
  { name: 'Vela GT', color: 0xffd700, speed: 1.25 },
  { name: 'Coral Cab', color: 0xffc21a, speed: 0.95 },
  { name: 'Marlin Coupe', color: 0x2e86ff, speed: 1.15 },
  { name: 'Brisa Sedan', color: 0xe05a5a, speed: 1.0 },
  { name: 'Palma Van', color: 0x7bc47f, speed: 0.85 },
  { name: 'Dune Buggy', color: 0xff8c42, speed: 1.05 },
  { name: 'Tide Runner', color: 0x9b59b6, speed: 1.1 },
  { name: 'Sol Hatch', color: 0xeeeeee, speed: 0.95 },
];

// Build a low-poly car group facing +Z. `police` adds a light bar.
export function makeCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 2.0), bodyMat);
  roof.position.set(0, 1.42, -0.25);
  group.add(roof);
  // headlights / taillights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0x887a33 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x660000 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    hl.position.set(sx, 0.6, 2.22);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tl.position.set(sx, 0.6, -2.22);
    group.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  group.userData.wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
    group.userData.wheels.push(w);
  }
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: 0x1c3d6e }));
    stripe.position.y = 0.72;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.55, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    red.position.set(-0.32, 1.68, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff }));
    blue.position.set(0.32, 1.68, -0.25);
    group.add(blue);
    group.userData.sirenRed = red;
    group.userData.sirenBlue = blue;
  }
  return group;
}

// --- player car physics (arcade) ---
export function createPlayerCar(scene, mesh, x, z, heading) {
  const car = {
    mesh, x, z, heading, speed: 0, steer: 0,
    name: 'player', isPlayer: true, color: 0xffffff,
  };
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return car;
}

export function drivePlayerCar(car, input, dt, world) {
  // a stolen traffic / parked / police car may not carry a steer value yet
  if (car.steer == null) car.steer = 0;
  if (!Number.isFinite(car.heading)) car.heading = 0;
  const accel = 26;
  const brake = 42;
  const maxSpeed = 34; // ~76 mph
  const maxReverse = 12;
  const { f } = input.moveAxes();
  const boosting = input.isDown('Shift');
  if (f > 0) car.speed += accel * (boosting ? 1.35 : 1) * dt;
  else if (f < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
  }
  car.speed = Math.max(-maxReverse, Math.min(maxSpeed, car.speed));
  // steering: stronger at low speed, weaker at high speed
  const steerTarget = (input.isDown('a') || input.isDown('ArrowLeft') ? 1 : 0) -
    (input.isDown('d') || input.isDown('ArrowRight') ? 1 : 0);
  const steerRate = 2.4 / (1 + Math.abs(car.speed) * 0.045);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const handbrake = input.isDown(' ');
  if (handbrake && Math.abs(car.speed) > 4) {
    car.speed -= Math.sign(car.speed) * 22 * dt;
    car.heading += car.steer * steerRate * 1.9 * dt * Math.sign(car.speed);
  } else if (Math.abs(car.speed) > 0.05) {
    car.heading += car.steer * steerRate * dt * Math.sign(car.speed);
  }
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCarCollision(world, car, nx, nz);
  car.x = hit.x;
  car.z = hit.z;
  if (hit.bumped && Math.abs(car.speed) > 6) {
    car.speed *= 0.45;
    world.onCrash && world.onCrash(Math.abs(car.speed));
  }
  // stay inside the playable area (beach is drivable, water is not)
  car.x = Math.max(-212, Math.min(WORLD_HALF, car.x));
  car.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, car.z));
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // body roll + wheel spin for feel
  car.mesh.rotation.z = -car.steer * Math.min(0.06, Math.abs(car.speed) * 0.002);
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += car.speed * dt * 1.6;
  return car.speed;
}

// push a car out of building AABBs (circle radius ~1.6 vs box)
export function resolveCarCollision(world, car, nx, nz) {
  const r = 1.7;
  let bumped = false;
  for (const b of world.colliders) {
    const cx = Math.max(b.minX, Math.min(nx, b.maxX));
    const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      bumped = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        nx += r;
      }
    }
  }
  return { x: nx, z: nz, bumped };
}

// --- traffic: cars that cruise the grid and turn at intersections ---
export function spawnTraffic(scene, count, rand) {
  const cars = [];
  const lines = roadLines();
  for (let i = 0; i < count; i++) {
    const spec = CAR_NAMES[Math.floor(rand() * CAR_NAMES.length)];
    const mesh = makeCarMesh(spec.color, false);
    const alongX = rand() < 0.5;
    const road = lines[Math.floor(rand() * lines.length)];
    const lane = (rand() < 0.5 ? -2.6 : 2.6);
    const t = -WORLD_HALF + rand() * 2 * WORLD_HALF;
    const car = {
      mesh, isTraffic: true, name: spec.name, color: spec.color,
      speed: (7 + rand() * 4) * spec.speed,
      steer: 0,
      heading: alongX ? (rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rand() < 0.5 ? 0 : Math.PI),
      x: alongX ? t : road + lane,
      z: alongX ? road + lane : t,
      road, alongX, lane,
      wait: 0,
    };
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    scene.add(mesh);
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, world) {
  const lines = roadLines();
  for (const car of cars) {
    if (car.wait > 0) { car.wait -= dt; continue; }
    // slow down if a car is directly ahead (simple bumper logic)
    let blocked = false;
    for (const other of world.allCars) {
      if (other === car || other.isPlayer) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
      const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
      if (ahead > 0 && ahead < 9 && side < 2.2) { blocked = true; break; }
    }
    const targetSpeed = blocked ? 0 : car.speed;
    car.x += Math.sin(car.heading) * targetSpeed * dt;
    car.z += Math.cos(car.heading) * targetSpeed * dt;
    // at an intersection, sometimes turn onto the cross street
    const nearX = nearestRoadPoint(car.x, car.z);
    const onCross = Math.abs(car.x - Math.round(car.x / 40) * 40) < 0.6 || Math.abs(car.z - Math.round(car.z / 40) * 40) < 0.6;
    if (onCross && Math.random() < dt * 0.35) {
      const turn = Math.random();
      if (turn < 0.4) {
        // turn left or right onto the cross road
        const snap = nearestRoadPoint(car.x, car.z);
        car.heading = snap.alongX ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
        car.x = snap.x;
        car.z = snap.z;
      }
    }
    // wrap around the city edge instead of driving into the sea
    if (car.x > WORLD_HALF + 6 || car.x < -WORLD_HALF - 6 || car.z > WORLD_HALF + 6 || car.z < -WORLD_HALF - 6) {
      car.heading += Math.PI;
      car.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, car.x));
      car.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, car.z));
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels || []) w.rotation.x += targetSpeed * dt * 1.6;
  }
}

// parked cars the player can steal (placed near landmarks + lots)
export function spawnParkedCars(scene, spots) {
  const cars = [];
  for (const spot of spots) {
    const spec = CAR_NAMES[spot.model % CAR_NAMES.length];
    const mesh = makeCarMesh(spec.color, false);
    const car = {
      mesh, isParked: true, name: spec.name, color: spec.color,
      x: spot.x, z: spot.z, heading: spot.heading, speed: 0, steer: 0,
    };
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    cars.push(car);
  }
  return cars;
}
