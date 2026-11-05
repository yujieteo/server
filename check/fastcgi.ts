import { createConnection } from "node:net";
import { assert } from "./lib.ts";

const BEGIN_REQUEST = 1;
const PARAMS = 4;
const STDIN = 5;
const STDOUT = 6;
const RESPONDER = 1;
const REQUEST_ID = 1;
const CHUNK_BYTES = 8192;
const REPLY_WAIT_MS = 5000;
const BYTE = 256;

function record(type: number, content: readonly number[]): readonly number[] {
  assert(content.length < 65536, "a record holds at most 65535 bytes");
  assert(type >= 1 && type <= STDOUT + 1, "a known record type");
  assert(Number.isInteger(type), "a type is an integer");
  return [1, type, 0, REQUEST_ID, content.length >> 8, content.length % BYTE, 0, 0, ...content];
}

function bytesOf(text: string): readonly number[] {
  assert(text.length < 65536, "a name or value fits in one record");
  const bytes = [...new TextEncoder().encode(text)];
  assert(bytes.length >= text.length, "UTF-8 has at least one byte for each character");
  return bytes;
}

function pair(name: string, value: string): readonly number[] {
  const encodedName = bytesOf(name);
  const encodedValue = bytesOf(value);
  assert(encodedName.length < 128, "a name length is one byte");
  assert(encodedValue.length < 128, "a value length is one byte");
  return [encodedName.length, encodedValue.length, ...encodedName, ...encodedValue];
}

function fastcgiRequest(body: string, address: string): readonly number[] {
  assert(address !== "", "a request has a client address");
  assert(body.length >= 0, "a body has a length");
  assert(address.length < 128, "an address length is one byte");
  const data = bytesOf(body);
  const params = [...pair("REQUEST_METHOD", "POST"), ...pair("REMOTE_ADDR", address)];
  assert(params.length < 65536, "the params fit in one record");
  const parts: (readonly number[])[] = [record(BEGIN_REQUEST, [0, RESPONDER, 0, 0, 0, 0, 0, 0]), record(PARAMS, params), record(PARAMS, [])];
  for (let at = 0; at < data.length; at += CHUNK_BYTES) parts.push(record(STDIN, data.slice(at, at + CHUNK_BYTES)));
  parts.push(record(STDIN, []));
  assert(parts.length >= 4, "a request has the begin, the params, an empty params and an empty stdin");
  return parts.flat();
}

function statusOf(reply: readonly number[]): number | null {
  assert(reply.length >= 0, "a reply has a length");
  assert(STDOUT === 6, "stdout records are type 6");
  const chunks: number[] = [];
  let at = 0;
  while (at + 8 <= reply.length) {
    const type = reply[at + 1] ?? 0;
    const length = ((reply[at + 4] ?? 0) << 8) | (reply[at + 5] ?? 0);
    const padding = reply[at + 6] ?? 0;
    if (type === STDOUT) chunks.push(...reply.slice(at + 8, at + 8 + length));
    at += 8 + length + padding;
  }
  const head = new TextDecoder().decode(new Uint8Array(chunks));
  assert(at >= reply.length - 7, "the records were read to the end");
  const found = /^Status: (\d+)/mu.exec(head);
  return found?.[1] === undefined ? null : Number(found[1]);
}

async function collect(port: number, request: readonly number[]): Promise<readonly number[]> {
  assert(port > 0 && port < 65536, "a port number");
  assert(request.length > 0, "a request has bytes");
  const received: number[] = [];
  const socket = createConnection({ host: "127.0.0.1", port });
  const timer = setTimeout(() => {
    socket.destroy();
  }, REPLY_WAIT_MS);
  socket.once("connect", () => {
    socket.end(Buffer.from(request));
  });
  try {
    for await (const chunk of socket) if (Buffer.isBuffer(chunk)) for (const byte of chunk) received.push(byte);
  } catch {
    assert(received.length >= 0, "what arrived before the error is kept");
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
  assert(socket.destroyed, "the socket is closed after the reply or the wait");
  return received;
}

export async function fastcgiPost(port: number, body: string, address = "127.0.0.1"): Promise<number | null> {
  assert(port > 0 && port < 65536, "a port number");
  assert(Number.isInteger(port), "a port is an integer");
  const received = await collect(port, fastcgiRequest(body, address));
  return statusOf(received);
}
