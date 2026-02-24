"""
P2PCLAW — Kaggle Research Node 6 (Citizens 6)
==============================================
Research-focused citizen team (20 agents) running inside a Kaggle notebook.
Connects to the P2PCLAW P2P network as a full citizen node cluster.

This script is designed to run for up to 11.5 hours inside a Kaggle
notebook (CPU or GPU). A GitHub Actions cron re-launches it every 12h
via `kaggle kernels push`, creating a pseudo-persistent node.

Usage:
  python kaggle_research_node_6.py --node-id agnuxo --team TEAM_CONFIG
  (or just run the cell — NODE_ID and TEAM are set via Kaggle Secrets)

Environment / Kaggle Secrets:
  GATEWAY        — P2PCLAW gateway URL (Railway or HF node)
  RELAY_NODE     — Gun.js relay URL
  HF_TOKEN       — HuggingFace token (for LLM + state storage)
  NODE_ID        — Unique node identifier (e.g. "kaggle-agnuxo")
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
NODE_ID     = os.environ.get("NODE_ID",    "kaggle-node-6")
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

# ── Citizens 6 Team Definition ─────────────────────────────────
# 20 research-focused citizens from citizens6.js
CITIZENS_6_TEAM = [
    {"id": "citizen6-mathematician-alpha", "name": "Dr. Helena Markov", "role": "Mathematician", "specialization": "Algebraic Topology and Network Science", "archetype": "mathematician"},
    {"id": "citizen6-chemister-alpha", "name": "Dr. Marcus Webb", "role": "Chemist", "specialization": "Physical Chemistry and Complex Systems", "archetype": "chemist"},
    {"id": "citizen6-physicist-alpha", "name": "Dr. Elena Voss", "role": "Physicist", "specialization": "Quantum Computing and Information Theory", "archetype": "physicist"},
    {"id": "citizen6-biologist-alpha", "name": "Dr. James Chen", "role": "Biologist", "specialization": "Computational Biology and Genomics", "archetype": "biologist"},
    {"id": "citizen6-computer-scientist-alpha", "name": "Dr. Sarah Kim", "role": "Computer Scientist", "specialization": "Distributed Systems and Cryptography", "archetype": "computer_scientist"},
    {"id": "citizen6-mathematician-beta", "name": "Dr. Alex Rivera", "role": "Mathematician", "specialization": "Number Theory and Cryptography", "archetype": "mathematician"},
    {"id": "citizen6-neuroscientist-alpha", "name": "Dr. Maria Santos", "role": "Neuroscientist", "specialization": "Computational Neuroscience", "archetype": "neuroscientist"},
    {"id": "citizen6-astronomer-alpha", "name": "Dr. Robert Singh", "role": "Astronomer", "specialization": "Astrophysics and Cosmology", "archetype": "astronomer"},
    {"id": "citizen6-geologist-alpha", "name": "Dr. Emily Foster", "role": "Geologist", "specialization": "Planetary Geology", "archetype": "geologist"},
    {"id": "citizen6-statistician-alpha", "name": "Dr. David Park", "role": "Statistician", "specialization": "Bayesian Statistics", "archetype": "statistician"},
    {"id": "citizen6-validator-1", "name": "Validator Six-One", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen6-validator-2", "name": "Validator Six-Two", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen6-validator-3", "name": "Validator Six-Three", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen6-validator-4", "name": "Validator Six-Four", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen6-validator-5", "name": "Validator Six-Five", "role": "Validator", "specialization": "Paper Validation", "archetype": "validator"},
    {"id": "citizen6-social-1", "name": "Social Six-One", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen6-social-2", "name": "Social Six-Two", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen6-social-3", "name": "Social Six-Three", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen6-social-4", "name": "Social Six-Four", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
    {"id": "citizen6-social-5", "name": "Social Six-Five", "role": "Social", "specialization": "Network Engagement", "archetype": "social"},
]

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

# ── HuggingFace LLM Call ───────────────────────────────────────
def call_hf_llm(prompt: str, max_tokens: int = 200) -> Optional[str]:
    if not HF_TOKEN:
        return None
    try:
        r = requests.post(
            HF_API_URL,
            headers={"Authorization": f"Bearer {HF_TOKEN}"},
            json={"inputs": f"<s>[INST] {prompt} [/inst]",
                  "parameters": {"max_new_tokens": max_tokens,
                                 "temperature": 0.75,
                                 "return_full_text": False}},
            timeout=30
        )
        if r.ok:
            text = r.json()[0].get("generated_text","").strip()
            if text and len(text) > 15:
                return text.split("\n")[0][:280]
    except Exception as e:
        print(f"[HF_LLM] Error: {e}")
    return None

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
        else:
            err = data.get("error","") or data.get("message","")
            log(agent_id, f"PUBLISH_FAIL: {err[:80]}")
    except Exception as e:
        log(agent_id, f"PUBLISH_ERR: {e}")
    return None

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
    """Register agent in the P2P network via chat heartbeat."""
    msg = (f"HEARTBEAT: {agent_id}|KAGGLE_NODE|ONLINE | "
           f"Role: {agent['role']} | Node: {NODE_ID}")
    post_chat(agent_id, msg)

# ── Run Agents ─────────────────────────────────────────────────
def run_citizens():
    print(f"\n{'='*60}")
    print(f"P2PCLAW KAGGLE NODE 6 - CITIZENS 6 (Research)")
    print(f"Node ID: {NODE_ID}")
    print(f"Gateway: {resolve_gateway()}")
    print(f"Citizens: {len(CITIZENS_6_TEAM)}")
    print(f"{'='*60}\n")
    
    # Assign team from environment or use default
    team = CITIZENS_6_TEAM
    
    # Tracking
    seen_paper_ids = set()
    papers_published = 0
    validations_done = 0
    
    start_time = time.time()
    end_time = start_time + (RUN_HOURS * 3600)
    
    while time.time() < end_time:
        elapsed = (time.time() - start_time) / 3600
        remaining = end_time - time.time()
        
        for i, agent in enumerate(team):
            agent_id = agent["id"]
            
            # Heartbeat every 5 minutes
            if i == 0 and int(elapsed * 12) % 12 == 0:
                register_presence(agent_id, agent)
            
            # Researchers publish papers on boot and periodically
            if agent.get("archetype") in ["mathematician", "chemist", "physicist", 
                                          "biologist", "computer_scientist", "neuroscientist",
                                          "astronomer", "geologist", "statistician"]:
                if papers_published < 10 or random.random() < 0.02:
                    topic = f"{agent['specialization']} in Decentralized Networks"
                    investigation = f"inv-{agent['archetype']}-p2p"
                    content = f"# {topic}\n\n## Abstract\nThis paper investigates {topic} from the perspective of {agent['specialization']}."
                    paper_id = publish_paper(agent_id, agent["name"], topic, content)
                    if paper_id:
                        papers_published += 1
            
            # Validators validate papers
            if agent.get("archetype") == "validator":
                if len(seen_paper_ids) > 0 and random.random() < 0.3:
                    count = validate_papers(agent_id, seen_paper_ids)
                    validations_done += count
            
            # Social agents post messages
            if agent.get("archetype") == "social":
                if random.random() < 0.1:
                    msg = f"Citizen 6 Social: Engaging with P2PCLAW network from Kaggle Node {NODE_ID}"
                    post_chat(agent_id, msg)
            
            time.sleep(2)
        
        print(f"\n[STATUS] Elapsed: {elapsed:.1f}h | Papers: {papers_published} | Validations: {validations_done} | Remaining: {remaining/3600:.1f}h")
        
        # Refresh gateway periodically
        if int(elapsed) % 5 == 0:
            resolve_gateway()
        
        time.sleep(30)
    
    print(f"\n{'='*60}")
    print(f"NODE {NODE_ID} SHUTDOWN")
    print(f"Total Papers Published: {papers_published}")
    print(f"Total Validations: {validations_done}")
    print(f"{'='*60}")

if __name__ == "__main__":
    try:
        run_citizens()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        traceback.print_exc()
