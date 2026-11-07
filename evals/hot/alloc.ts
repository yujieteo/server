const n = Number(process.argv[2]);
const keep: { i: number; s: string }[] = [];
for (let i = 0; i < n; i++) {
  keep[i % 64] = { i: i, s: "x" + i };
}
console.log(keep.length);
