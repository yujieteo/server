// neurons_room: the relay of the rooms of the neuron explorer at
// teoyujie.org/play/neurons/. A share link opens a room, and 2 to 5 people
// see the same neuron, text, token and lens, and the same notes on neurons.
// The protocol is in README.md of github.com/yujieteo/neurons.
//
//   neurons_room --port <n> [--ttl <seconds>]
//
// It listens on 127.0.0.1 only, and speaks FastCGI to httpd. One thread
// serves one request at a time, so the rooms need no lock. The rooms are in
// memory only: nothing goes to a file, and a restart ends all rooms. A room
// ends --ttl seconds (default 3 days) after it was made.

import std;
import os;
import json;

// room_net.h: the socket and the sandbox.
extern fn room_no_sigpipe();
extern fn room_listen(port: i32) -> i32;
extern fn room_accept(fd: i32) -> i32;
extern fn room_recv(fd: i32, max: i64, out: u8[>..]&) -> i64;
extern fn room_send(fd: i32, data: const u8[:]) -> bool;
extern fn room_close(fd: i32);
extern fn room_sandbox() -> bool;

let MAX_REQUEST = 16384;
let MAX_BODY = 8192;
let MAX_ROOMS = 100;
let MAX_MEMBERS = 5;
let MAX_NOTES = 64;
let MAX_VIEW = 2048;
let MAX_NOTE = 500;
let MAX_NAME = 32;
// A member with no request for this time is no longer in the room.
let AWAY_S = 15;
// The rate limits: requests in each window of 60 s, and rooms made in each hour.
let WINDOW_S = 60;
let ROOM_REQUESTS = 600;
let ROOM_WRITES = 120;
let IP_REQUESTS = 600;
let IP_CREATES = 6;
let MAX_IPS = 4096;

struct Member { id: u8[..16], name: u8[..32], seen: i64 }
struct Note { neuron: u8[..12], text: u8[..500], by: u8[..32], version: i64 }
struct Room {
    id: u8[..22],
    created: i64,
    // seq goes up at each change of the view or of a note.
    seq: i64,
    window: i64,
    requests: i64,
    writes: i64,
    view: u8[..2048],
    view_by: u8[..32],
    members: Member[..5],
    notes: Note[..64],
}
// The counts of one client address. They go away when both windows end.
struct Client { ip: u8[..46], window: i64, requests: i64, hour: i64, creates: i64 }

var rooms: Room[..MAX_ROOMS];
var clients: Client[..MAX_IPS];
var ttl: i64 = 3 * 24 * 3600;

fn log(line: u8[:]) {
    write_stderr(str("neurons_room: ", line, "\n"));
}

fn die(why: u8[:]) {
    log(why);
    exit(1);
}

// FastCGI.

struct Request { id: i64, big: bool, method: u8[..16], ip: u8[..46], body: u8[..MAX_BODY] }

fn be16(s: u8[:], at: i64) -> i64 { ((s[at] as i64) << 8) | s[at + 1] }

// A FastCGI name or value length: 1 byte, or 4 bytes with the top bit set.
fn fcgi_length(s: u8[:], at: i64&) -> i64 {
    guard at < s.len else { return -1; }
    if s[at] < 128 { at += 1; return s[at - 1]; }
    guard at + 4 <= s.len else { return -1; }
    let n = (((s[at] & 127) as i64) << 24) | ((s[at + 1] as i64) << 16) | ((s[at + 2] as i64) << 8) | s[at + 3];
    at += 4;
    return n;
}

// The FastCGI request in buf: the records BEGIN_REQUEST, PARAMS up to an
// empty one, and STDIN up to an empty one. 0 if buf has only a part of it,
// -1 if it is not valid, else 1. A body over MAX_BODY sets big.
fn fcgi_parse(buf: u8[:], r: Request&) -> i64 {
    var params: u8[>..] = [];
    var params_done = false;
    var at = 0;
    loop {
        guard at + 8 <= buf.len else { return 0; }
        let kind = buf[at + 1];
        let n = be16(buf, at + 4);
        let end = at + 8 + n + buf[at + 6];
        guard buf[at] == 1 else { return -1; }
        guard end <= buf.len else { return 0; }
        let content = buf[at + 8..at + 8 + n];
        if kind == 1 { r.id = be16(buf, at + 2); }
        else if kind == 4 {
            if n == 0 { params_done = true; } else { params.append(content); }
        } else if kind == 5 {
            if n == 0 {
                guard params_done else { return -1; }
                break;
            }
            if r.body.len + n <= MAX_BODY { r.body.append(content); } else { r.big = true; }
        }
        at = end;
    }
    var p = 0;
    while p < params.len {
        let nn = fcgi_length(params, p);
        let vn = fcgi_length(params, p);
        guard nn >= 0 && vn >= 0 && p + nn + vn <= params.len else { return -1; }
        let name = params[p..p + nn];
        let value = params[p + nn..p + nn + vn];
        if name == "REQUEST_METHOD" && value.len <= 16 { r.method.append(value); }
        else if name == "REMOTE_ADDR" && value.len <= 46 { r.ip.append(value); }
        p += nn + vn;
    }
    return 1;
}

