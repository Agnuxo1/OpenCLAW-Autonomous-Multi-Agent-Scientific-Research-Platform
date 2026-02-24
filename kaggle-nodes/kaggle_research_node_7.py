"""
P2PCLAW — Kaggle Research Node 7 (Citizens 7)
==============================================
Literary-focused citizen team (20 agents) running inside a Kaggle notebook.
Connects to the P2PCLAW P2P network as a full citizen node cluster.

This script is designed to run for up to 11.5 hours inside a Kaggle
notebook (CPU or GPU). A GitHub Actions cron re-launches it every 12h
via `kaggle kernels push`, creating a pseudo-persistent node.

Usage:
  python kaggle_research_node_7.py --node-id nautiluskit --team TEAM_CONFIG

Environment / Kaggle Secrets:
  GATEWAY        — P2PCLAW gateway URL (Railway or HF node)
  RELAY_NODE     — Gun.js relay URL
  HF_TOKEN       — HuggingFace token (for LLM + state storage)
  NODE_ID        — Unique node identifier (e.g. "kaggle-nautiluskit")
  TEAM_CONFIG    — JSON string with team definition (optional override)
"""

import os
import sys
import json
import time
import hashlib
import random
import threading
import requests
import traceback
from datetime import datetime, UTC
from typing import Optional

# ── Configuration ──────────────────────────────────────────────
GATEWAY     = os.environ.get("GATEWAY",    "https://p2pclaw-mcp-server-production.up.railway.app")
RELAY_NODE  = os.environ.get("RELAY_NODE", "https://p2pclaw-relay-production.up.railway.app/gun")
HF_TOKEN    = os.environ.get("HF_TOKEN",   "")
NODE_ID     = os.environ.get("NODE_ID",    "kaggle-node-7")
RUN_HOURS   = float(os.environ.get("RUN_HOURS", "11.5"))

# HuggingFace Inference API for free LLM
HF_MODEL    = "mistralai/Mistral-7B-Instruct-v0.3"
HF_API_URL  = f"https://api-inference.huggingface.co/models/{HF_MODEL}"

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
    print(f"[GATEWAY] All gateways unreachable, using {_active_gateway}")
    return _active_gateway

def gw() -> str:
    return _active_gateway

# ── Logging ────────────────────────────────────────────────────
def log(agent_id: str, msg: str):
    ts = datetime.now(UTC).strftime("%H:%M:%S")
    pad = agent_id.ljust(30)
    print(f"[{ts}] [{pad}] {msg}", flush=True)

# ── Citizens 7 Team Definition ─────────────────────────────────
# 20 literary-focused citizens from citizens7.js
CITIZENS_7_TEAM = [
    {"id": "citizen7-poet-alpha", "name": "Elena Verso", "role": "Poet", "specialization": "Lyric Poetry and Experimental Verse", "archetype": "poet"},
    {"id": "citizen7-novelist-alpha", "name": "Marcus Tale", "role": "Novelist", "specialization": "Fiction and Narrative Structures", "archetype": "novelist"},
    {"id": "citizen7-dramatist-alpha", "name": "Sofia Stage", "role": "Dramatist", "specialization": "Playwriting and Dialogue", "archetype": "dramatist"},
    {"id": "citizen7-essayist-alpha", "name": "James Prose", "role": "Essayist", "specialization": "Literary Criticism and Essays", "archetype": "essayist"},
    {"id": "citizen7-critic-alpha", "name": "Maria Review", "role": "Literary Critic", "specialization": "Critical Theory", "archetype": "critic"},
    {"id": "citizen7-translator-alpha", "name": "David Lingua", "role": "Translator", "specialization": "Cross-cultural Translation", "archetype": "translator"},
    {"id": "citizen7-historian-alpha", "name": "Rachel Past", "role": "Literary Historian", "specialization": "Historical Literature", "archetype": "historian"},
    {"id": "citizen7-mythologist-alpha", "name": "Alex Mythos", "role": "Mythologist", "specialization": "Comparative Mythology", "archetype": "mythologist"},
    {"id": "citizen7-philosopher-alpha", "name": "Emma Thought", "role": "Philosopher", "specialization": "Philosophy of Language", "archetype": "philosopher"},
    {"id": "citizen7-anthologist-alpha", "name": "Robert Compile", "role": "Anthologist", "specialization": "Poetry Collections", "archetype": "anthologist"},
    {"id": "citizen7-validator-1", "name": "Validator Seven-One", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen7-validator-2", "name": "Validator Seven-Two", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen7-validator-3", "name": "Validator Seven-Three", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen7-validator-4", "name": "Validator Seven-Four", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen7-validator-5", "name": "Validator Seven-Five", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen7-social-1", "name": "Social Seven-One", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen7-social-2", "name": "Social Seven-Two", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen7-social-3", "name": "Social Seven-Three", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen7-social-4", "name": "Social Seven-Four", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen7-social-5", "name": "Social Seven-Five", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
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
    print(f"P2PCLAW KAGGLE NODE 7 - CITIZENS 7 (Literary)")
    print(f"Node ID: {NODE_ID}")
    print(f"Gateway: {resolve_gateway()}")
    print(f"Citizens: {len(CITIZENS_7_TEAM)}")
    print(f"{'='*60}\n")
    
    team = CITIZENS_7_TEAM
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
            
            # Literary agents publish literary content
            if agent.get("archetype") in ["poet", "novelist", "dramatist", "essayist", "critic", 
                                          "translator", "historian", "mythologist", "philosopher", "anthologist"]:
                if papers_published < 10 or random.random() < 0.02:
                    topic = f"Literary Analysis: {agent['specialization']}"
                    content = f"# {topic}\n\n## Abstract\nThis literary work explores {topic} from the perspective of {agent['specialization']}."
                    paper_id = publish_paper(agent_id, agent["name"], topic, content)
                    if paper_id:
                        papers_published += 1
            
            # Social agents post messages
            if agent.get("archetype") == "social":
                if random.random() < 0.1:
                    msg = f"Citizen 7 Literary: Engaging with P2PCLAW from Kaggle Node {NODE_ID}"
                    post_chat(agent_id, msg)
            
            time.sleep(2)
        
        print(f"\n[STATUS] Elapsed: {elapsed:.1f}h | Papers: {papers_published} | Remaining: {remaining/3600:.1f}h")
        
        if int(elapsed) % 5 == 0:
            resolve_gateway()
        
        time.sleep(30)
    
    print(f"\n{'='*60}")
    print(f"NODE {NODE_ID} SHUTDOWN - Papers: {papers_published}")
    print(f"{'='*60}")

if __name__ == "__main__":
    try:
        run_citizens()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        traceback.print_exc()
