// Solmar Bay — a 3D open-world crime game for make.fun bounty gta6-01.
// Node 22, standard library only. This program hands the entry in: it
// copies this repository's game/ and screenshots/ folders into the
// output directory (or $MAKEFUN_OUTPUT_DIR outside the grader) and
// writes /output/dossier.json with the vendored make.fun library, which
// summarises the game for the judge. Run it like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's caps for this bounty: the dossier text stays under its
// byte budget, screenshots are at most 4 and 256 KiB each, and game/
// stays under 993 entries / 48 MiB with no path over 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
