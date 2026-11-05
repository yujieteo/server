// The private names of Lavish, femahoy and the fleet view: the path of one request.
// Sources: README.md (Private names, Fleet view), etc/relayd.conf, etc/unbound.conf, etc/pf.conf,
// etc/httpd.conf, etc/sshd_config (Match User tunnel).
// Hero: none, a network diagram has no physical object (flat cards, schematic-emil style).
// Layout 58 mm (164 pt). The SVG root is shown 95 mm wide (about 360 px in the README), so the 6 pt text is about 13 px.
// Made with the schematic-emil skill (on schematic-figure). To render it again: put this file at figure/figure.js
// in an empty folder, copy schematic-emil/style.js to figure/emil.js and schematic-emil/fonts/ to figure/fonts/, then
//   node <schematic-figure>/foundation/tools/render.mjs --root <folder> --fig <folder>/figure/figure.js
// An SVG in an <img> cannot load a web font. So private-names.svg also holds a subset of Inter
// (fontTools subset, woff2, the glyphs of the figure) as a data URL in an @font-face rule of its <style>.
import * as E from './emil.js';

export const figure = { width: 58, height: 102, name: 'private-names', format: 'journal' };

function assert(ok, message) {
  if (!ok) throw new Error(`assertion failed: ${message}`);
}

function kitOf(F, L) {
  assert(F.root !== undefined, 'the figure has a root');
  assert(typeof L.rect === 'function', 'the layer draws rectangles');
  const { r, line, text } = E.useEmil(F, L, 'web');
  const G = E.gray, B = E.hue.blue, T = E.hue.tomato, V = E.hue.violet;
  const R = F.root;
  const head = { head: 3.6, headWidth: 3.2 };
  const lbl = (x, y, s, o = {}) => {
    assert(Number.isFinite(x), 'a label has an x');
    assert(Number.isFinite(y), 'a label has a y');
    return L.text(R, x, y, s, { size: text.label, color: G[1200], valign: 'middle', anchor: 'middle', ...o });
  };
  const sml = (x, y, s, o = {}) => {
    assert(Number.isFinite(x), 'a small label has an x');
    assert(typeof s === 'string', 'a small label has text');
    return lbl(x, y, s, { size: text.small, color: G[1100], ...o });
  };
  const card = (x, y, w, h, o = {}) => {
    assert(w > 0, 'a card has a width');
    assert(h > 0, 'a card has a height');
    return L.rect(R, x, y, w, h, { ...E.card(r.card), width: line.thin, ...o });
  };
  const arrow = (a, b, o = {}) => {
    assert(a.length === 2, 'an arrow starts at a point');
    assert(b.length === 2, 'an arrow ends at a point');
    return L.arrow(R, a, b, { stroke: B[11], width: line.bold, ...head, gap1: 0.5, ...o });
  };
  return { F, L, R, r, line, text, G, B, T, V, head, lbl, sml, card, arrow };
}

function layoutOf(k) {
  assert(k.R !== undefined, 'the kit has a root');
  assert(k.line.thin > 0, 'a thin line has a width');
  const W = k.L.mm(58);
  const x0 = 4, x1 = W - 4, dW = 100, iX = x0 + dW + 6;
  const sy = 46, sh = 170, uy = sy + 18, ux = x0 + 6, uw = 76;
  const hx = iX, hw = x1 - 6 - hx;
  const ry = uy + 52, rx = ux, rw = 94, rh = 44;
  const fx = rx + rw + 10, fw = x1 - 6 - fx;
  const gap = 4, n = 3, cx0 = x0 + 6, cw = (x1 - 6 - cx0 - gap * (n - 1)) / n;
  const py = ry + rh + 22, ph = 30;
  const px = [0, 1, 2].map((i) => cx0 + i * (cw + gap));
  return { W, x0, x1, dW, iX, sy, sh, uy, ux, uw, hx, hw, ry, rx, rw, rh, fx, fw, cw, py, ph, px };
}

