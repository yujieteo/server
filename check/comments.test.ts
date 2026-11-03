import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { findCLikeComments, findComments, findHtmlComments, findLineHashComments, findShellComments } from "./comments.ts";

const lines = (comments: readonly { readonly line: number }[]): number[] => comments.map((comment) => comment.line);

describe("shell comments are found as the shell reads them", () => {
  test("a # at the start of a word is a comment", () => {
    expect(lines(findShellComments("a=1 # one\n# two\nb=2\n"))).toEqual([1, 2]);
  });
  test("a # in a quote, in $#, in ${#x} and in ${x#y} is not a comment", () => {
    expect(findShellComments("echo '# a' \"# b\" $# ${#x} ${y#z} a#b\n")).toEqual([]);
  });
  test("a # in a nested quote of a command substitution is not a comment", () => {
    expect(findShellComments('x="$(echo "#a" | tr -d \'#\')"\n')).toEqual([]);
  });
  test("a # in the body of a here document is not a comment", () => {
    expect(findShellComments("cat <<-EOF\n\t# data\n\tEOF\n# real\n")).toEqual([{ line: 4, text: "# real" }]);
  });
  test("a # in a sed expression with # as delimiter is not a comment", () => {
    expect(findShellComments("sed \"s#a#b#g\" f > g\n")).toEqual([]);
  });
});

describe("line-hash comments", () => {
  test("a # in a quote is not a comment, and a # after a space is", () => {
    expect(lines(findLineHashComments('style "a{color:#fff}" # note\nx # y\n'))).toEqual([1, 2]);
  });
});

describe("C and TypeScript comments", () => {
  test("// in a string, a character, a template and a regex is not a comment", () => {
    const source = 'const a = "//"; const b = \'/*\'; const c = `${1}//`; const d = /\\/\\//; int e = \'"\';\n';
    expect(findCLikeComments(source)).toEqual([]);
  });
  test("// and /* */ are comments, also over more than one line", () => {
    expect(lines(findCLikeComments("a; // b\n/* c\n d */ e;\n"))).toEqual([1, 2]);
  });
});

describe("HTML comments", () => {
  test("a comment in the page, in a script and in a style is found", async () => {
    const page = "<p>a</p>\n<!-- b -->\n<style>\n/* c */\n</style>\n<script>\n// d\nlet e = 1;\n</script>\n";
    expect((await findHtmlComments(page)).map((comment) => comment.text.trim())).toEqual(["b", "/* c */", "// d"]);
  });
});

describe("a text without comment syntax, in a quote, has no comment (property)", () => {
  const plain = fc.stringMatching(/^[ -&(-\[\]-~]{0,40}$/);
  test("shell", async () => {
    await fc.assert(fc.asyncProperty(plain, async (text) => (await findComments("shell", `echo '${text}'\n`)).length === 0));
  });
  test("C", async () => {
    await fc.assert(fc.asyncProperty(plain, async (text) => (await findComments("c-like", `char *s = "${text.replaceAll('"', "")}";\n`)).length === 0));
  });
});
