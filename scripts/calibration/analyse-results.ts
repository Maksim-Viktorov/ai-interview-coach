/**
 * Reads `scripts/calibration/results.json` (from `npm run calibrate`) and prints
 * distribution stats plus good-vs-weak separation scores.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { DeepgramAnalytics } from '@/lib/deepgram-analytics';

const RESULTS_PATH = join(process.cwd(), 'scripts/calibration/results.json');

type QualityLabel = 'good' | 'weak' | 'mediocre' | 'unlabeled';

type ResultRow =
  | ({
      file: string;
      quality: QualityLabel;
      durationSeconds: number;
    } & DeepgramAnalytics)
  | { file: string; quality: QualityLabel; error: string };

function flattenAnalytics(analytics: DeepgramAnalytics): Record<string, number> {
  const out: Record<string, number> = {};

  function walk(value: unknown, path: string) {
    if (value === null || value === undefined) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (path) {
        out[path] = value;
      }
      return;
    }
    if (Array.isArray(value)) {
      if (path === 'utterances') {
        return;
      }
      if (value.length === 0) {
        return;
      }
      const allNums = value.every(
        (x) => typeof x === 'number' && Number.isFinite(x as number),
      );
      const allPlainObjects =
        !allNums &&
        value.every(
          (x) =>
            x !== null &&
            typeof x === 'object' &&
            !Array.isArray(x),
        );
      if ((allNums || allPlainObjects) && path) {
        out[`${path}Count`] = value.length;
      }
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === 'utterances') {
          continue;
        }
        const next = path ? `${path}.${k}` : k;
        walk(v, next);
      }
    }
  }

  walk(analytics, '');
  return out;
}

function sortedCopy(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  let s = 0;
  for (const n of nums) {
    s += n;
  }
  return s / nums.length;
}

function populationStdDev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const m = mean(nums);
  let sq = 0;
  for (const n of nums) {
    const d = n - m;
    sq += d * d;
  }
  return Math.sqrt(sq / nums.length);
}

function stats(nums: number[]) {
  const sorted = sortedCopy(nums);
  const n = nums.length;
  return {
    n,
    mean: mean(nums),
    median: quantile(sorted, 0.5),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

function separationScore(good: number[], weak: number[]): number {
  if (good.length < 2 || weak.length < 2) {
    return 0;
  }
  const mG = mean(good);
  const mW = mean(weak);
  const sg = populationStdDev(good);
  const sw = populationStdDev(weak);
  const denom = Math.sqrt((sg * sg + sw * sw) / 2);
  if (!Number.isFinite(denom) || denom === 0) {
    return 0;
  }
  return Math.abs(mG - mW) / denom;
}

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function main() {
  const raw = readFileSync(RESULTS_PATH, 'utf8');
  const rows = JSON.parse(raw) as ResultRow[];

  const ok = rows.filter(
    (r): r is Exclude<ResultRow, { error: string }> => !('error' in r),
  );

  const byQuality: Record<QualityLabel, Record<string, number>[]> = {
    good: [],
    weak: [],
    mediocre: [],
    unlabeled: [],
  };

  for (const r of ok) {
    const { file: _f, quality: _q, durationSeconds: _d, ...analytics } = r;
    const flat = flattenAnalytics(analytics as DeepgramAnalytics);
    byQuality[r.quality].push(flat);
  }

  const allKeys = new Set<string>();
  for (const q of Object.values(byQuality)) {
    for (const rec of q) {
      for (const k of Object.keys(rec)) {
        allKeys.add(k);
      }
    }
  }

  const sortedKeys = [...allKeys].sort();

  console.log('=== Distribution per metric ===\n');

  const separations: { key: string; value: number }[] = [];

  for (const key of sortedKeys) {
    console.log(key);

    for (const label of ['good', 'weak', 'mediocre', 'unlabeled'] as const) {
      const vals = byQuality[label]
        .map((rec) => rec[key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (vals.length === 0) {
        continue;
      }
      const st = stats(vals);
      console.log(
        `  ${label.padEnd(10)} (n=${st.n}):  mean=${fmt(st.mean)}  median=${fmt(st.median, 0)}  range=${fmt(st.min, 0)}-${fmt(st.max, 0)}   p25=${fmt(st.p25, 0)} p75=${fmt(st.p75, 0)}`,
      );
    }

    const goodVals = byQuality.good
      .map((rec) => rec[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const weakVals = byQuality.weak
      .map((rec) => rec[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const sep = separationScore(goodVals, weakVals);
    separations.push({ key, value: sep });
    if (goodVals.length >= 2 && weakVals.length >= 2) {
      console.log(`  separation: ${fmt(sep)}`);
    }
    console.log('');
  }

  const ranked = separations
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  console.log('=== Top discriminators (sorted by separation) ===\n');

  ranked.forEach((s, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${s.key.padEnd(45)} ${fmt(s.value)}`);
  });

  if (ranked.length === 0) {
    console.log(
      '(No separation scores — need at least 2 good and 2 weak samples without errors.)',
    );
  }
}

main();
