const BEGIN_REQUEST = 1;
const PARAMS = 4;
const STDIN = 5;
const STDOUT = 6;
const RESPONDER = 1;
const REQUEST_ID = 1;

function record(type: number, content: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + content.length);
  out.set([1, type, 0, REQUEST_ID, content.length >> 8, content.length & 255, 0, 0]);
  out.set(content, 8);
  return out;
}

function pair(name: string, value: string): Uint8Array {
  const n = new TextEncoder().encode(name);
  const v = new TextEncoder().encode(value);
  return new Uint8Array([n.length, v.length, ...n, ...v]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function fastcgiRequest(body: string, address: string): Uint8Array {
  const data = new TextEncoder().encode(body);
  const params = concat([pair("REQUEST_METHOD", "POST"), pair("REMOTE_ADDR", address)]);
  const parts: Uint8Array[] = [record(BEGIN_REQUEST, new Uint8Array([0, RESPONDER, 0, 0, 0, 0, 0, 0])), record(PARAMS, params), record(PARAMS, new Uint8Array())];
  for (let at = 0; at < data.length; at += 8192) parts.push(record(STDIN, data.slice(at, at + 8192)));
  parts.push(record(STDIN, new Uint8Array()));
  return concat(parts);
}

function statusOf(reply: Uint8Array): number | null {
  const chunks: Uint8Array[] = [];
  let at = 0;
  while (at + 8 <= reply.length) {
    const type = reply[at + 1] ?? 0;
    const length = ((reply[at + 4] ?? 0) << 8) | (reply[at + 5] ?? 0);
    const padding = reply[at + 6] ?? 0;
    if (type === STDOUT) chunks.push(reply.slice(at + 8, at + 8 + length));
    at += 8 + length + padding;
  }
  const head = new TextDecoder().decode(concat(chunks));
  const found = /^Status: (\d+)/m.exec(head);
  return found?.[1] === undefined ? null : Number(found[1]);
}

export async function fastcgiPost(port: number, body: string, address = "127.0.0.1"): Promise<number | null> {
  const received: Uint8Array[] = [];
  const done = Promise.withResolvers<void>();
  const request = fastcgiRequest(body, address);
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      open(connection) {
        connection.write(request);
        connection.shutdown();
      },
      data(_connection, chunk) {
        received.push(new Uint8Array(chunk));
      },
      close() {
        done.resolve();
      },
      error() {
        done.resolve();
      },
    },
  });
  await Promise.race([done.promise, Bun.sleep(5000)]);
  socket.end();
  return statusOf(concat(received));
}
