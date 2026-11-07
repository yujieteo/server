// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import type { Run } from './types.ts';

const ESCAPABLE = '*_^{}\\';

export function closeBrace(str: string, open: number, limit: number = str.length): number {
  let depth = 1;
  for (let i = open + 1; i < limit; i++) {
    const c = str.charAt(i);
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface Frame {
  end: number;
  it: boolean;
  bd: boolean;
  shift: -1 | 0 | 1;
  color: string | undefined;
  resume: number;
}

interface Parse {
  str: string;
  i: number;
  buf: string;
  runs: Run[];
  stack: Frame[];
}

function top(P: Parse): Frame {
  const f = P.stack[P.stack.length - 1];
  if (f === undefined) throw new Error('empty parse stack');
  return f;
}

function flush(P: Parse): void {
  if (P.buf === '') return;
  let it = false;
  let bd = false;
  let shift: -1 | 0 | 1 = 0;
  let color: string | undefined;
  for (const f of P.stack) {
    if (f.it) it = !it;
    if (f.bd) bd = true;
    if (shift === 0) shift = f.shift;
  }
  for (let k = P.stack.length - 1; k >= 0; k--) {
    const f = P.stack[k];
    if (f?.color !== undefined) {
      color = f.color;
      break;
    }
  }
  P.runs.push({ br: false, t: P.buf, it, bd, shift, color });
  P.buf = '';
}

function enter(P: Parse, start: number, end: number, resume: number, shift: -1 | 0 | 1, color: string | undefined): void {
  flush(P);
  P.stack.push({ end, it: false, bd: false, shift, color, resume });
  P.i = start;
}

function charAt(P: Parse, k: number): string {
  return k < top(P).end ? P.str.charAt(k) : '';
}

function tryColor(P: Parse): boolean {
  const f = top(P);
  const bar = P.str.indexOf('|', P.i);
  const end = closeBrace(P.str, P.i, f.end);
  if (bar < 0 || bar >= f.end || end <= bar) return false;
  enter(P, bar + 1, end, end + 1, 0, P.str.slice(P.i + 1, bar));
  return true;
}

function scriptStart(P: Parse, shift: -1 | 1): void {
  const f = top(P);
  if (charAt(P, P.i + 1) === '{') {
    let j = closeBrace(P.str, P.i + 1, f.end);
    if (j < 0) j = f.end;
    enter(P, P.i + 2, j, j + 1, shift, undefined);
  } else enter(P, P.i + 1, P.i + 2, P.i + 2, shift, undefined);
}

function step(P: Parse): void {
  const f = top(P);
  const c = P.str.charAt(P.i);
  const next = charAt(P, P.i + 1);
  if (c === '\\' && next !== '' && ESCAPABLE.includes(next)) {
    P.buf += next;
    P.i += 2;
  } else if (c === '{' && next === '#' && tryColor(P)) return;
  else if (c === '*' && next === '*') {
    flush(P);
    f.bd = !f.bd;
    P.i += 2;
  } else if (c === '*') {
    flush(P);
    f.it = !f.it;
    P.i++;
  } else if ((c === '_' || c === '^') && P.i + 1 < f.end) {
    flush(P);
    scriptStart(P, c === '_' ? -1 : 1);
  } else if (c === '\n') {
    flush(P);
    P.runs.push({ br: true });
    P.i++;
  } else {
    P.buf += c;
    P.i++;
  }
}

export function parseRich(str: string): Run[] {
  const P: Parse = { str, i: 0, buf: '', runs: [], stack: [{ end: str.length, it: false, bd: false, shift: 0, color: undefined, resume: str.length }] };
  while (P.stack.length > 0) {
    if (P.i < top(P).end) step(P);
    else {
      flush(P);
      const done = P.stack.pop();
      if (done !== undefined && P.stack.length > 0) P.i = done.resume;
    }
  }
  return P.runs;
}
