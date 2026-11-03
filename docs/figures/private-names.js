// The private names of Lavish, femahoy and the fleet view: the path of one request.
// Sources: README.md (Private names, Fleet view), etc/relayd.conf, etc/unbound.conf, etc/pf.conf,
// etc/httpd.conf, etc/sshd_config (Match User tunnel).
// Hero: none, a network diagram has no physical object (flat cards, schematic-emil style).
// Made with the schematic-emil skill (on schematic-figure). To render it again: put this file at figure/figure.js
// in an empty folder, copy schematic-emil/style.js to figure/emil.js and schematic-emil/fonts/ to figure/fonts/, then
//   node <schematic-figure>/foundation/tools/render.mjs --root <folder> --fig <folder>/figure/figure.js
// An SVG in an <img> cannot load a web font. So private-names.svg also holds a subset of Inter
// (fontTools subset, woff2, the glyphs of the figure) as a data URL in an @font-face rule of its <style>.
import * as E from './emil.js';

export const figure = { width: 95, height: 106, name: 'private-names', format: 'journal' };

export default function draw(F, L) {
  const { r, line, text } = E.useEmil(F, L, 'web');
  const G = E.gray, B = E.hue.blue, T = E.hue.tomato, V = E.hue.violet;
  const W = L.mm(95), R = F.root;
  const lbl = (x, y, s, o = {}) => L.text(R, x, y, s, { size: text.label, color: G[1200], valign: 'middle', anchor: 'middle', ...o });
  const sml = (x, y, s, o = {}) => lbl(x, y, s, { size: text.small, color: G[1100], ...o });
  const card = (x, y, w, h, o = {}) => L.rect(R, x, y, w, h, { ...E.card(r.card), width: line.thin, ...o });
  const arrow = (a, b, o = {}) => L.arrow(R, a, b, { stroke: B[11], width: line.bold, head: 4, headWidth: 3.4, ...o });

  // the request path (blue): device -> unbound (DNS), device -> relayd (HTTPS)
  const x0 = 6, x1 = W - 6;
  // 1. the VPN device and the internet
  card(x0, 6, 122, 30, { fill: B[3], stroke: B[7] });
  lbl(x0 + 61, 15, 'VPN device', { weight: E.weight.name });
  sml(x0 + 61, 27, 'Mac · iPhone · desktop');
  card(x1 - 100, 6, 100, 30);
  lbl(x1 - 50, 15, 'Internet', { weight: E.weight.name });
  sml(x1 - 50, 27, 'public address only');

  // 2. the server frame
  const sy = 52, sh = 166;
  L.rect(R, x0, sy, x1 - x0, sh, { fill: G[200], stroke: G[700], width: line.thin, r: r.card });
  sml(x0 + 8, sy + 9, 'teoyujie.org server', { anchor: 'start', weight: E.weight.name, color: G[1100] });

  // unbound (left) and the public httpd (right)
  const uy = sy + 20;
  card(x0 + 10, uy, 92, 30);
  lbl(x0 + 56, uy + 9, 'unbound', { weight: E.weight.name });
  sml(x0 + 56, uy + 21, 'name → 10.8.0.1');
  card(x1 - 100, uy, 92, 30);
  lbl(x1 - 54, uy + 9, 'httpd', { weight: E.weight.name });
  sml(x1 - 54, uy + 21, "Let's Encrypt check only");

  // relayd, the full width
  const ry = uy + 50;
  card(x0 + 10, ry, x1 - x0 - 20, 34, { fill: B[3], stroke: B[7] });
  lbl(x0 + 20, ry + 11, 'relayd  10.8.0.1:443', { anchor: 'start', weight: E.weight.name });
  sml(x0 + 20, ry + 24, 'sets Host and Origin', { anchor: 'start' });
  // the 403 chip: a cross-site request stops here
  const cw = 92, cx = x1 - 18 - cw;
  L.rect(R, cx, ry + 8, cw, 18, { fill: T[3], stroke: T[7], width: line.thin, r: r.chip });
  sml(cx + cw / 2, ry + 17, '403: cross-site Origin', { color: T[11], weight: E.weight.name });

  // the four private names and where relayd sends them
  const py = ry + 56, ph = 30, gap = 6, n = 4;
  const pw = (x1 - x0 - 20 - gap * (n - 1)) / n;
  const names = [['mac.lavish', ':4387'], ['desk.lavish', ':4388'], ['fh', ':8790'], ['fleet', 'httpd :8092']];
  const px = names.map((_, i) => x0 + 10 + i * (pw + gap));
  names.forEach(([nm, port], i) => {
    card(px[i], py, pw, ph);
    lbl(px[i] + pw / 2, py + 10, nm, { weight: E.weight.name });
    sml(px[i] + pw / 2, py + 21, port);
    arrow([px[i] + pw / 2, ry + 34], [px[i] + pw / 2, py], { gap1: 0.5 });
  });

  // the device arrows: DNS to unbound, HTTPS to relayd
  arrow([x0 + 80, 36], [x0 + 80, uy], { gap1: 0.5 });
  sml(x0 + 84, 44, 'DNS', { anchor: 'start', color: B[11] });
  arrow([x0 + 112, 36], [x0 + 112, ry], { gap1: 0.5 });
  sml(x0 + 116, 44, 'HTTPS', { anchor: 'start', color: B[11] });
  // the internet reaches only the public httpd
  L.arrow(R, [x1 - 50, 36], [x1 - 50, uy], { stroke: G[900], width: line.bold, head: 4, headWidth: 3.4, gap1: 0.5 });

  // 3. the reverse SSH tunnels, out of the server to the apps on the Mac and the desktop
  const ay = sy + sh + 26, ah = 50;
  const host = (i0, i1, nm) => {
    card(px[i0], ay, px[i1] + pw - px[i0], ah);
    sml(px[i0] + 6, ay + ah - 8, nm, { anchor: 'start', weight: E.weight.name });
  };
  host(0, 0, 'Mac');
  host(1, 2, 'desktop');
  // the apps, each under its tunnel port
  const app = (i, nm, port) => {
    const x = px[i] + 4, y = ay + 6, w = pw - 8;
    L.rect(R, x, y, w, 26, { fill: G[100], stroke: G[700], width: line.thin, r: r.chip });
    lbl(x + w / 2, y + 9, nm, { weight: E.weight.name });
    sml(x + w / 2, y + 19, port);
  };
  app(0, 'Lavish', ':4387');
  app(1, 'Lavish', ':4387');
  app(2, 'femahoy', ':8790');
  // tunnels: a violet band from each tunnel port to its app, the request runs down it
  [0, 1, 2].forEach((i) => {
    const cxp = px[i] + pw / 2, top = py + ph, bot = ay + 6;
    L.rect(R, cxp - 5, top, 10, bot - top, { fill: V[3], stroke: V[7], width: line.thin, r: 0 });
    arrow([cxp, top], [cxp, bot], { stroke: V[11], gap1: 0.5 });
  });
  L.callout(R, [px[2] + pw / 2 + 5, sy + sh + 13], [px[3] + 4, sy + sh + 13], 'reverse SSH tunnel', { anchor: 'start', size: text.small, color: V[11], textColor: V[11] });
  E.emilTheme(F);
}
