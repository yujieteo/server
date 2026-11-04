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

export default function draw(F, L) {
  const { r, line, text } = E.useEmil(F, L, 'web');
  const G = E.gray, B = E.hue.blue, T = E.hue.tomato, V = E.hue.violet;
  const W = L.mm(58), R = F.root;
  const lbl = (x, y, s, o = {}) => L.text(R, x, y, s, { size: text.label, color: G[1200], valign: 'middle', anchor: 'middle', ...o });
  const sml = (x, y, s, o = {}) => lbl(x, y, s, { size: text.small, color: G[1100], ...o });
  const card = (x, y, w, h, o = {}) => L.rect(R, x, y, w, h, { ...E.card(r.card), width: line.thin, ...o });
  const head = { head: 3.6, headWidth: 3.2 };
  const arrow = (a, b, o = {}) => L.arrow(R, a, b, { stroke: B[11], width: line.bold, ...head, gap1: 0.5, ...o });
  const x0 = 4, x1 = W - 4;

  // 1. the VPN device and the internet
  const dW = 100;
  card(x0, 4, dW, 28, { fill: B[3], stroke: B[7] });
  lbl(x0 + dW / 2, 13, 'VPN device', { weight: E.weight.name });
  sml(x0 + dW / 2, 24, 'Mac · iPhone · desktop');
  const iX = x0 + dW + 6;
  card(iX, 4, x1 - iX, 28);
  lbl((iX + x1) / 2, 18, 'Internet', { weight: E.weight.name });

  // 2. the server frame
  const sy = 46, sh = 170;
  L.rect(R, x0, sy, x1 - x0, sh, { fill: G[200], stroke: G[700], width: line.thin, r: r.card });
  sml(x0 + 6, sy + 8, 'teoyujie.org server', { anchor: 'start', weight: E.weight.name });

  // unbound (left) and the public httpd (right)
  const uy = sy + 18, ux = x0 + 6, uw = 76;
  card(ux, uy, uw, 30);
  lbl(ux + uw / 2, uy + 10, 'unbound', { weight: E.weight.name });
  sml(ux + uw / 2, uy + 21, 'name → 10.8.0.1');
  const hx = iX, hw = x1 - 6 - hx;
  card(hx, uy, hw, 48);
  lbl(hx + hw / 2, uy + 10, 'httpd', { weight: E.weight.name });
  sml(hx + hw / 2, uy + 21, 'these names:');
  sml(hx + hw / 2, uy + 30, "Let's Encrypt");
  sml(hx + hw / 2, uy + 39, 'check only');

  // relayd (left) and the fleet view (right)
  const ry = uy + 52, rx = ux, rw = 94, rh = 44;
  card(rx, ry, rw, rh, { fill: B[3], stroke: B[7] });
  lbl(rx + 6, ry + 10, 'relayd 10.8.0.1:443', { anchor: 'start', weight: E.weight.name });
  // the 403 chip: a cross-site request stops here
  L.rect(R, rx + 5, ry + 20, rw - 10, 17, { fill: T[3], stroke: T[7], width: line.thin, r: r.chip });
  sml(rx + rw / 2, ry + 28.5, '403: cross-site Origin', { color: T[11], weight: E.weight.name });
  const fx = rx + rw + 10, fw = x1 - 6 - fx;
  card(fx, ry + 4, fw, 36);
  lbl(fx + fw / 2, ry + 15, 'fleet', { weight: E.weight.name });
  sml(fx + fw / 2, ry + 27, 'httpd :8092');
  arrow([rx + rw, ry + rh / 2], [fx, ry + rh / 2]);

  // the three tunnel ports
  const gap = 4, n = 3, cx0 = x0 + 6, cw = (x1 - 6 - cx0 - gap * (n - 1)) / n;
  const py = ry + rh + 22, ph = 30;
  const px = [0, 1, 2].map((i) => cx0 + i * (cw + gap)), mid = (i) => px[i] + cw / 2;
  [['mac.lavish', ':4387'], ['desk.lavish', ':4388'], ['fh', ':8790']].forEach(([nm, port], i) => {
    card(px[i], py, cw, ph);
    lbl(mid(i), py + 10, nm, { weight: E.weight.name });
    sml(mid(i), py + 21, port);
  });
  // relayd -> the three ports: one stem, one bus, three drops
  const busY = py - 10, stem = mid(0);
  L.line(R, [stem, ry + rh], [stem, busY], { stroke: B[11], width: line.bold, cap: 'butt' });
  L.line(R, [mid(0) - line.bold / 2, busY], [mid(2) + line.bold / 2, busY], { stroke: B[11], width: line.bold, cap: 'butt' });
  [0, 1, 2].forEach((i) => arrow([mid(i), busY - line.bold / 2], [mid(i), py]));

  // the device arrows: DNS to unbound, HTTPS to relayd; the internet reaches only the public httpd
  const dnsX = ux + uw - 12, httpsX = ux + uw + 8;
  arrow([dnsX, 32], [dnsX, uy]);
  sml(dnsX - 4, 39, 'DNS', { anchor: 'end', color: B[11] });
  arrow([httpsX, 32], [httpsX, ry]);
  sml(httpsX + 4, 39, 'HTTPS', { anchor: 'start', color: B[11] });
  L.arrow(R, [hx + hw / 2, 32], [hx + hw / 2, uy], { stroke: G[900], width: line.bold, ...head, gap1: 0.5 });

  // 3. the reverse SSH tunnels, out of the server to the apps on the Mac and the desktop
  const ay = sy + sh + 22, ah = 46;
  const host = (i0, i1, nm) => {
    card(px[i0], ay, px[i1] + cw - px[i0], ah);
    sml(px[i0] + 5, ay + ah - 7, nm, { anchor: 'start', weight: E.weight.name });
  };
  host(0, 0, 'Mac');
  host(1, 2, 'desktop');
  const app = (i, nm, port) => {
    const x = px[i] + 3, y = ay + 5, w = cw - 6;
    L.rect(R, x, y, w, 26, { fill: G[100], stroke: G[700], width: line.thin, r: r.chip });
    lbl(x + w / 2, y + 9, nm, { weight: E.weight.name });
    sml(x + w / 2, y + 19, port);
  };
  app(0, 'Lavish', ':4387');
  app(1, 'Lavish', ':4387');
  app(2, 'femahoy', ':8790');
  [0, 1, 2].forEach((i) => {
    const top = py + ph, bot = ay + 5;
    L.rect(R, mid(i) - 5, top, 10, bot - top, { fill: V[3], stroke: V[7], width: line.thin, r: 0 });
    arrow([mid(i), top], [mid(i), bot], { stroke: V[11] });
  });
  L.callout(R, [mid(1) + 5, sy + sh + 11], [mid(1) + 9, sy + sh + 11], 'reverse SSH\ntunnel',
    { anchor: 'start', size: text.small, color: V[11], textColor: V[11] });

  F.svg.setAttribute('width', '95mm');
  F.svg.setAttribute('height', `${(figure.height * 95 / figure.width).toFixed(3)}mm`);
  E.emilTheme(F);
}
