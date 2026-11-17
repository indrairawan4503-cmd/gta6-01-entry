# gta6-01-entry

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/indrairawan4503-cmd/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/indrairawan4503-cmd/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is a 3D open-world crime game in a sun-soaked coastal city: explore on foot or by car, steal cars, outrun the Solmar Bay Police under a 5-star wanted system, run three story missions for the fixer Marisol, take taxi fares, hunt sun coins, and build your fortune — all rendered live in Three.js with a HUD, minimap, synthesized sound and a localStorage save.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — or build the dossier with `MAKEFUN_OUTPUT_DIR=out node main.ts`.

## What it does

- **Open world:** a procedural coastal city on a road grid — pastel towers, palm-lined beach, marina, hotel, showroom, chop shop, central plaza — built in Three.js with a warm sunset sky.
- **On foot + driving:** third-person character with sprint and jump; arcade car physics with boost, handbrake drift and a chase camera.
- **Traffic + pedestrians:** cars cruise the grid and turn at intersections; pedestrians wander the sidewalks and flee from gunfire and speeding cars.
- **Steal cars:** press E near any parked or traffic car (even a police cruiser) — stealing raises your wanted level.
- **Wanted system:** 0–5 stars. Police cars chase and ram you; foot cops run you down. Lose the heat by staying clean, or get busted / wasted and pay the price.
- **Missions + story:** three missions from the fixer Marisol — a parcel delivery, stealing the gold Vela GT, and a 60-second Bayfront Getaway — with briefing dialogue, beacon + minimap objective markers, and cash rewards. Plus taxi fares and 12 collectible sun coins.
- **Combat:** pistol with muzzle flash and tracer (F), health, busted/wasted game-over flow.
- **HUD + minimap:** cash, health, wanted stars, mission objective with distance, speedometer, and a live circular minimap showing roads, traffic, police and the objective marker.
- **Sound:** fully synthesized WebAudio — engine hum, police siren, gunshots, pickups, mission jingles. No audio files. M toggles mute.
- **Save:** cash, mission progress, coins and fares persist in localStorage; Continue on the start screen.

## Controls

WASD / arrows — walk / drive · mouse drag — look around · E — enter / steal car · F — shoot (on foot) · SHIFT — sprint / boost · SPACE — handbrake / jump · 1 / 2 / 3 — start a story mission · R — restart mission · H — help · M — mute · ESC — pause.

---

<sub>Entered on [make.fun](https://make.fun/?ref=8dxq9bq0&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
