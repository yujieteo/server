import { asArray, asBool, asNumber, asString, field } from './guards.ts';
import type { Box } from './manifest.ts';

export interface TextBox {
  s: string;
  halo: boolean;
  rotate: number;
  box: Box;
}

export interface PanelBox extends Box {
  label: string | null;
}

export interface PixelArg {
  W: number;
  H: number;
  texts: TextBox[];
  panels: PanelBox[];
}

export type Hole = [string, number, number];

export interface PixelResult {
  busy: [string, number][];
  ink: number;
  holes: Hole[];
}

export interface StyleProbe {
  parts: string[];
  illustrate: boolean;
  own: (string | null)[];
}

export interface LeaderFinding {
  kind: string;
  leader: string;
  what: string;
  x: number;
  y: number;
}

export interface LeaderResult {
  found: LeaderFinding[];
  nLines: number;
  err: string | null;
}

export interface PatentArg {
  W: number;
  H: number;
  sight: Box;
  texts: TextBox[];
}

export interface PatentBad {
  colour: string[];
  grey: string[];
  server: string[];
  opacity: string[];
  filter: string[];
  image: string[];
  blackArea: string[];
}

export interface PatentResult {
  bad: PatentBad;
  cross: string[];
  enclosed: string[];
  outN: number;
  ob: number[];
  ib: number[];
  under: [string, number][];
}

export function parseStrings(v: unknown): string[] {
  const out: string[] = [];
  for (const x of asArray(v)) out.push(asString(x));
  return out;
}

export function parseNumbers(v: unknown): number[] {
  const out: number[] = [];
  for (const x of asArray(v)) out.push(asNumber(x));
  return out;
}

function parsePairs(v: unknown): [string, number][] {
  const out: [string, number][] = [];
  for (const x of asArray(v)) {
    const p = asArray(x);
    out.push([asString(p[0]), asNumber(p[1])]);
  }
  return out;
}

function parseHoles(v: unknown): Hole[] {
  const out: Hole[] = [];
  for (const x of asArray(v)) {
    const p = asArray(x);
    out.push([asString(p[0]), asNumber(p[1]), asNumber(p[2])]);
  }
  return out;
}

export function parsePixelResult(v: unknown): PixelResult {
  return { busy: parsePairs(field(v, 'busy')), ink: asNumber(field(v, 'ink')), holes: parseHoles(field(v, 'holes')) };
}

export function parseStyleProbe(v: unknown): StyleProbe {
  const own: (string | null)[] = [];
  for (const x of asArray(field(v, 'own'))) own.push(typeof x === 'string' ? x : null);
  return { parts: parseStrings(field(v, 'parts')), illustrate: asBool(field(v, 'illustrate')), own };
}

function parseFinding(v: unknown): LeaderFinding {
  return {
    kind: asString(field(v, 'kind')), leader: asString(field(v, 'leader')), what: asString(field(v, 'what')),
    x: asNumber(field(v, 'x')), y: asNumber(field(v, 'y')),
  };
}

export function parseLeaderResult(v: unknown): LeaderResult {
  const err = field(v, 'err');
  if (typeof err === 'string') return { found: [], nLines: 0, err };
  const found: LeaderFinding[] = [];
  for (const x of asArray(field(v, 'found'))) found.push(parseFinding(x));
  return { found, nLines: asNumber(field(v, 'nLines')), err: null };
}

function parseBad(v: unknown): PatentBad {
  return {
    colour: parseStrings(field(v, 'colour')), grey: parseStrings(field(v, 'grey')), server: parseStrings(field(v, 'server')),
    opacity: parseStrings(field(v, 'opacity')), filter: parseStrings(field(v, 'filter')), image: parseStrings(field(v, 'image')),
    blackArea: parseStrings(field(v, 'blackArea')),
  };
}

export function parsePatentResult(v: unknown): PatentResult {
  return {
    bad: parseBad(field(v, 'bad')), cross: parseStrings(field(v, 'cross')), enclosed: parseStrings(field(v, 'enclosed')),
    outN: asNumber(field(v, 'outN')), ob: parseNumbers(field(v, 'ob')), ib: parseNumbers(field(v, 'ib')),
    under: parsePairs(field(v, 'under')),
  };
}