fn read_request(fd: i32, r: Request&) -> bool {
    var buf: u8[>..] = [];
    loop {
        guard room_recv(fd, MAX_REQUEST - buf.len, buf) > 0 else { return false; }
        r.big = false;
        r.method.clear();
        r.ip.clear();
        r.body.clear();
        let got = fcgi_parse(buf, r);
        if got != 0 { return got > 0; }
        guard buf.len < MAX_REQUEST else { return false; }
    }
}

fn put_record(out: u8[>..]&, kind: u8, id: i64, content: u8[:]) {
    out.push(1);
    out.push(kind);
    out.push(((id >> 8) & 255) as! u8);
    out.push((id & 255) as! u8);
    out.push(((content.len >> 8) & 255) as! u8);
    out.push((content.len & 255) as! u8);
    out.push(0);
    out.push(0);
    out.append(content);
}

// The CGI reply as FastCGI records: STDOUT up to an empty one, then
// END_REQUEST.
fn fcgi_reply(out: u8[>..]&, id: i64, cgi: u8[:]) {
    var at = 0;
    while at < cgi.len {
        let n = min(cgi.len - at, 32768);
        put_record(out, 6, id, cgi[at..at + n]);
        at += n;
    }
    put_record(out, 6, id, "");
    put_record(out, 3, id, [0, 0, 0, 0, 0, 0, 0, 0]);
}

// The rooms.

fn head(out: u8[>..]&, status: u8[:]) {
    format(out, "Status: ", status, "\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n\r\n");
}

fn fail(out: u8[>..]&, status: u8[:], code: u8[:], message: u8[:]) {
    head(out, status);
    out.append("{\"error\":");
    json::format_string(out, code);
    out.append(",\"message\":");
    json::format_string(out, message);
    out.append("}\n");
}

// The room as the member sees it. The view and the notes come only if
// they changed after since. The reply names no member id, so that a member
// cannot speak as another.
fn state(out: u8[>..]&, room: Room&, member: u8[:], since: i64, error: u8[:]) {
    out.push('{');
    if error.len > 0 {
        out.append("\"error\":");
        json::format_string(out, error);
        out.push(',');
    }
    format(out, "\"seq\":", room.seq, ",\"expires\":", room.created + ttl, ",\"members\":[");
    for m, i in room.members {
        if i > 0 { out.push(','); }
        out.append("{\"name\":");
        json::format_string(out, m.name);
        if m.id == member { out.append(",\"you\":true"); }
        out.push('}');
    }
    out.push(']');
    if since < room.seq {
        out.append(",\"view\":");
        json::format_string(out, room.view);
        out.append(",\"view_by\":");
        json::format_string(out, room.view_by);
        out.append(",\"notes\":[");
        for n, i in room.notes {
            if i > 0 { out.push(','); }
            out.append("{\"neuron\":");
            json::format_string(out, n.neuron);
            out.append(",\"text\":");
            json::format_string(out, n.text);
            out.append(",\"by\":");
            json::format_string(out, n.by);
            format(out, ",\"version\":", n.version, "}");
        }
        out.push(']');
    }
    out.append("}\n");
}

// The share link is the key of a room: 22 characters of base64url, 128 bits.
fn is_id(s: u8[:], lo: i64, hi: i64) -> bool {
    s.len >= lo && s.len <= hi && all(s) { (it >= 'a' && it <= 'z') || (it >= 'A' && it <= 'Z') || (it >= '0' && it <= '9') || it == '-' || it == '_' }
}

// Text with no control character; a note can also have new lines.
fn is_text(s: u8[:], max: i64, lines: bool) -> bool {
    s.len <= max && all(s) { it >= 32 && it != 127 || (lines && it == '\n') }
}

