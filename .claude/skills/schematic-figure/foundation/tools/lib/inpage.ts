import { exportSvg, makeTransparent } from './inpage-common.ts';
import { stackImages } from './inpage-view.ts';
import { compareShot, compareStats } from './inpage-compare.ts';
import { diffImages } from './inpage-revdiff.ts';
import { pixelChecks } from './inpage-check.ts';
import { leaderCheck, styleProbe } from './inpage-leaders.ts';
import { patentChecks } from './inpage-patent.ts';

declare global {
  interface Window {
    schemTools?: object;
  }
}

window.schemTools = { exportSvg, makeTransparent, stackImages, compareShot, compareStats, diffImages, pixelChecks, leaderCheck, styleProbe, patentChecks };
