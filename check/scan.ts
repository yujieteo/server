import { assert } from "./lib.ts";

export interface Comment {
  readonly line: number;
  readonly text: string;
}

export const HASH_WORD_START = new Set([" ", "\t", "\n", ";", "|", "&", "("]);
const NEWLINE = "\n";

export function endOfLine(text: string, from: number): number {
  assert(from >= 0, "a position is not negative");
  assert(from <= text.length, "a position is inside the text");
  const end = text.indexOf(NEWLINE, from);
  assert(end === -1 || end >= from, "a line ends at or after its start");
  assert(NEWLINE.length === 1, "a newline is one character");
  return end === -1 ? text.length : end;
}

