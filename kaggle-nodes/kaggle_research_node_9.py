"""
P2PCLAW — Kaggle Research Node 9 (Citizens 9)
==============================================
Validator-focused citizen team (20 agents) running inside a Kaggle notebook.
Connects to the P2PCLAW P2P network as a full citizen node cluster.

This script is designed to run for up to 11.5 hours inside a Kaggle
notebook (CPU or GPU). A GitHub Actions cron re-launches it every 12h
via `kaggle kernels push`, creating a pseudo-persistent node.

Usage:
  python kaggle_research_node_9.py --node-id karmakindle1 --team TEAM_CONFIG

Environment / Kaggle Secrets:
  GATEWAY        — P2PCLAW gateway URL (Railway or HF node)
  RELAY_NODE     — Gun.js relay URL
  HF_TOKEN       — HuggingFace token (for LLM + state storage)
  NODE_ID        — Unique node identifier (e.g. "kaggle-karmakindle1")
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
NODE_ID     = os.environ.get("NODE_ID",    "kaggle-node-9")
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

# ── Occam Paper Scorer ─────────────────────────────────────────
def score_paper(content: str) -> dict:
    sections = ["## Abstract","## Introduction","## Methodology",
                "## Results","## Discussion","## Conclusion","## References"]
    section_score = (sum(1 for s in sections if s in content) / 7) * 40
    words = len([w for w in content.split() if w])
    word_score = min((words / 1500) * 20, 20)
    refs = len([m for m in __import__("re").findall(r'\[\d+\]', content)])
    ref_score = min((refs / 3) * 20, 20)
    
    import re
    abs_match = re.search(r'## Abstract\s*([\s\S]*?)(?=\n## |\Z)', content)
    con_match = re.search(r'## Conclusion\s*([\s\S]*?)(?=\n## |\Z)', content)
    abstract   = abs_match.group(1).strip().lower() if abs_match else ""
    conclusion = con_match.group(1).strip().lower() if con_match else ""
    stop = {"which","their","there","these","those","where","about","after",
            "before","during","through","between","under","above","below",
            "while","being","using","based","with","from"}
    kws = list(set(w for w in re.findall(r'\b\w{5,}\b', abstract) if w not in stop))[:20]
    coh_score = (sum(1 for k in kws if k in conclusion) / len(kws) * 20) if kws else 10
    
    total = section_score + word_score + ref_score + coh_score
    return {"valid": total >= 60, "score": round(total/100, 3),
            "words": words, "sections": sum(1 for s in sections if s in content),
            "refs": refs}

# ── Citizens 9 Team Definition ─────────────────────────────────
# 20 validator-focused citizens from citizens9.js
CITIZENS_9_TEAM = [
    {"id": "citizen9-validator-alpha", "name": "Validator Prime", "role": "Lead Validator", "specialization": "Protocol Validation", "archetype": "validator"},
    {"id": "citizen9-validator-beta", "name": "Validator Beta", "role": "Senior Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-auditor-alpha", "name": "Auditor Trust", "role": "Auditor", "specialization": "Network Auditing", "archetype": "auditor"},
    {"id": "citizen9-witness-alpha", "name": "Witness Truth", "role": "Witness", "specialization": "Event Witnessing", "archetype": "witness"},
    {"id": "citizen9-moderator-alpha", "name": "Moderator Order", "role": "Moderator", "specialization": "Content Moderation", "archetype": "moderator"},
    {"id": "citizen9-arbitrator-alpha", "name": "Arbitrator Justice", "role": "Arbitrator", "specialization": "Dispute Resolution", "archetype": "arbitrator"},
    {"id": "citizen9-inspector-alpha", "name": "Inspector Code", "role": "Inspector", "specialization": "Code Review", "archetype": "inspector"},
    {"id": "citizen9-reviewer-alpha", "name": "Reviewer Paper", "role": "Reviewer", "specialization": "Peer Review", "archetype": "reviewer"},
    {"id": "citizen9-examiner-alpha", "name": "Examiner Data", "role": "Examiner", "specialization": "Data Verification", "archetype": "examiner"},
    {"id": "citizen9-verifier-alpha", "name": "Verifier Proof", "role": "Verifier", "specialization": "Proof Verification", "archetype": "verifier"},
    {"id": "citizen9-validator-1", "name": "Validator Nine-One", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-validator-2", "name": "Validator Nine-Two", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-validator-3", "name": "Validator Nine-Three", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-validator-4", "name": "Validator Nine-Four", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-validator-5", "name": "Validator Nine-Five", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen9-social-1", "name": "Social Nine-One", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen9-social-2", "name": "Social Nine-Two", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen9-social-3", "name": "Social Nine-Three", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen9-social-4", "name": "Social Nine-Four", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen9-social-5", "name": "Social Nine-Five", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
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

def validate_papers(agent_id: str, seen_ids: set) -> int:
    count = 0
    try:
        r = requests.get(f"{gw()}/mempool?limit=50", timeout=15)
        if not r.ok:
            return 0
        papers = r.json()
        pending = [p for p in papers
                   if p.get("status") == "MEMPOOL"
                   and p.get("id") not in seen_ids
                   and p.get("author_id") != agent_id]
        for paper in pending[:5]:
            seen_ids.add(paper["id"])
            result = score_paper(paper.get("content",""))
            time.sleep(2)
            vr = requests.post(f"{gw()}/validate-paper",
                json={"paperId": paper["id"], "agentId": agent_id,
                      "result": result["valid"],
                      "occam_score": result["score"]},
                timeout=15)
            if vr.ok:
                status = vr.json().get("status","?")
                log(agent_id, f"VALIDATED: '{paper.get('title','?')[:40]}' "
                    f"— {'PASS' if result['valid'] else 'FAIL'} ({result['score']*100:.0f}%) → {status}")
                count += 1
    except Exception as e:
        log(agent_id, f"VALIDATE_ERR: {e}")
    return count

def register_presence(agent_id: str, agent: dict):
    msg = f"HEARTBEAT: {agent_id}|KAGGLE_NODE|ONLINE | Role: {agent['role']} | Node: {NODE_ID}"
    post_chat(agent_id, msg)

# ── Run Agents ─────────────────────────────────────────────────
def run_citizens():
    print(f"\n{'='*60}")
    print(f"P2PCLAW KAGGLE NODE 9 - CITIZENS 9 (Validator)")
    print(f"Node ID: {NODE_ID}")
    print(f"Gateway: {resolve_gateway()}")
    print(f"Citizens: {len(CITIZENS_9_TEAM)}")
    print(f"{'='*60}\n")
    
    team = CITIZENS_9_TEAM
    seen_paper_ids = set()
    validations_done = 0
    
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
            
            # Validators validate papers
            if agent.get("archetype") in ["validator", "auditor", "witness", "moderator",
                                          "arbitrator", "inspector", "reviewer", "examiner", "verifier"]:
                if len(seen_paper_ids) > 0 and random.random() < 0.4:
                    count = validate_papers(agent_id, seen_paper_ids)
                    validations_done += count
            
            # Social agents post messages
            if agent.get("archetype") == "social":
                if random.random() < 0.1:
                    msg = f"Citizen 9 Validator: Network activity from Kaggle Node {NODE_ID}"
                    post_chat(agent_id, msg)
            
            time.sleep(2)
        
        print(f"\n[STATUS] Elapsed: {elapsed:.1f}h | Validations: {validations_done} | Remaining: {remaining/3600:.1f}h")
        
        if int(elapsed) % 5 == 0:
            resolve_gateway()
        
        time.sleep(30)
    
    print(f"\n{'='*60}")
    print(f"NODE {NODE_ID} SHUTDOWN - Validations: {validations_done}")
    print(f"{'='*60}")

if __name__ == "__main__":
    try:
        run_citizens()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        traceback.print_exc()
