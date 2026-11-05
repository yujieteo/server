import { assert, lineOf } from "./lib.ts";
import { type Comment, endOfLine } from "./scan.ts";

const REGEX_PREFIX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export class CLikeScanner {
  public readonly found: Comment[] = [];
  private pos = 0;
  private previous = "";
  private readonly templateDepth: number[] = [];
  private braceDepth = 0;

  private readonly text: string;

  public constructor(text: string) {
    this.text = text;
    assert(text.length >= 0, "a text has a length");
    assert(this.braceDepth === 0, "the scan starts outside braces");
  }

  public scan(): readonly Comment[] {
    assert(this.pos === 0, "a scan starts at the start");
    assert(this.found.length === 0, "a scan starts with no comment");
    while (this.pos < this.text.length) {
      const c = this.text[this.pos] ?? "";
      const next = this.text[this.pos + 1];
      if (c === "/" && (next === "/" || next === "*")) this.stepComment(next);
      else if (c === '"' || c === "'") this.stepString(c);
      else if (c === "`") {
        this.pos += 1;
        this.scanTemplate();
        this.previous = "`";
      } else if (c === "/" && (this.previous === "" || REGEX_PREFIX.has(this.previous))) this.stepRegex();
      else this.stepOther(c);
    }
    assert(this.pos >= this.text.length, "the whole text was read");
    return this.found;
  }

  private scanTemplate(): void {
    assert(this.pos >= 0, "the position is not negative");
    assert(Number.isInteger(this.braceDepth), "the depth is a count");
    assert(this.templateDepth.length >= 0, "the templates are a stack");
    while (this.pos < this.text.length) {
      const c = this.text[this.pos];
      if (c === "\\") this.pos += 2;
      else if (c === "`") {
        this.pos += 1;
        return;
      } else if (c === "$" && this.text[this.pos + 1] === "{") {
        this.pos += 2;
        this.templateDepth.push(this.braceDepth);
        this.braceDepth += 1;
        return;
      } else this.pos += 1;
    }
  }

  private stepComment(kind: string | undefined): void {
    assert(kind === "/" || kind === "*", "a comment is // or /*");
    assert(this.pos < this.text.length, "the position is inside the text");
    let end = endOfLine(this.text, this.pos);
    if (kind === "*") {
      const close = this.text.indexOf("*/", this.pos + 2);
      end = close === -1 ? this.text.length : close + 2;
    }
    this.found.push({ line: lineOf(this.text, this.pos), text: this.text.slice(this.pos, end) });
    this.pos = end;
  }

  private stepString(quote: string): void {
    assert(quote === '"' || quote === "'", "a string starts with a quote");
    assert(this.pos < this.text.length, "the position is inside the text");
    this.pos += 1;
    while (this.pos < this.text.length && this.text[this.pos] !== quote && this.text[this.pos] !== "\n") this.pos += this.text[this.pos] === "\\" ? 2 : 1;
    this.pos += 1;
    this.previous = quote;
  }

  private stepRegex(): void {
    assert(this.text[this.pos] === "/", "a regex starts with a slash");
    assert(this.pos < this.text.length, "the position is inside the text");
    this.pos += 1;
    let inClass = false;
    while (this.pos < this.text.length && this.text[this.pos] !== "\n" && (inClass || this.text[this.pos] !== "/")) {
      if (this.text[this.pos] === "\\") this.pos += 1;
      else if (this.text[this.pos] === "[") inClass = true;
      else if (this.text[this.pos] === "]") inClass = false;
      this.pos += 1;
    }
    this.pos += 1;
    this.previous = "/";
  }

  private stepOther(c: string): void {
    assert(c.length === 1, "one character");
    assert(Number.isInteger(this.braceDepth), "the depth is a count");
    assert(this.pos < this.text.length, "the position is inside the text");
    if (c === "{") this.braceDepth += 1;
    if (c === "}") {
      this.braceDepth -= 1;
      if (this.templateDepth.at(-1) === this.braceDepth) {
        this.templateDepth.pop();
        this.pos += 1;
        this.scanTemplate();
        this.previous = "`";
        return;
      }
    }
    this.pos += 1;
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") this.previous = c;
  }
}