function drawTop(k, g) {
  assert(g.iX > g.x0, 'the internet card is right of the device card');

  assert(g.dW > 0, 'the device card has a width');
  assert(g.x1 > g.iX, 'the internet card has a width');
  k.card(g.x0, 4, g.dW, 28, { fill: k.B[3], stroke: k.B[7] });
  k.lbl(g.x0 + g.dW / 2, 13, 'VPN device', { weight: E.weight.name });
  k.sml(g.x0 + g.dW / 2, 24, 'Mac · iPhone · desktop');
  k.card(g.iX, 4, g.x1 - g.iX, 28);
  k.lbl((g.iX + g.x1) / 2, 18, 'Internet', { weight: E.weight.name });
}

function drawFrame(k, g) {
  assert(g.uy > g.sy, 'unbound is inside the server frame');

  assert(g.sh > 0, 'the server frame has a height');
  assert(g.x1 > g.x0, 'the server frame has a width');
  k.L.rect(k.R, g.x0, g.sy, g.x1 - g.x0, g.sh, { fill: k.G[200], stroke: k.G[700], width: k.line.thin, r: k.r.card });
  k.sml(g.x0 + 6, g.sy + 8, 'teoyujie.org server', { anchor: 'start', weight: E.weight.name });
  k.card(g.ux, g.uy, g.uw, 30);
  k.lbl(g.ux + g.uw / 2, g.uy + 10, 'unbound', { weight: E.weight.name });
  k.sml(g.ux + g.uw / 2, g.uy + 21, 'name → 10.8.0.1');
  k.card(g.hx, g.uy, g.hw, 48);
  k.lbl(g.hx + g.hw / 2, g.uy + 10, 'httpd', { weight: E.weight.name });
  k.sml(g.hx + g.hw / 2, g.uy + 21, 'these names:');
  k.sml(g.hx + g.hw / 2, g.uy + 30, "Let's Encrypt");
  k.sml(g.hx + g.hw / 2, g.uy + 39, 'check only');
}

function drawRelayd(k, g) {
  assert(g.ry > g.uy, 'relayd is below unbound');

  assert(g.rw > 0, 'relayd has a width');
  assert(g.fw > 0, 'the fleet view has a width');
  k.card(g.rx, g.ry, g.rw, g.rh, { fill: k.B[3], stroke: k.B[7] });
  k.lbl(g.rx + 6, g.ry + 10, 'relayd 10.8.0.1:443', { anchor: 'start', weight: E.weight.name });
  k.L.rect(k.R, g.rx + 5, g.ry + 20, g.rw - 10, 17, { fill: k.T[3], stroke: k.T[7], width: k.line.thin, r: k.r.chip });
  k.sml(g.rx + g.rw / 2, g.ry + 28.5, '403: cross-site Origin', { color: k.T[11], weight: E.weight.name });
  k.card(g.fx, g.ry + 4, g.fw, 36);
  k.lbl(g.fx + g.fw / 2, g.ry + 15, 'fleet', { weight: E.weight.name });
  k.sml(g.fx + g.fw / 2, g.ry + 27, 'httpd :8092');
  k.arrow([g.rx + g.rw, g.ry + g.rh / 2], [g.fx, g.ry + g.rh / 2]);
}

function drawPorts(k, g) {
  assert(g.py > g.ry, 'the ports are below relayd');

  assert(g.px.length === 3, 'there are three ports');
  assert(g.cw > 0, 'a port card has a width');
  const mid = (i) => {
    assert(i >= 0 && i < 3, 'a port index is 0 to 2');
    assert(g.px[i] !== undefined, 'the port has a position');
    return g.px[i] + g.cw / 2;
  };
  const ports = [['mac.lavish', ':4387'], ['desk.lavish', ':4388'], ['fh', ':8790']];
  for (const [i, [nm, port]] of ports.entries()) {
    k.card(g.px[i], g.py, g.cw, g.ph);
    k.lbl(mid(i), g.py + 10, nm, { weight: E.weight.name });
    k.sml(mid(i), g.py + 21, port);
  }
  const busY = g.py - 10, stem = mid(0), bold = k.line.bold;
  k.L.line(k.R, [stem, g.ry + g.rh], [stem, busY], { stroke: k.B[11], width: bold, cap: 'butt' });
  k.L.line(k.R, [mid(0) - bold / 2, busY], [mid(2) + bold / 2, busY], { stroke: k.B[11], width: bold, cap: 'butt' });
  for (const i of [0, 1, 2]) k.arrow([mid(i), busY - bold / 2], [mid(i), g.py]);
  return mid;
}

