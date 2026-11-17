// missions.js — Solmar Bay's story: three missions from the fixer Marisol,
// plus taxi fares as a side hustle. Each mission has steps with a world
// beacon + minimap marker, a briefing dialogue, and a cash reward.

import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'delivery',
    name: 'First Delivery',
    giver: 'MARISOL (fixer)',
    brief: 'A sealed parcel waits at the marina kiosk. Pick it up and bring it to the Hotel Solmar. No questions, no shortcuts through the plaza fountain.',
    reward: 150,
    steps: [
      { id: 'pickup', text: 'Pick up the parcel at the marina kiosk', target: 'marina', action: 'pickup' },
      { id: 'deliver', text: 'Deliver the parcel to Hotel Solmar', target: 'hotel', action: 'deliver' },
    ],
  },
  {
    id: 'borrowed',
    name: 'Borrowed Wheels',
    giver: 'MARISOL (fixer)',
    brief: 'A client wants the gold Vela GT from the Vela Motors showroom — tonight. "Borrow" it, shake the heat if the cops notice, and park it at the chop shop on the south side.',
    reward: 300,
    steps: [
      { id: 'steal', text: 'Steal the gold Vela GT at the showroom', target: 'showroom', action: 'steal' },
      { id: 'deliver', text: 'Deliver the Vela GT to the chop shop', target: 'chopshop', action: 'deliver' },
    ],
  },
  {
    id: 'getaway',
    name: 'Bayfront Getaway',
    giver: 'MARISOL (fixer)',
    brief: 'The job went loud. The whole Solmar Bay Police is on you — three stars and climbing. Survive the chase for 60 seconds, then slip to the safehouse by the beach. Do not get busted.',
    reward: 500,
    steps: [
      { id: 'survive', text: 'Survive the police chase — 60 seconds', target: null, action: 'survive', seconds: 60 },
      { id: 'escape', text: 'Escape to the safehouse by the beach', target: 'safehouse', action: 'deliver' },
    ],
  },
];

export function createMissionState() {
  return {
    activeIndex: -1,      // -1 = free roam
    stepIndex: 0,
    timer: 0,
    beacon: null,
    markerPos: null,      // {x, z} for minimap + HUD distance
    parcel: false,
    taxi: null,           // active fare {pickup:{x,z}, drop:{x,z}, fare, state}
    fareCooldown: 0,
  };
}

// glowing beacon cylinder + pulsing ring at the current objective
export function makeBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 21;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.28, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd700 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.userData.ring = ring;
  group.visible = false;
  scene.add(group);
  return group;
}

export function startMission(world, index) {
  const m = world.missions;
  const def = MISSIONS[index];
  m.activeIndex = index;
  m.stepIndex = 0;
  m.timer = 0;
  m.parcel = false;
  world.hud.setObjective(def.name, def.steps[0].text, null);
  world.dialogue(def.giver, def.brief);
  world.audio.missionStart();
  world.toast(`MISSION: ${def.name} — $${def.reward}`);
  applyStep(world);
  if (index === 2) {
    // getaway starts hot: the police are already coming
    world.police.heat = 55;
    world.police.lastCrimeAt = world.time;
  }
}

export function applyStep(world) {
  const m = world.missions;
  const def = MISSIONS[m.activeIndex];
  if (!def) { m.markerPos = null; m.beacon.visible = false; return; }
  const step = def.steps[m.stepIndex];
  if (!step) return;
  if (step.target) {
    const lm = world.landmarks[step.target];
    m.markerPos = { x: lm.x, z: lm.z };
    m.beacon.position.set(lm.x, 0, lm.z);
    m.beacon.visible = true;
  } else {
    m.markerPos = null;
    m.beacon.visible = false;
  }
  world.hud.setObjective(def.name, step.text, m.markerPos);
}

export function completeMission(world) {
  const m = world.missions;
  const def = MISSIONS[m.activeIndex];
  world.cash += def.reward;
  world.totalEarned += def.reward;
  if (!world.missionsDone.includes(def.id)) world.missionsDone.push(def.id);
  world.toast(`MISSION COMPLETE: ${def.name}  +$${def.reward}`);
  world.audio.missionDone();
  world.dialogue('MARISOL (fixer)', missionCompleteLine(def.id));
  m.activeIndex = -1;
  m.stepIndex = 0;
  m.markerPos = null;
  m.beacon.visible = false;
  world.hud.setObjective('FREE ROAM', 'Explore Solmar Bay — press 1, 2 or 3 to start a story mission', null);
  world.save();
}

function missionCompleteLine(id) {
  if (id === 'delivery') return 'Clean run, Dario. The client is happy, and happy clients pay. There is more work where that came from.';
  if (id === 'borrowed') return 'The Vela GT is already on a truck out of town. You drive like you stole it — because you did. One more job, the big one.';
  return 'You slipped them. Three stars and you walked away clean. Solmar Bay is yours now, Dario. Spend it well.';
}

