// city.js — builds Solmar Bay: a sun-soaked coastal city on a road grid.
// Streets run every 40 units; blocks hold procedural low-poly buildings;
// the west edge is sand and open water. Every solid gets an AABB in
// world.colliders so players, cars and pedestrians stay out of walls.
// Static geometry is instanced (one draw call per kind) so the game
// stays playable even under software rendering.

import * as THREE from 'three';

// deterministic little RNG so the city looks the same every load
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_HALF = 200;      // playable city spans [-200, 200] on x/z
export const ROAD_SPACING = 40;
export const ROAD_WIDTH = 11;

export function roadLines() {
  const lines = [];
  for (let v = -WORLD_HALF; v <= WORLD_HALF; v += ROAD_SPACING) lines.push(v);
  return lines;
}

export function isOnRoad(x, z) {
  const lines = roadLines();
  for (const v of lines) {
    if (Math.abs(x - v) < ROAD_WIDTH / 2 + 1.5) return true;
    if (Math.abs(z - v) < ROAD_WIDTH / 2 + 1.5) return true;
  }
  return false;
}

// nearest point on the road grid (used to snap traffic / pedestrians)
export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bx = lines[0];
  let bz = lines[0];
  for (const v of lines) {
    if (Math.abs(v - x) < Math.abs(bx - x)) bx = v;
    if (Math.abs(v - z) < Math.abs(bz - z)) bz = v;
  }
  if (Math.abs(bx - x) < Math.abs(bz - z)) return { x: bx, z, alongX: false };
  return { x, z: bz, alongX: true };
}

const BUILDING_COLORS = [0xf2e3c6, 0xe8a87c, 0xd97971, 0x7fb5b5, 0xf6d365, 0xffffff, 0xc9d6df, 0xf0b429, 0x9db8d2, 0xe6b8a2];
const ROOF_COLORS = [0x8a5a3b, 0x5b7d8a, 0x3f5a6c, 0xb5654a];

