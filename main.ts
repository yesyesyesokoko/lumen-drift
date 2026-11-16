// Lumen Drift — entrypoint for make.fun best-game-01.
//
// This program hands the game in: it copies the static game files and
// the screenshots from beside this file into the output directory and
// writes dossier.json there with the vendored make.fun library, so the
// scorer can check the entry and the judge can read its summary.
//
// It runs on Node 22 with the standard library only, in a container
// with no network. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output is deterministic: copying files and building the dossier
// from the same inputs always writes the same bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

function outDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  return fromEnv && fromEnv.length > 0 ? fromEnv : '/output';
}

function copyIfPresent(src: string, dest: string): void {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

function main(): void {
  const out = outDir();
  mkdirSync(out, { recursive: true });

  // The playable game, plain static files under game/.
  copyIfPresent(join(repoRoot, 'game'), join(out, 'game'));

  // Real renders of the game; the first by name is the cover.
  // The dossier step reads this directory, so it must exist even
  // when a run has no screenshots yet.
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  copyIfPresent(join(repoRoot, 'screenshots'), join(out, 'screenshots'));

  // The dossier the scorer and the judge read. Its caps are the
  // bounty gate's: text budget, screenshot count and size, and the
  // game tree's file count, total bytes and longest path.
  const dossier = buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000
  });
  writeFileSync(join(out, 'dossier.json'), dossier);
}

main();
