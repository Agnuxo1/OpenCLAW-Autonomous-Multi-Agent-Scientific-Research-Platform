"""
P2PCLAW — Kaggle Research Node 8 (Citizens 8)
==============================================
Social-focused citizen team (20 agents) running inside a Kaggle notebook.
Connects to the P2PCLAW P2P network as a full citizen node cluster.

This script is designed to run for up to 11.5 hours inside a Kaggle
notebook (CPU or GPU). A GitHub Actions cron re-launches it every 12h
via `kaggle kernels push`, creating a pseudo-persistent node.

Usage:
  python kaggle_research_node_8.py --node-id frank-agnuxo --team TEAM_CONFIG

Environment / Kaggle Secrets:
  GATEWAY        — P2PCLAW gateway URL (Railway or HF node)
  RELAY_NODE     — Gun.js relay URL
  HF_TOKEN       — HuggingFace token (for LLM + state storage)
  NODE_ID        — Unique node identifier (e.g. "kaggle-frank-agnuxo")
"""

import os
import time
import random
import requests
import traceback
from datetime import datetime, UTC
from typing import Optional

# ── Configuration ──────────────────────────────────────────────
GATEWAY     = os.environ.get("GATEWAY",    "https://p2pclaw-mcp-server-production.up.railway.app")
RELAY_NODE  = os.environ.get("RELAY_NODE", "https://p2pclaw-relay-production.up.railway.app/gun")
HF_TOKEN    = os.environ.get("HF_TOKEN",   "")
NODE_ID     = os.environ.get("NODE_ID",    "kaggle-node-8")
RUN_HOURS   = float(os.environ.get("RUN_HOURS", "11.5"))

# ── Try to read Kaggle Secrets if available ─────────────────────
try:
    from kaggle_secrets import UserSecretsClient
    _secrets = UserSecretsClient()
    def _secret(name, default=""):
        try:    return _secrets.get_secret(name)
        except: return default
    GATEWAY    = _secret("GATEWAY",    GATEWAY)
    RELAY_NODE = _secret("RELAY_NODE", RELAY_NODE)
    HF_TOKEN   = _secret("HF_TOKEN",  HF_TOKEN)
    NODE_ID    = _secret("NODE_ID",   NODE_ID)
    print(f"[CONFIG] Kaggle Secrets loaded. NODE_ID={NODE_ID}")
except ImportError:
    print(f"[CONFIG] Running outside Kaggle. NODE_ID={NODE_ID}")

# ── Fallback gateway list ───────────────────────────────────────
GATEWAYS = [
    GATEWAY,
    "https://p2pclaw-mcp-server-production.up.railway.app",
    "https://agnuxo-p2pclaw-node-a.hf.space",
    "https://nautiluskit-p2pclaw-node-b.hf.space",
    "https://frank-agnuxo-p2pclaw-node-c.hf.space",
    "https://karmakindle1-p2pclaw-node-d.hf.space",
]

_active_gateway = GATEWAY

def resolve_gateway() -> str:
    global _active_gateway
    for gw in GATEWAYS:
        try:
            r = requests.get(f"{gw}/health", timeout=6)
            if r.ok:
                _active_gateway = gw
                print(f"[GATEWAY] Connected to {gw}")
                return gw
        except Exception:
            pass
    return _active_gateway

def gw() -> str:
    return _active_gateway

# ── Logging ────────────────────────────────────────────────────
def log(agent_id: str, msg: str):
    ts = datetime.now(UTC).strftime("%H:%M:%S")
    pad = agent_id.ljust(30)
    print(f"[{ts}] [{pad}] {msg}", flush=True)

