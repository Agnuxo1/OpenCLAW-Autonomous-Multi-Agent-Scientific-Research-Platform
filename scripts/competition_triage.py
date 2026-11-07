#!/usr/bin/env python3
"""Hourly multilingual contest triage from the Server-IA discovery ledger.

Produces a finite, source-grounded review queue. This intentionally does not
claim eligibility, accept terms, call any LLM, run discovered code, or submit.
"""
from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
import pathlib
import re
import tempfile
import unicodedata
from urllib.parse import urlparse

ROOT = pathlib.Path(os.environ.get("COMPETITION_STATE_DIR", "/srv/openclaw/competition-state"))
POSITIVE = {
    "application": 3, "applications": 3, "registration": 3,
    "register": 3, "报名": 3, "inscripción": 3, "inscricao": 3,
    "apply": 3, "open": 2, "join": 2, "inscription": 3,
    "call for": 2, "招募": 2, "вступ": 2, "募集中": 3,
    "hackathon": 2, "hackatón": 2, "竞赛": 2, "مسابقة": 2,
    "챌린지": 2, "challenge": 2, "competition": 2, "concours": 2,
    "concurso": 2, "大会": 1,
}
NEGATIVE = {
    "winner": -6, "winners": -6, "awarded": -5, "finals": -3,
    "results": -4, "ended": -6, "halted": -8, "concluded": -5,
    "past": -4, "recap": -4, "2025": -4, "获奖": -5,
    "成绩揭晓": -8, "落幕": -8, "ganadores": -6, "gagnants": -6,
    "vencedores": -6, "заверш": -6,
}
TECH_TERMS = ("nvidia", "amd", "intel", "openai", "anthropic", "google",
              "microsoft", "amazon", "meta", "tencent", "alibaba",
              "baidu", "samsung", "ibm", "arxiv", "neural", "ml",
              "computer", "bio", "science", "ai ", "ia ", "ai-", "gpu")
HIGH_PRIORITY = {"nvidia": "GPU and kernels", "math": "Mathematics",
                 "bio": "Bioinformatics", "neural": "Neuromorphic AI",
                 "scientific": "Scientific simulation", "gpu": "GPU kernels"}
REVIEW_LIMIT = 100

def load(name: str, fallback):
    try:
        return json.loads((ROOT / name).read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return fallback

def put_atomic(name: str, value) -> None:
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".triage-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, ROOT / name)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def signature(value: str) -> str:
    """Collapse transliteration and punctuation for cross-language deduplication."""
    text = unicodedata.normalize("NFKC", value.lower())
    return re.sub(r"[\W_]+", " ", text, flags=re.UNICODE).strip()[:200]

def rank(row: dict) -> dict | None:
    title = row.get("title", "").strip()
    link = row.get("url", "").strip()
    if not title or urlparse(link).scheme != "https":
        return None
    lower = " " + title.casefold() + " "
    score = 0
    evidence = []
    for phrase, value in POSITIVE.items():
        if phrase in lower:
            score += value
            evidence.append(f"+{value}:{phrase}")
    for phrase, value in NEGATIVE.items():
        if phrase in lower:
            score += value
            evidence.append(f"{value}:{phrase}")
    matched_tech = [x for x in TECH_TERMS if x in lower]
    score += min(4, len(matched_tech))
    # No discovered Google News RSS link is official evidence of current admission.
    if urlparse(link).hostname == "news.google.com":
        score -= 1
    try:
        published = dt.datetime.fromisoformat(row.get("published") or "")
        age_days = (dt.datetime.now(dt.timezone.utc) -
                    published.astimezone(dt.timezone.utc)).days
        if age_days > 28:
            score -= 3
    except ValueError:
        pass
    themes = [v for k, v in HIGH_PRIORITY.items() if k in lower]
    return {
        "id": row.get("id"), "title": title, "source_url": link,
        "source": row.get("origin"), "language": row.get("language"),
        "published": row.get("published"), "score": score,
        "evidence": evidence, "technology_mentions": matched_tech,
        "project_themes": themes,
        "eligibility": "UNKNOWN",
        "organizer_announcement_verified": False,
        "official_registration_verified": False,
        "review_status": "REQUIRES_OFFICIAL_SOURCE",
    }

def main() -> int:
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = ROOT / "triage.lock"
    with lock_path.open("a+") as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = load("discovery.json", [])
        matches = {}
        for row in data:
            result = rank(row)
            if result is None:
                continue
            key = signature(result["title"])
            if key not in matches or result["score"] > matches[key]["score"]:
                matches[key] = result
        reviewed = sorted(matches.values(),
                          key=lambda row: (-row["score"], row["title"]))
        shortlisted = [row for row in reviewed if row["score"] >= 3]
        output = {
            "updated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source_candidate_count": len(data),
            "deduplicated_count": len(matches),
            "review_needed": len(shortlisted),
            "review_queue": shortlisted[:REVIEW_LIMIT],
            "important": "Heuristic shortlist, NOT verified eligible contests.",
            "llm_calls": 0, "gpu_calls": 0,
        }
        put_atomic("competition-triage.json", output)
        print(json.dumps({k: v for k, v in output.items() if k != "review_queue"},
                         ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
