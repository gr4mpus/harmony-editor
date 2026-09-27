/**
 * The analysis pipeline that runs when a photo is opened:
 * people → protection → sky → greenery → colours → harmony.
 * It has no React in it, so it can be reused or tested on its own.
 */
import type { ColourCluster, HarmonyResult, PeopleDetection, Protection, Region, WorkImage } from '../types';
import { analyseColours } from './colourAnalysis';
import { classifyHarmony } from './harmony';
import type { PeopleModels } from './models';
import { detectGreenery, detectSky } from './nature';
import { buildProtection, detectPeople, type ProtectionOptions } from './people';

export interface Analysis {
  people: PeopleDetection;
  protection: Protection;
  sky: Region | null;
  greenery: Region | null;
  clusters: ColourCluster[];
  harmony: HarmonyResult;
  /** True when the AI person model was used. */
  aiPeople: boolean;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 16));

export async function analysePhoto(
  work: WorkImage,
  models: PeopleModels | null,
  opts: ProtectionOptions,
  onStep: (message: string) => void = () => {},
): Promise<Analysis> {
  const N = work.width * work.height;

  onStep('Finding people…');
  await nextFrame();
  const people = detectPeople(work, models);

  onStep('Finding sky and greenery…');
  await nextFrame();
  let protection: Protection, sky: Region | null;
  if (people.categories) {
    protection = buildProtection(work, people, opts);
    sky = detectSky(work, protection.person);
  } else {
    // Skin-tone fallback: find the sky first so sunset oranges aren't mistaken for skin
    sky = detectSky(work, new Float32Array(N));
    if (sky && people.skin) for (let i = 0; i < N; i++) if (sky.mask[i] > 0.02) people.skin[i] = 0;
    protection = buildProtection(work, people, opts);
    if (sky) for (let i = 0; i < N; i++) sky.mask[i] *= 1 - protection.person[i];
  }
  const greenery = detectGreenery(work, protection.person, sky);

  onStep('Reading colours…');
  await nextFrame();
  const clusters = analyseColours(work, protection.protect);
  return { people, protection, sky, greenery, clusters, harmony: classifyHarmony(clusters), aiPeople: !!people.categories };
}