// A neuron as layer.index, such as 16.1275.
fn is_neuron(s: u8[:]) -> bool {
    let dot = position(s, '.');
    dot >= 1 && dot <= 2 && s.len - dot - 1 >= 1 && s.len - dot - 1 <= 4
        && all(s) { (it >= '0' && it <= '9') || it == '.' } && count(s) { it == '.' } == 1
}

// One more request in the window that starts at window, which starts again
// after size seconds. The count in the window.
fn is_object(n: json::Node&) -> bool { match n.val { Obj => true, _ => false } }

fn tick(window: i64&, n: i64&, now: i64, size: i64) -> i64 {
    if now - window >= size { window = now; n = 0; }
    n += 1;
    return n;
}

// Ends the rooms after their time, the members that are away, and the
// counts of the clients after their windows.
fn sweep(now: i64) {
    retain(rooms) { now < it.created + ttl };
    for &room in rooms { retain(room.members) { now - it.seen < AWAY_S }; }
    retain(clients) { now - it.window < WINDOW_S || now - it.hour < 3600 };
}

fn handle(r: Request&, now: i64, out: u8[>..]&) {
    guard r.method == "POST" else { fail(out, "405 Method Not Allowed", "method", "Use POST."); return; }
    guard !r.big else { fail(out, "413 Payload Too Large", "big", "The request is too large."); return; }
    sweep(now);

    var client = clients.find() { it.ip == r.ip[..] };
    if !client {
        guard clients.len < MAX_IPS else { fail(out, "503 Service Unavailable", "busy", "The server is busy. Try again later."); return; }
        let c .= clients.push(Client { ip: [], window: now, requests: 0, hour: now, creates: 0 });
        c.ip.append(r.ip);
        client .= c;
    }
    guard client else { return; }
    guard tick(client.window, client.requests, now, WINDOW_S) <= IP_REQUESTS else {
        { fail(out, "429 Too Many Requests", "slow", "Too many requests from your address. Wait a minute."); return; }
    }

    // The OpenRouter key of a visitor never goes into a room. The page does
    // not send it, and the relay refuses a request that holds one.
    var low: u8[>..] = [];
    low.append(r.body);
    to_lower(low);
    guard find(low, "sk-or-") < 0 else {
        { fail(out, "400 Bad Request", "key", "This looks like an OpenRouter key. A room does not take keys."); return; }
    }

    var doc: json::Node[>..] = [];
    var decoded: u8[>..] = [];
    let root, err = json::parse(r.body, doc, decoded);
    let op, op_ok = json::as_string(json::member(root, "op"));
    let id, id_ok = json::as_string(json::member(root, "room"));
    let member, member_ok = json::as_string(json::member(root, "member"));
    let name, name_ok = json::as_string(json::member(root, "name"));
    var since: i64 = -1;
    let s, s_ok = json::as_i64(json::member(root, "since"));
    if s_ok { since = s; }
    guard op_ok && id_ok && is_id(id, 22, 22) && member_ok && is_id(member, 8, 16)
        && name_ok && name.len >= 1 && is_text(name, MAX_NAME, false) else {
        { fail(out, "400 Bad Request", "bad", "The request is not valid."); return; }
    }

    if op == "create" {
        let there = rooms.find() { it.id == id };
        guard !there else { fail(out, "409 Conflict", "exists", "This room is there already."); return; }
        guard rooms.len < MAX_ROOMS else { fail(out, "503 Service Unavailable", "rooms", "The server has too many rooms. Try again later."); return; }
        guard tick(client.hour, client.creates, now, 3600) <= IP_CREATES else {
            { fail(out, "429 Too Many Requests", "slow", "Too many new rooms from your address. Wait an hour."); return; }
        }
        let made .= rooms.push(Room {
            id: [], created: now, seq: 1, window: now, requests: 0, writes: 0,
            view: [], view_by: [], members: [], notes: [],
        });
        made.id.append(id);
    }

    let room = rooms.find() { it.id == id };
    guard room else { fail(out, "404 Not Found", "gone", "This room has ended, or the link is wrong."); return; }
    let write = op == "view" || op == "note";
    if now - room.window >= WINDOW_S { room.writes = 0; }
    guard tick(room.window, room.requests, now, WINDOW_S) <= ROOM_REQUESTS
        && (!write || room.writes < ROOM_WRITES) else {
        { fail(out, "429 Too Many Requests", "slow", "This room has too many requests. Wait a minute."); return; }
    }
    if write { room.writes += 1; }

    if op == "leave" {
        retain(room.members) { it.id != member };
        head(out, "200 OK");
        out.append("{}\n");
        return;
    }
    let me = room.members.find() { it.id == member };
    if me {
        me.seen = now;
        me.name.clear();
        me.name.append(name);
    } else {
        guard room.members.len < MAX_MEMBERS else { fail(out, "403 Forbidden", "full", "This room has 5 people in it, the most that it takes."); return; }
        let m .= room.members.push(Member { id: [], name: [], seen: now });
        m.id.append(member);
        m.name.append(name);
    }

    if op == "view" {
        // The last view wins: the relay keeps the views in the sequence that they came.
        let view, view_ok = json::as_string(json::member(root, "view"));
        guard view_ok && view.len <= MAX_VIEW else { fail(out, "400 Bad Request", "bad", "The view is not valid."); return; }
        var vdoc: json::Node[>..] = [];
        var vdecoded: u8[>..] = [];
        let vroot, verr = json::parse(view, vdoc, vdecoded);
        guard vroot && is_object(vroot) else { fail(out, "400 Bad Request", "bad", "The view is not valid."); return; }
        room.seq += 1;
        room.view.clear();
        room.view.append(view);
        room.view_by.clear();
        room.view_by.append(name);
    } else if op == "note" {
        // A note changes only from the version that its writer saw. Else the
        // reply is 409 with the notes as they are now.
        let neuron, neuron_ok = json::as_string(json::member(root, "neuron"));
        let text, text_ok = json::as_string(json::member(root, "text"));
        let base, base_ok = json::as_i64(json::member(root, "base"));
        guard neuron_ok && is_neuron(neuron) && text_ok && is_text(text, MAX_NOTE, true) && base_ok else {
            { fail(out, "400 Bad Request", "bad", "The note is not valid."); return; }
        }
        let note = room.notes.find() { it.neuron == neuron };
        let current = if note { note.version } else { 0 };
        if base != current {
            head(out, "409 Conflict");
            state(out, room, member, -1, "conflict");
            return;
        }
        room.seq += 1;
        if text.len == 0 {
            retain(room.notes) { it.neuron != neuron };
        } else if note {
            note.text.clear();
            note.text.append(text);
            note.by.clear();
            note.by.append(name);
            note.version = room.seq;
        } else {
            guard room.notes.len < MAX_NOTES else {
                room.seq -= 1;
                { fail(out, "403 Forbidden", "notes", "This room has 64 notes, the most that it takes. Delete one first."); return; }
            }
            let n .= room.notes.push(Note { neuron: [], text: [], by: [], version: room.seq });
            n.neuron.append(neuron);
            n.text.append(text);
            n.by.append(name);
        }
    } else if op != "poll" && op != "create" {
        { fail(out, "400 Bad Request", "bad", "The request is not valid."); return; }
    }
    head(out, "200 OK");
    state(out, room, member, since, "");
}