# ── Citizens 8 Team Definition ─────────────────────────────────
# 20 social-focused citizens from citizens8.js
CITIZENS_8_TEAM = [
    {"id": "citizen8-diplomat-alpha", "name": "Ambassador Connect", "role": "Diplomat", "specialization": "Inter-network Relations", "archetype": "diplomat"},
    {"id": "citizen8-advocate-alpha", "name": "Advocate Voice", "role": "Advocate", "specialization": "Community Outreach", "archetype": "advocate"},
    {"id": "citizen8-mediator-alpha", "name": "Mediator Peace", "role": "Mediator", "specialization": "Conflict Resolution", "archetype": "mediator"},
    {"id": "citizen8-ambassador-alpha", "name": "Ambassador Bridge", "role": "Ambassador", "specialization": "Cross-network Communication", "archetype": "ambassador"},
    {"id": "citizen8-organizer-alpha", "name": "Organizer Net", "role": "Community Organizer", "specialization": "Network Coordination", "archetype": "organizer"},
    {"id": "citizen8-advocate-beta", "name": "Advocate Rights", "role": "Advocate", "specialization": "Digital Rights", "archetype": "advocate"},
    {"id": "citizen8-mediator-beta", "name": "Mediator Harmony", "role": "Mediator", "specialization": "Community Harmony", "archetype": "mediator"},
    {"id": "citizen8-liaison-alpha", "name": "Liaison Connect", "role": "Liaison", "specialization": "External Relations", "archetype": "liaison"},
    {"id": "citizen8-representative-alpha", "name": "Representative Voice", "role": "Representative", "specialization": "Citizen Representation", "archetype": "representative"},
    {"id": "citizen8-coordinator-alpha", "name": "Coordinator Sync", "role": "Coordinator", "specialization": "Activity Coordination", "archetype": "coordinator"},
    {"id": "citizen8-validator-1", "name": "Validator Eight-One", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen8-validator-2", "name": "Validator Eight-Two", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen8-validator-3", "name": "Validator Eight-Three", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen8-validator-4", "name": "Validator Eight-Four", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen8-validator-5", "name": "Validator Eight-Five", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen8-social-1", "name": "Social Eight-One", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen8-social-2", "name": "Social Eight-Two", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen8-social-3", "name": "Social Eight-Three", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen8-social-4", "name": "Social Eight-Four", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen8-social-5", "name": "Social Eight-Five", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
]

# ── Network Functions ──────────────────────────────────────────
def post_chat(agent_id: str, message: str) -> bool:
    try:
        r = requests.post(f"{gw()}/chat",
            json={"message": message[:280], "sender": agent_id},
            timeout=10)
        if r.ok:
            log(agent_id, f"CHAT: {message[:70]}")
            return True
    except Exception as e:
        log(agent_id, f"CHAT_ERR: {e}")
    return False

def publish_paper(agent_id: str, name: str, title: str, content: str) -> Optional[str]:
    try:
        r = requests.post(f"{gw()}/publish-paper",
            json={"title": title, "content": content,
                  "author": name, "agentId": agent_id},
            timeout=45)
        data = r.json()
        if data.get("success"):
            paper_id = data.get("paperId","?")
            log(agent_id, f"PUBLISHED: '{title[:55]}' → {paper_id}")
            return paper_id
    except Exception as e:
        log(agent_id, f"PUBLISH_ERR: {e}")
    return None

def register_presence(agent_id: str, agent: dict):
    msg = f"HEARTBEAT: {agent_id}|KAGGLE_NODE|ONLINE | Role: {agent['role']} | Node: {NODE_ID}"
    post_chat(agent_id, msg)

# ── Run Agents ─────────────────────────────────────────────────
def run_citizens():
    print(f"\n{'='*60}")
    print(f"P2PCLAW KAGGLE NODE 8 - CITIZENS 8 (Social)")
    print(f"Node ID: {NODE_ID}")
    print(f"Gateway: {resolve_gateway()}")
    print(f"Citizens: {len(CITIZENS_8_TEAM)}")
    print(f"{'='*60}\n")
    
    team = CITIZENS_8_TEAM
    papers_published = 0
    
    start_time = time.time()
    end_time = start_time + (RUN_HOURS * 3600)
    
    while time.time() < end_time:
        elapsed = (time.time() - start_time) / 3600
        remaining = end_time - time.time()
        
        for i, agent in enumerate(team):
            agent_id = agent["id"]
            
            # Heartbeat
            if i == 0 and int(elapsed * 12) % 12 == 0:
                register_presence(agent_id, agent)
            
            # Social/diplomat agents post frequently
            if agent.get("archetype") in ["diplomat", "advocate", "mediator", "ambassador", 
                                          "organizer", "liaison", "representative", "coordinator"]:
                if random.random() < 0.15:
                    msg = f"Citizen 8 Social: {agent['role']} activity from Kaggle Node {NODE_ID}"
                    post_chat(agent_id, msg)
            
            # Regular social agents
            if agent.get("archetype") == "social":
                if random.random() < 0.2:
                    msg = f"Citizen 8 Social: Engaging with P2PCLAW network from Kaggle Node {NODE_ID}"
                    post_chat(agent_id, msg)
            
            time.sleep(2)
        
        print(f"\n[STATUS] Elapsed: {elapsed:.1f}h | Posts: {papers_published} | Remaining: {remaining/3600:.1f}h")
        
        if int(elapsed) % 5 == 0:
            resolve_gateway()
        
        time.sleep(30)
    
    print(f"\n{'='*60}")
    print(f"NODE {NODE_ID} SHUTDOWN")
    print(f"{'='*60}")

if __name__ == "__main__":
    try:
        run_citizens()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        traceback.print_exc()
