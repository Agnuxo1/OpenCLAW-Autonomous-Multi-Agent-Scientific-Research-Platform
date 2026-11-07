#!/usr/bin/env python3
"""Persistent, low-cost competition discovery for Server-IA.

Runs in a systemd timer every five hours. Uses public feeds and public GitHub
metadata only: no metered LLMs, credentials, mail, code execution, or submission.
Results are discovery *candidates*, never claims of eligibility or registration.
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import fcntl
import hashlib
import html
import json
import os
import pathlib
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

STATE = pathlib.Path(os.environ.get(
    "COMPETITION_STATE_DIR", "/srv/openclaw/competition-state"
)).resolve()
USER_AGENT = "ServerIACompetitionScout/1.0 (+research; contact through repository)"
LANGUAGES = [
    ("English", "en", "US", "US:en", "AI competition hackathon 2026 registration"),
    ("Chinese", "zh-CN", "CN", "CN:zh-Hans", "人工智能 竞赛 挑战赛 报名 2026"),
    ("Spanish", "es-ES", "ES", "ES:es", "concurso inteligencia artificial hackathon inscripción 2026"),
    ("Hindi", "hi", "IN", "IN:hi", "कृत्रिम बुद्धिमत्ता प्रतियोगिता हैकाथॉन पंजीकरण 2026"),
    ("Arabic", "ar", "AE", "AE:ar", "مسابقة الذكاء الاصطناعي هاكاثون التسجيل 2026"),
    ("Portuguese", "pt-BR", "BR", "BR:pt-419", "competição inteligência artificial hackathon inscrições 2026"),
    ("Russian", "ru", "RU", "RU:ru", "конкурс искусственный интеллект хакатон регистрация 2026"),
    ("Bengali", "bn", "BD", "BD:bn", "কৃত্রিম বুদ্ধিমত্তা প্রতিযোগিতা হ্যাকাথন নিবন্ধন ২০২৬"),
    ("Japanese", "ja", "JP", "JP:ja", "人工知能 コンテスト ハッカソン 募集 2026"),
    ("German", "de", "DE", "DE:de", "KI Wettbewerb Hackathon Anmeldung 2026"),
    ("French", "fr", "FR", "FR:fr", "concours intelligence artificielle hackathon inscription 2026"),
    ("Korean", "ko", "KR", "KR:ko", "인공지능 경진대회 해커톤 참가 2026"),
    ("Vietnamese", "vi", "VN", "VN:vi", "cuộc thi trí tuệ nhân tạo hackathon đăng ký 2026"),
    ("Thai", "th", "TH", "TH:th", "การแข่งขัน ปัญญาประดิษฐ์ แฮกกาธอน สมัคร 2026"),
    ("Indonesian", "id", "ID", "ID:id", "kompetisi kecerdasan buatan hackathon pendaftaran 2026"),
    ("Turkish", "tr", "TR", "TR:tr", "yapay zeka yarışması hackathon başvuru 2026"),
    ("Urdu", "ur", "PK", "PK:ur", "مصنوعی ذہانت مقابلہ ہیکاتھون رجسٹریشن 2026"),
    ("Italian", "it", "IT", "IT:it", "concorso intelligenza artificiale hackathon iscrizione 2026"),
    ("Persian", "fa", "IR", "IR:fa", "مسابقه هوش مصنوعی هکاتون ثبت نام ۲۰۲۶"),
    ("Punjabi", "pa", "IN", "IN:hi", "ਆਰਟੀਫਿਸ਼ੀਅਲ ਇੰਟੈਲੀਜੈਂਸ ਮੁਕਾਬਲਾ ਹੈਕਾਥਨ ਰਜਿਸਟ੍ਰੇਸ਼ਨ 2026"),
]
COMPANIES = ("NVIDIA", "AMD", "Intel", "OpenAI", "Google", "Microsoft",
             "Meta", "Anthropic", "Tencent", "Alibaba", "Baidu",
             "Samsung", "IBM", "Amazon", "Huawei", "ByteDance", "xAI")
INITIAL_CONTESTS = [
    {"id": "paiec-interpretability", "title": "PAIEC / AIMO Interpretability",
     "url": "https://openreview.net/forum?id=2wAHKu3pM1",
     "deadline_note": "Verify November 2026 additional requirements",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "aimo-interpretability", "title": "AIMO Interpretability",
     "url": "https://openreview.net/",
     "deadline_note": "Verify 2026-11-05 window", "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "virtual-cell", "title": "Virtual Cell Challenge",
     "url": "https://virtualcellchallenge.org/",
     "deadline_note": "Verify 2026-11-05 registration and submission terms",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "mit-solve", "title": "MIT Solve",
     "url": "https://solve.mit.edu/",
     "deadline_note": "Verify 2026-11-06 deadline and exact track",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "kisti", "title": "KISTI challenge",
     "url": "https://www.kisti.re.kr/",
     "deadline_note": "Verify organizer, track, 2026-11-06 deadline",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "flagos-s2-track2", "title": "FlagOS Season 2 Track 2",
     "url": "https://github.com/",
     "deadline_note": "Verify official 2026-11-19 deadline",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "codabench-sleep-03", "title": "Codabench Sleep Onset track 03",
     "url": "https://www.codabench.org/competitions/17983/",
     "deadline_note": "Verify eligibility, registration and sealed phase",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "codabench-bci-02", "title": "Codabench BCI Decoding track 02",
     "url": "https://www.codabench.org/competitions/17982/",
     "deadline_note": "Verify eligibility, registration and sealed phase",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "ai4good-uae", "title": "ITU AI for Good UAE hackathon",
     "url": "https://aiforgood.itu.int/ai-for-good-sandbox-hackathon-uae-apply/",
     "deadline_note": "Verify official submission and deadline",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
    {"id": "ksa-insurance", "title": "KSA Insurance Hackathon",
     "url": "https://il.ia.gov.sa/programs/hackathon-1",
     "deadline_note": "Verify current eligibility and registration",
     "status": "REQUIRES_OFFICIAL_VERIFICATION"},
]
REPO_MATCH = ("competition", "challenge", "contest", "hackathon", "flagos",
              "aimo", "casmi", "coda", "plateau", "arena", "neurochip", "zindi")

def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def ensure_private_state() -> None:
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE.chmod(0o700)

def load_json(filename: str, default):
    try:
        with (STATE / filename).open(encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, ValueError, OSError):
        return default

def atomic_json(filename: str, obj) -> None:
    fd, temp = tempfile.mkstemp(prefix=".atomic-", dir=STATE)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(obj, file, indent=2, ensure_ascii=False, sort_keys=True)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, STATE / filename)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def fetch(url: str, timeout: int = 15) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT, "Accept": "application/xml, application/json, */*"
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(2_000_000)

def seed_inventory() -> int:
    records = load_json("portfolio.json", [])
    existing = {row.get("id") for row in records}
    added = 0
    for item in INITIAL_CONTESTS:
        if item["id"] not in existing:
            records.append({**item, "source": "previous user competition instructions",
                            "evidence": "Prior discussion; not reverified on current date",
                            "last_verified_utc": None,
                            "registration_confirmed": False,
                            "submission_confirmed": False})
            added += 1
    if added:
        atomic_json("portfolio.json", records)
    return added

def fetch_rss(language, locale, country, edition, query):
    params = urllib.parse.urlencode({
        "q": query + " when:30d",
        "hl": locale, "gl": country, "ceid": edition,
    })
    url = "https://news.google.com/rss/search?" + params
    raw = fetch(url, timeout=18)
    root = ET.fromstring(raw)
    articles = []
    for item in root.findall(".//channel/item")[:12]:
        title = html.unescape((item.findtext("title") or "").strip())
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        source = (item.findtext("source") or "").strip()
        if not title or not link.startswith("https://"):
            continue
        try:
            date = email.utils.parsedate_to_datetime(pub).isoformat()
        except (ValueError, TypeError):
            date = None
        articles.append({
            "id": hashlib.sha256((title + "|" + link).encode("utf-8")).hexdigest()[:20],
            "title": title, "url": link, "published": date, "language": language,
            "origin": source, "discovered_at_utc": utc_now(),
            "status": "DISCOVERED_UNVERIFIED", "is_official_source": False,
            "eligible": None, "deadline_verified": False,
        })
    return articles

def github_repositories():
    url = ("https://api.github.com/users/Agnuxo1/repos?"
           "per_page=100&sort=updated&direction=desc&type=public")
    raw = json.loads(fetch(url).decode("utf-8"))
    repos = []
    for repo in raw:
        name = repo.get("name", "")
        if not any(word in name.lower() for word in REPO_MATCH):
            continue
        repos.append({
            "full_name": repo.get("full_name"), "url": repo.get("html_url"),
            "description": repo.get("description"), "language": repo.get("language"),
            "last_updated": repo.get("updated_at"), "private": repo.get("private"),
        })
    return repos

def run_scout() -> int:
    ensure_private_state()
    lock_file = (STATE / "scout.lock").open("a+")
    os.chmod(STATE / "scout.lock", 0o600)
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("A scout cycle is already running; exiting without overlap.")
        return 0
    started = utc_now()
    seeded = seed_inventory()
    discoveries = load_json("discovery.json", [])
    keys = {x["id"] for x in discoveries if x.get("id")}
    new_count, successes, errors = 0, 0, []
    # Rotate priority company mentions, while keeping all 20 languages in each scan.
    scan_number = load_json("scout-status.json", {}).get("completed_scans", 0)
    featured = COMPANIES[(scan_number * 3) % len(COMPANIES):][:3]
    for language, locale, country, edition, query in LANGUAGES:
        combined = query + " (" + " OR ".join(featured) + ")"
        try:
            items = fetch_rss(language, locale, country, edition, combined)
            successes += 1
            for item in items:
                if item["id"] not in keys:
                    discoveries.append(item)
                    keys.add(item["id"])
                    new_count += 1
        except (OSError, ValueError, ET.ParseError, UnicodeError) as exc:
            errors.append({"language": language, "error_type": type(exc).__name__,
                           "message": str(exc)[:180]})
        time.sleep(0.6)
    # Cap private records to prevent unbounded disk growth.
    atomic_json("discovery.json", discoveries[-5000:])
    repo_count = 0
    try:
        repositories = github_repositories()
        repo_count = len(repositories)
        atomic_json("github-foundations.json", repositories)
    except (OSError, ValueError, TypeError) as exc:
        errors.append({"source": "github", "error_type": type(exc).__name__,
                       "message": str(exc)[:180]})
    status = {
        "started_utc": started, "finished_utc": utc_now(),
        "completed_scans": scan_number + 1,
        "languages_configured": len(LANGUAGES),
        "language_requests_succeeded": successes,
        "discovery_total": len(discoveries[-5000:]),
        "new_candidates": new_count,
        "seeded_competitions": seeded,
        "public_github_foundations": repo_count,
        "errors": errors,
        "autonomous_llm_enabled": False,
        "jev_oracle_connected": False,
        "submissions_enabled": False,
        "note": "All discoveries are unverified; no paid API requests or GPU jobs.",
    }
    atomic_json("scout-status.json", status)
    print(json.dumps(status, ensure_ascii=False))
    return 0 if successes > 0 or repo_count > 0 else 2

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()
    if args.health:
        print(json.dumps(load_json("scout-status.json", {
            "status": "NOT_RUN"
        }), ensure_ascii=False, indent=2))
        return 0
    ensure_private_state()
    if args.seed_only:
        print("New unverified inventory items:", seed_inventory())
        return 0
    return run_scout()

if __name__ == "__main__":
    sys.exit(main())