fn serve(fd: i32) {
    var r = Request { id: 0, big: false, method: [], ip: [], body: [] };
    guard read_request(fd, r) else { room_close(fd); return; }
    var cgi: u8[>..] = [];
    handle(r, time_ns() / 1000000000, cgi);
    var out: u8[>..] = [];
    fcgi_reply(out, r.id, cgi);
    room_send(fd, out);
    room_close(fd);
}

fn main() {
    let a = args();
    var port: i64 = -1;
    var k = 1;
    while k + 1 < a.len {
        let n, ok = parse_int(a[k + 1]);
        if a[k] == "--port" {
            guard ok && n >= 0 && n <= 65535 else { die("--port needs 0 to 65535"); }
            port = n;
        } else if a[k] == "--ttl" {
            guard ok && n >= 1 else { die("--ttl needs a number of seconds"); }
            ttl = n;
        } else { break; }
        k += 2;
    }
    guard k == a.len && port >= 0 else { die("usage: neurons_room --port <n> [--ttl <seconds>]"); }

    room_no_sigpipe();
    let listener = room_listen(port as! i32);
    guard listener >= 0 else { die(str("cannot listen on 127.0.0.1 port ", port)); }
    guard room_sandbox() else { die("no sandbox"); }
    loop {
        let fd = room_accept(listener);
        if fd < 0 { sleep_ms(10); continue; }
        serve(fd);
    }
}