// asphalt with a dashed centre line, drawn once into a texture so the
// roads need no per-dash meshes at all
function makeRoadTexture(horizontal) {
  const c = document.createElement('canvas');
  c.width = horizontal ? 256 : 64;
  c.height = horizontal ? 64 : 256;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#d8d2a0';
  if (horizontal) {
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 30, 18, 4);
  } else {
    for (let y = 0; y < 256; y += 32) g.fillRect(30, y, 4, 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// helper: fill an InstancedMesh from a list of {x,y,z, sx,sy,sz, color}
function buildInstanced(scene, geometry, material, items, useColor) {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    pos.set(it.x, it.y, it.z);
    scl.set(it.sx, it.sy, it.sz);
    q.setFromEuler(new THREE.Euler(it.rx || 0, it.ry || 0, it.rz || 0));
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    if (useColor) mesh.setColorAt(i, col.setHex(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

export function buildCity(scene, world) {
  const rand = mulberry32(20261117);
  world.colliders = [];
  world.landmarks = {};

  // --- ground: warm concrete city base ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // --- beach sand strip on the west edge, then open water ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 560),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-217, 0.02, 0);
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 560),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-304, -0.4, 0);
  scene.add(water);
  // a bright boardwalk line where sand meets the city
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.3, 440),
    new THREE.MeshLambertMaterial({ color: 0xc98f5a }),
  );
  boardwalk.position.set(-201, 0.12, 0);
  scene.add(boardwalk);

  // --- roads: asphalt strips with a baked dashed centre line ---
  const roadLen = 2 * WORLD_HALF + ROAD_WIDTH;
  const texH = makeRoadTexture(true);
  texH.repeat.set(roadLen / 32, 1);
  const texV = makeRoadTexture(false);
  texV.repeat.set(1, roadLen / 32);
  const roadMatH = new THREE.MeshLambertMaterial({ map: texH });
  const roadMatV = new THREE.MeshLambertMaterial({ map: texV });
  const lines = roadLines();
  for (const v of lines) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, ROAD_WIDTH), roadMatH);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.05, v);
    scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, roadLen), roadMatV);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(v, 0.05, 0);
    scene.add(rz);
  }

  // --- named landmark spots (defined FIRST so procedural buildings
  // never spawn in a landmark's block and block its approach) ---
  const LANDMARK_SPOTS = [
    { name: 'safehouse', x: -178, z: 140, w: 20, h: 9, d: 16, color: 0x2e8b8b, roof: 0x1d5c5c },
    { name: 'marina', x: -186, z: -100, w: 12, h: 6, d: 10, color: 0xff7f50, roof: 0xc0392b },
    { name: 'hotel', x: 160, z: -140, w: 26, h: 46, d: 22, color: 0xfdf6e3, roof: 0x2e7fa8 },
    { name: 'showroom', x: 20, z: -178, w: 30, h: 10, d: 18, color: 0x4a90d9, roof: 0x1d4e89 },
    { name: 'chopshop', x: -60, z: 178, w: 28, h: 9, d: 20, color: 0xa03d2d, roof: 0x5c2318 },
    { name: 'taxidepot', x: 140, z: 60, w: 22, h: 10, d: 18, color: 0xf2c14e, roof: 0xb8860b },
  ];

  // --- buildings: collected first, then drawn as two instanced meshes ---
  const bodies = [];
  const roofs = [];
  const windows = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let gx = -WORLD_HALF + ROAD_SPACING; gx < WORLD_HALF; gx += ROAD_SPACING) {
    for (let gz = -WORLD_HALF + ROAD_SPACING; gz < WORLD_HALF; gz += ROAD_SPACING) {
      const cx = gx - ROAD_SPACING / 2;
      const cz = gz - ROAD_SPACING / 2;
      // leave the central plaza and a few lots open (parking / parks)
      if (Math.abs(cx) < 5 && Math.abs(cz) < 5) continue;
      if (rand() < 0.12) continue; // open lot
      // never build in a landmark's block: the landmark must stand alone
      if (LANDMARK_SPOTS.some((lm) => Math.hypot(lm.x - cx, lm.z - cz) < 26)) continue;
      const count = rand() < 0.45 ? 2 : 1;
      for (let b = 0; b < count; b++) {
        const w = 12 + rand() * 12;
        const d = 12 + rand() * 12;
        const h = 8 + rand() * rand() * 34;
        const ox = count === 2 ? (b === 0 ? -7 : 7) : 0;
        const oz = count === 2 ? (b === 0 ? -7 : 7) : 0;
        const px = cx + ox * (rand() * 0.4);
        const pz = cz + oz * (rand() * 0.4);
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        bodies.push({ x: px, y: h / 2, z: pz, sx: w, sy: h, sz: d, color });
        roofs.push({ x: px, y: h + 0.4, z: pz, sx: w + 0.6, sy: 0.8, sz: d + 0.6, color: ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)] });
        if (h > 20) {
          for (let f = 0; f < 3; f++) {
            windows.push({ x: px, y: 6 + f * (h / 3.4), z: pz + d / 2 + 0.06, sx: w * 0.7, sy: 1.4, sz: 1, color: 0x2c4a63 });
          }
        }
        world.colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
      }
    }
  }
  buildInstanced(scene, boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), bodies, true);
  buildInstanced(scene, boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), roofs, true);
  buildInstanced(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), windows, true);

  // --- named landmarks (mission anchors, each a distinct colour/shape) ---
  function landmark(name, x, z, w, h, d, color, roofColor) {
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: roofColor }));
    roof.scale.set(w + 1, 1, d + 1);
    roof.position.set(x, h + 0.5, z);
    scene.add(roof);
    world.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    world.landmarks[name] = { x, z, w, d };
    return mesh;
  }
  // Safehouse: teal house near the beach, south-west
  for (const lm of LANDMARK_SPOTS) landmark(lm.name, lm.x, lm.z, lm.w, lm.h, lm.d, lm.color, lm.roof);

  // --- central plaza: palm garden + fountain at the city heart ---
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshLambertMaterial({ color: 0xb8c4a8 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.06, 0);
  scene.add(plaza);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 1.2, 16), new THREE.MeshLambertMaterial({ color: 0x7fb5d5 }));
  fountain.position.set(0, 0.6, 0);
  scene.add(fountain);
  world.colliders.push({ minX: -6, maxX: 6, minZ: -6, maxZ: 6 });

  // --- palm trees: instanced trunks + fronds ---
  const trunks = [];
  const fronds = [];
  function palm(x, z) {
    trunks.push({ x, y: 3.5, z, sx: 1, sy: 1, sz: 1, rz: (rand() - 0.5) * 0.15, color: 0x8a6a45 });
    fronds.push({ x, y: 8.2, z, sx: 1, sy: 1, sz: 1, color: 0x3d9b4f });
  }
  for (let z = -190; z <= 190; z += 24) palm(-208, z + (rand() - 0.5) * 8);
  for (let i = 0; i < 26; i++) {
    const x = -180 + rand() * 360;
    const z = -180 + rand() * 360;
    if (isOnRoad(x, z)) continue;
    palm(x, z);
  }
  buildInstanced(scene, new THREE.CylinderGeometry(0.35, 0.55, 7, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), trunks, true);
  buildInstanced(scene, new THREE.ConeGeometry(2.6, 4.5, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), fronds, true);

  // --- street lamps at intersections: instanced poles + glowing bulbs ---
  const poles = [];
  const bulbs = [];
  for (const vx of lines) {
    for (const vz of lines) {
      if (rand() < 0.5) continue;
      poles.push({ x: vx + 6.5, y: 3, z: vz + 6.5, sx: 1, sy: 1, sz: 1, color: 0x2f333a });
      bulbs.push({ x: vx + 6.5, y: 6.2, z: vz + 6.5, sx: 1, sy: 1, sz: 1, color: 0xffe9a8 });
    }
  }
  buildInstanced(scene, new THREE.CylinderGeometry(0.15, 0.15, 6, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), poles, true);
  buildInstanced(scene, new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffc861 }), bulbs, true);

  // --- sun coins: golden collectibles floating above the streets ---
  world.coinSpots = [];
  const coinGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.25, 16);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0xa67c00 });
  for (let i = 0; i < 12; i++) {
    const x = -180 + rand() * 360;
    const z = -180 + rand() * 360;
    const snap = nearestRoadPoint(x, z);
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(snap.x, 1.6, snap.z);
    mesh.userData.spin = rand() * Math.PI * 2;
    scene.add(mesh);
    world.coinSpots.push({ x: snap.x, z: snap.z, mesh, taken: false });
  }

  // --- sky: warm sunset gradient handled by scene fog + background ---
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xffc98a, 220, 480);
}