export function advanceStep(world) {
  const m = world.missions;
  const def = MISSIONS[m.activeIndex];
  m.stepIndex += 1;
  if (m.stepIndex >= def.steps.length) {
    completeMission(world);
  } else {
    applyStep(world);
    world.audio.pickup();
  }
}

// called every frame while a mission is active
export function updateMissions(world, dt) {
  const m = world.missions;
  if (m.activeIndex < 0) return;
  const def = MISSIONS[m.activeIndex];
  const step = def.steps[m.stepIndex];
  if (!step) return;
  const px = world.playerCar ? world.playerCar.x : world.player.x;
  const pz = world.playerCar ? world.playerCar.z : world.player.z;

  if (step.action === 'survive') {
    m.timer += dt;
    const left = Math.max(0, Math.ceil(step.seconds - m.timer));
    world.hud.setObjective(def.name, `Survive the chase — ${left}s left`, null);
    if (m.timer >= step.seconds) advanceStep(world);
    return;
  }
  if (!step.target) return;
  const lm = world.landmarks[step.target];
  const dist = Math.hypot(lm.x - px, lm.z - pz);
  world.hud.setObjective(def.name, step.text, m.markerPos, dist);
  if (dist < 7) {
    if (step.action === 'pickup') {
      m.parcel = true;
      world.toast('Parcel secured. Get it to the hotel.');
      world.audio.pickup();
      advanceStep(world);
    } else if (step.action === 'deliver') {
      if (step.id === 'deliver' && def.id === 'borrowed' && !world.playerCar) {
        world.toast('You need the Vela GT to finish this job.');
        return;
      }
      advanceStep(world);
    } else if (step.action === 'steal') {
      // stealing is handled by entering the gold car; just wait
    }
  }
}

// --- taxi fares: pick up a waiting pedestrian, drive them to a marker ---
export function updateTaxi(world, dt) {
  const m = world.missions;
  m.fareCooldown -= dt;
  // fares are a free-roam hustle: never interrupt a story mission
  if (m.activeIndex >= 0 && !m.taxi) return;
  if (!m.taxi && m.fareCooldown <= 0 && world.playerCar && Math.random() < dt * 0.02) {
    // a fare appears: a pedestrian flags you down nearby
    const px = world.playerCar.x;
    const pz = world.playerCar.z;
    const ang = Math.random() * Math.PI * 2;
    const d = 25 + Math.random() * 20;
    const lm = world.landmarks;
    const dests = [lm.hotel, lm.marina, lm.safehouse, lm.showroom, lm.taxidepot];
    const dest = dests[Math.floor(Math.random() * dests.length)];
    m.taxi = {
      pickup: { x: px + Math.sin(ang) * d, z: pz + Math.cos(ang) * d },
      drop: { x: dest.x, z: dest.z },
      fare: 40 + Math.floor(Math.random() * 5) * 10,
      state: 'pickup',
    };
    world.toast(`TAXI FARE: pick up a rider nearby — $${m.taxi.fare}`);
    world.audio.pickup();
  }
  if (!m.taxi) return;
  const fare = m.taxi;
  const px = world.playerCar ? world.playerCar.x : world.player.x;
  const pz = world.playerCar ? world.playerCar.z : world.player.z;
  const target = fare.state === 'pickup' ? fare.pickup : fare.drop;
  const dist = Math.hypot(target.x - px, target.z - pz);
  if (fare.state === 'pickup') {
    world.hud.setObjective('TAXI FARE', `Pick up the rider — $${fare.fare}`, fare.pickup, dist);
    m.markerPos = fare.pickup;
    m.beacon.position.set(fare.pickup.x, 0, fare.pickup.z);
    m.beacon.visible = true;
    if (dist < 6) {
      fare.state = 'drop';
      world.toast('Rider aboard. Take them to the marker.');
      world.audio.pickup();
    }
  } else {
    world.hud.setObjective('TAXI FARE', `Drop off the rider — $${fare.fare}`, fare.drop, dist);
    m.markerPos = fare.drop;
    m.beacon.position.set(fare.drop.x, 0, fare.drop.z);
    m.beacon.visible = true;
    if (dist < 6 && world.playerCar) {
      world.cash += fare.fare;
      world.totalEarned += fare.fare;
      world.faresDone += 1;
      world.toast(`FARE PAID +$${fare.fare}`);
      world.audio.missionDone();
      m.taxi = null;
      m.markerPos = null;
      m.beacon.visible = false;
      m.fareCooldown = 20;
      world.hud.setObjective('FREE ROAM', 'Explore Solmar Bay', null);
      world.save();
    }
  }
}
