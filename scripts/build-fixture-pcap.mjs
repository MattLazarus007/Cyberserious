#!/usr/bin/env node
// Builds the sensor test fixture: a tiny ethernet/ip/tcp pcap that carries
// lo0 lab traffic on port 8100/8200. One cleartext credential post, five
// failed logins inside thirty seconds, and three unanswered syns against
// the org app port. Checksums are computed for real, not zeroed, so the
// replay needs no -k none forgiveness. Dep-free on purpose: node built-ins
// only, so the fixture survives any machine in the group.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const HOST = "127.0.0.1";
// Frozen clock, same instant the seeds use, so replays never drift.
const BASE_MS = Date.parse("2026-10-13T08:00:00Z");

function ipv4Checksum(header) {
  let sum = 0;
  for (let i = 0; i < header.length; i += 2) {
    sum += (header[i] << 8) | header[i + 1];
  }
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

function ipBytes(addr) {
  return Buffer.from(addr.split(".").map((o) => Number(o) & 0xff));
}

function frame(srcPort, dstPort, seq, ack, flags, payload) {
  const tcp = Buffer.alloc(20 + payload.length);
  tcp.writeUInt16BE(srcPort, 0);
  tcp.writeUInt16BE(dstPort, 2);
  tcp.writeUInt32BE(seq >>> 0, 4);
  tcp.writeUInt32BE(ack >>> 0, 8);
  tcp.writeUInt8(5 << 4, 12);
  tcp.writeUInt8(flags, 13);
  tcp.writeUInt16BE(65535, 14);
  tcp.writeUInt16BE(0, 16); // checksum placeholder
  tcp.writeUInt16BE(0, 18);
  payload.copy(tcp, 20);

  const pseudo = Buffer.concat([ipBytes(HOST), ipBytes(HOST), Buffer.from([0, 6]), (() => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(tcp.length);
    return len;
  })(), tcp]);
  let sum = 0;
  for (let i = 0; i < pseudo.length; i += 2) sum += (pseudo[i] << 8) | pseudo[i + 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >> 16);
  tcp.writeUInt16BE(~sum & 0xffff, 16);

  const ip = Buffer.alloc(20);
  ip.writeUInt8(0x45, 0);
  ip.writeUInt8(0, 1);
  ip.writeUInt16BE(20 + tcp.length, 2);
  ip.writeUInt16BE(seq & 0xffff, 4); // trivial id, unique enough per frame
  ip.writeUInt16BE(0x4000, 6); // don't fragment
  ip.writeUInt8(64, 8);
  ip.writeUInt8(6, 9);
  ip.writeUInt16BE(0, 10); // checksum placeholder
  ipBytes(HOST).copy(ip, 12);
  ipBytes(HOST).copy(ip, 16);
  ip.writeUInt16BE(ipv4Checksum(ip), 10);

  const eth = Buffer.alloc(14);
  eth.set([0x02, 0, 0, 0, 0, 2], 0); // dst
  eth.set([0x02, 0, 0, 0, 0, 1], 6); // src
  eth.writeUInt16BE(0x0800, 12);
  return Buffer.concat([eth, ip, tcp]);
}

const SYN = 0x02;
const SYNACK = 0x12;
const ACK = 0x10;
const PSHACK = 0x18;

const packets = [];
let clockMs = BASE_MS;
function emit(buf) {
  packets.push({ at: clockMs, buf });
  clockMs += 400; // packets half a second apart keeps every burst inside 30s
}

function handshake(clientPort, serverPort) {
  const state = { cseq: 1000, sseq: 5000 };
  emit(frame(clientPort, serverPort, state.cseq, 0, SYN, Buffer.alloc(0)));
  emit(frame(serverPort, clientPort, state.sseq, state.cseq + 1, SYNACK, Buffer.alloc(0)));
  emit(frame(clientPort, serverPort, state.cseq + 1, state.sseq + 1, ACK, Buffer.alloc(0)));
  state.cseq += 1;
  state.sseq += 1;
  return state;
}

function httpExchange(clientPort, serverPort, state, request, response) {
  const req = Buffer.from(request, "ascii");
  emit(frame(clientPort, serverPort, state.cseq, state.sseq, PSHACK, req));
  state.cseq += req.length;
  emit(frame(serverPort, clientPort, state.sseq, state.cseq, ACK, Buffer.alloc(0)));
  const res = Buffer.from(response, "ascii");
  emit(frame(serverPort, clientPort, state.sseq, state.cseq, PSHACK, res));
  state.sseq += res.length;
  emit(frame(clientPort, serverPort, state.cseq, state.sseq, ACK, Buffer.alloc(0)));
}

// Connection one: five failed logins inside thirty seconds. The bodies say
// password=, not pass=, so only the burst rule fires here.
{
  const state = handshake(49152, 8100);
  for (let i = 1; i <= 5; i++) {
    const body = `username=intruder&password=wrong-${i}`;
    httpExchange(
      49152, 8100, state,
      `POST /api/v1/login HTTP/1.1\r\nHost: localhost:8100\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
      "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n"
    );
  }
}

// Connection two: one cleartext credential post that is not a login, so the
// pass= rule has its own honest hit.
{
  const state = handshake(49200, 8100);
  const body = "user=guest&pass=lab-cleartext-secret";
  httpExchange(
    49200, 8100, state,
    `POST /account/settings HTTP/1.1\r\nHost: localhost:8100\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
    "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"
  );
}

// Connection three to five: unanswered syns against the org app port. No
// listener answers on 8200 in the fixture, which is exactly what a probe
// looks like on the wire.
for (const port of [49300, 49301, 49302]) {
  emit(frame(port, 8200, 2000, 0, SYN, Buffer.alloc(0)));
}

const records = [];
const global = Buffer.alloc(24);
global.writeUInt32LE(0xa1b2c3d4, 0);
global.writeUInt16LE(2, 4);
global.writeUInt16LE(4, 6);
global.writeInt32LE(0, 8);
global.writeUInt32LE(0, 12);
global.writeUInt32LE(65535, 16);
global.writeUInt32LE(1, 20); // linktype ethernet
records.push(global);
for (const p of packets) {
  const head = Buffer.alloc(16);
  head.writeUInt32LE(Math.floor(p.at / 1000), 0);
  head.writeUInt32LE((p.at % 1000) * 1000, 4);
  head.writeUInt32LE(p.buf.length, 8);
  head.writeUInt32LE(p.buf.length, 12);
  records.push(head, p.buf);
}

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/build-fixture-pcap.mjs <output.pcap>");
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat(records));
console.log(`wrote ${packets.length} frames to ${out}`);
