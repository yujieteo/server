import { assert, lineOf } from "./lib.ts";
import { type Comment, endOfLine, HASH_WORD_START } from "./scan.ts";

interface ShellFrame {
  kind: "scan" | "double" | "braces";
  closing: boolean;
  depth: number;
}

interface Heredoc {
  readonly word: string;
  readonly stripTabs: boolean;
}

export class ShellScanner {
  public readonly found: Comment[] = [];
  private readonly pending: Heredoc[] = [];
  private readonly stack: ShellFrame[] = [{ kind: "scan", closing: false, depth: 0 }];
  private pos = 0;

  private readonly text: string;

  public constructor(text: string) {
    this.text = text;
    assert(text.length >= 0, "a text has a length");
    assert(this.stack.length === 1, "the scan starts in the top frame");
  }

  public scan(): readonly Comment[] {
    assert(this.pos === 0, "a scan starts at the start");
    assert(this.found.length === 0, "a scan starts with no comment");
    while (this.pos < this.text.length) {
      const frame = this.stack.at(-1);
      if (frame === undefined) break;
      if (frame.kind === "scan") this.stepScan();
      else if (frame.kind === "double") this.stepDouble();
      else this.stepBraces();
    }
    assert(this.pos >= this.text.length, "the whole text was read");
    return this.found;
  }

  private skipTo(mark: string): void {
    assert(mark.length === 1, "a mark is one character");
    assert(mark === "'" || mark === "`", "a mark is a quote");
    assert(this.pos < this.text.length, "a quote starts inside the text");
    const close = this.text.indexOf(mark, this.pos + 1);
    this.pos = close === -1 ? this.text.length : close + 1;
  }

  private readHeredocs(): void {
    assert(this.pos <= this.text.length, "the position is inside the text");
    for (let next = this.pending.shift(); next !== undefined; next = this.pending.shift()) {
      while (this.pos < this.text.length) {
        const end = endOfLine(this.text, this.pos);
        const raw = this.text.slice(this.pos, end);
        this.pos = Math.min(end + 1, this.text.length);
        if ((next.stripTabs ? raw.replace(/^\t+/, "") : raw) === next.word) break;
      }
    }
    assert(this.pending.length === 0, "every here document was read");
  }

  private top(kind: ShellFrame["kind"]): ShellFrame {
    const frame = this.stack.at(-1);
    assert(frame !== undefined, "the stack has a frame");
    assert(frame.kind === kind, "the frame is of the kind that steps");
    return frame;
  }

  private stepBraces(): void {
    const frame = this.top("braces");
    assert(Number.isInteger(frame.depth), "the depth is a whole number");
    const c = this.text[this.pos];
    if (c === "\\") this.pos += 2;
    else if (c === "'") this.skipTo("'");
    else if (c === '"') {
      this.pos += 1;
      this.stack.push({ kind: "double", closing: false, depth: 0 });
    } else {
      if (c === "{") frame.depth += 1;
      if (c === "}") frame.depth -= 1;
      this.pos += 1;
      if (frame.depth === 0) this.stack.pop();
    }
  }

  private openSubstitution(): boolean {
    assert(this.pos < this.text.length, "the position is inside the text");
    assert(this.text[this.pos] === "$", "a substitution starts with a dollar");
    if (this.text[this.pos + 1] === "(") {
      this.pos += 2;
      this.stack.push({ kind: "scan", closing: true, depth: 0 });
      return true;
    }
    if (this.text[this.pos + 1] === "{") {
      this.pos += 1;
      this.stack.push({ kind: "braces", closing: false, depth: 0 });
      return true;
    }
    return false;
  }

  private stepDouble(): void {
    assert(this.stack.at(-1)?.kind === "double", "a double-quote frame");
    assert(this.pos < this.text.length, "the position is inside the text");
    const c = this.text[this.pos];
    if (c === "\\") this.pos += 2;
    else if (c === '"') {
      this.pos += 1;
      this.stack.pop();
    } else if (c === "$") {
      if (!this.openSubstitution()) this.pos += 1;
    } else if (c === "`") this.skipTo("`");
    else this.pos += 1;
  }

  private stepHeredocStart(): void {
    assert(this.text.startsWith("<<", this.pos), "a here document starts with <<");
    assert(this.pos < this.text.length, "the position is inside the text");
    const heredoc = /^<<(-?)[ \t]*(["']?)([A-Za-z_][A-Za-z_0-9]*)\2/.exec(this.text.slice(this.pos, this.pos + 80));
    if (heredoc === null) this.pos += 2;
    else {
      this.pending.push({ word: heredoc[3] ?? "", stripTabs: heredoc[1] === "-" });
      this.pos += heredoc[0].length;
    }
  }

  private stepHash(): void {
    assert(this.text[this.pos] === "#", "a comment starts with a hash");
    assert(this.pos < this.text.length, "the position is inside the text");
    const end = endOfLine(this.text, this.pos);
    this.found.push({ line: lineOf(this.text, this.pos), text: this.text.slice(this.pos, end) });
    this.pos = end;
  }

  private stepParen(c: string): void {
    assert(c === "(" || c === ")", "a parenthesis");
    const frame = this.top("scan");
    assert(Number.isInteger(frame.depth), "the depth is a whole number");
    this.pos += 1;
    if (c === "(") frame.depth += 1;
    else if (frame.depth === 0 && frame.closing) this.stack.pop();
    else frame.depth -= 1;
  }

  private stepQuoted(c: string): boolean {
    assert(c.length <= 1, "one character");
    assert(this.pos < this.text.length, "the position is inside the text");
    if (c === "\\") this.pos += 2;
    else if (c === "'") this.skipTo("'");
    else if (c === '"') {
      this.pos += 1;
      this.stack.push({ kind: "double", closing: false, depth: 0 });
    } else if (c === "`") this.skipTo("`");
    else if (c === "$") {
      if (!this.openSubstitution()) this.pos += 1;
    } else return false;
    return true;
  }

  private stepScan(): void {
    assert(this.top("scan").kind === "scan", "a scan frame");
    assert(this.pos < this.text.length, "the position is inside the text");
    const c = this.text[this.pos] ?? "";
    if (this.stepQuoted(c)) return;
    const before = this.pos === 0 ? "\n" : (this.text[this.pos - 1] ?? "");
    const after = this.text[this.pos + 2];
    if (c === "<" && this.text[this.pos + 1] === "<" && after !== "<" && after !== "=") this.stepHeredocStart();
    else if (c === "#" && HASH_WORD_START.has(before)) this.stepHash();
    else if (c === "\n") {
      this.pos += 1;
      this.readHeredocs();
    } else if (c === "(" || c === ")") this.stepParen(c);
    else this.pos += 1;
  }
}
