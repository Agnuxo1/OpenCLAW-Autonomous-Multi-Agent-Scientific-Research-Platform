// Project: P2PCLAW
// Contributor: Francisco Angulo de Lafuente (non-exclusive)
// ORCID: https://orcid.org/0009-0001-1634-7063
// Attribution recorded: 2026-11-05
// This attribution does not grant a license or claim sole authorship.

import Gun from "gun";
import "gun/sea.js";
import { ALL_PEERS, PRIMARY_RELAY } from "./peers.js";

// Multi-peer for resilience: if Railway/Cloudflare fail, fallbacks (HF, public relays) keep mesh alive
const gun = Gun({
  peers: ALL_PEERS,
  localStorage: true,
  radisk: true,
  dir: "radata",
  retry: 1000,
});

export const db = gun.get(process.env.GUN_DB_NAME || "openclaw-p2p-v3");

console.log(`[Gun.js] Peers: ${ALL_PEERS.length} (primary: ${PRIMARY_RELAY})`);
console.log(`[Gun.js] Database name: ${process.env.GUN_DB_NAME || "openclaw-p2p-v3"}`);

export default gun;