function drawDeviceArrows(k, g) {
  assert(g.ry > g.uy, 'relayd is below unbound');

  assert(g.uw > 0, 'unbound has a width');
  assert(g.hw > 0, 'httpd has a width');
  const dnsX = g.ux + g.uw - 12, httpsX = g.ux + g.uw + 8;
  k.arrow([dnsX, 32], [dnsX, g.uy]);
  k.sml(dnsX - 4, 39, 'DNS', { anchor: 'end', color: k.B[11] });
  k.arrow([httpsX, 32], [httpsX, g.ry]);
  k.sml(httpsX + 4, 39, 'HTTPS', { anchor: 'start', color: k.B[11] });
  k.L.arrow(k.R, [g.hx + g.hw / 2, 32], [g.hx + g.hw / 2, g.uy], { stroke: k.G[900], width: k.line.bold, ...k.head, gap1: 0.5 });
}

function drawHosts(k, g, mid) {
  assert(typeof mid === 'function', 'the port middle is a function');
  assert(g.cw > 0, 'a port card has a width');
  const ay = g.sy + g.sh + 22, ah = 46;
  const host = (i0, i1, nm) => {
    assert(i1 >= i0, 'a host spans a port or more');
    assert(typeof nm === 'string', 'a host has a name');
    k.card(g.px[i0], ay, g.px[i1] + g.cw - g.px[i0], ah);
    k.sml(g.px[i0] + 5, ay + ah - 7, nm, { anchor: 'start', weight: E.weight.name });
  };
  host(0, 0, 'Mac');
  host(1, 2, 'desktop');
  const app = (i, nm, port) => {
    assert(i >= 0 && i < 3, 'an app sits under a port');
    assert(typeof port === 'string', 'an app has a port');
    const x = g.px[i] + 3, y = ay + 5, w = g.cw - 6;
    k.L.rect(k.R, x, y, w, 26, { fill: k.G[100], stroke: k.G[700], width: k.line.thin, r: k.r.chip });
    k.lbl(x + w / 2, y + 9, nm, { weight: E.weight.name });
    k.sml(x + w / 2, y + 19, port);
  };
  app(0, 'Lavish', ':4387');
  app(1, 'Lavish', ':4387');
  app(2, 'femahoy', ':8790');
  for (const i of [0, 1, 2]) {
    const top = g.py + g.ph, bot = ay + 5;
    k.L.rect(k.R, mid(i) - 5, top, 10, bot - top, { fill: k.V[3], stroke: k.V[7], width: k.line.thin, r: 0 });
    k.arrow([mid(i), top], [mid(i), bot], { stroke: k.V[11] });
  }
  k.L.callout(k.R, [mid(1) + 5, g.sy + g.sh + 11], [mid(1) + 9, g.sy + g.sh + 11], 'reverse SSH\ntunnel',
    { anchor: 'start', size: k.text.small, color: k.V[11], textColor: k.V[11] });
}

export default function draw(F, L) {
  assert(F.svg !== undefined, 'the figure has an svg');
  assert(figure.width > 0, 'the figure has a width');
  const k = kitOf(F, L);
  const g = layoutOf(k);
  drawTop(k, g);
  drawFrame(k, g);
  drawRelayd(k, g);
  const mid = drawPorts(k, g);
  drawDeviceArrows(k, g);
  drawHosts(k, g, mid);
  F.svg.setAttribute('width', '95mm');
  F.svg.setAttribute('height', `${(figure.height * 95 / figure.width).toFixed(3)}mm`);
  E.emilTheme(F);
}
