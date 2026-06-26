"""
verify_mail.py — 10-threaded email verification, only targeting reachable websites.

Picks 50 random entries per file (that have both website and email),
first checks website reachability, then only for reachable sites
verifies whether the CSV emails actually appear on the page.
"""

import csv
import os
import random
import re
import threading
from queue import Queue, Empty as QueueEmpty

import requests
from requests.exceptions import RequestException
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DIR = os.path.dirname(os.path.abspath(__file__))
FULL_DIR = os.path.join(DIR, "full")
FILES = ["p1_full.csv", "p2_full.csv", "p3_full.csv"]
SAMPLE_SIZE = 50
THREADS = 10
TIMEOUT = 12
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})
session.verify = False


def normalize_url(url):
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def check_reachability(url):
    """Return (True, http_code) if reachable, else (False, error_msg)."""
    try:
        resp = session.get(url, timeout=TIMEOUT)
        if resp.status_code < 400:
            return True, resp.text
        return False, f"HTTP {resp.status_code}"
    except requests.exceptions.SSLError:
        return False, "SSL error"
    except requests.exceptions.ConnectionError:
        return False, "DNS / connection error"
    except requests.exceptions.Timeout:
        return False, "Timeout"
    except RequestException as e:
        return False, str(e)[:60]


def verify_row(row):
    website = (row.get("website") or "").strip()
    emails_raw = (row.get("emails") or "").strip()

    if not website or not emails_raw:
        return None

    url = normalize_url(website)
    emails = [e.strip() for e in emails_raw.split(";") if e.strip()]
    if not emails:
        return None

    reachable, body_or_err = check_reachability(url)

    result = {
        "reachable": reachable,
        "note": body_or_err if not reachable else "",
        "emails_on_page": {},
    }

    if reachable:
        for em in emails:
            result["emails_on_page"][em] = em in body_or_err
    else:
        for em in emails:
            result["emails_on_page"][em] = False

    return result


def worker(q, results, lock):
    while True:
        try:
            item = q.get_nowait()
        except QueueEmpty:
            return
        idx, row = item
        res = verify_row(row)
        with lock:
            results.append((idx, row, res))
        q.task_done()


def verify_file(fname):
    path = os.path.join(FULL_DIR, fname)
    if not os.path.exists(path):
        print(f"[SKIP] {fname} — not found")
        return

    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    candidates = [
        r for r in rows
        if (r.get("website") or "").strip() and (r.get("emails") or "").strip()
    ]
    if not candidates:
        print(f"[SKIP] {fname} — no rows with both website and email")
        return

    sample = random.sample(candidates, min(SAMPLE_SIZE, len(candidates)))

    print(f"\n{'='*70}")
    print(f"  {fname} — picked {len(sample)} entries, filtering to reachable websites only")
    print(f"{'='*70}")

    q = Queue()
    for i, row in enumerate(sample):
        q.put((i, row))

    results = []
    lock = threading.Lock()
    threads = []

    for _ in range(THREADS):
        t = threading.Thread(target=worker, args=(q, results, lock), daemon=True)
        t.start()
        threads.append(t)

    q.join()
    for t in threads:
        t.join()

    results.sort(key=lambda x: x[0])

    reachable = 0
    unreachable = 0
    email_found_rows = 0
    email_found_count = 0
    email_total_count = 0

    for idx, row, res in results:
        title = (row.get("title") or "?").strip()[:40]
        website = (row.get("website") or "").strip()
        emails_raw = (row.get("emails") or "").strip()
        emails = [e.strip() for e in emails_raw.split(";") if e.strip()]

        if res is None:
            print(f"  {idx+1:>2}. {title:<40} [SKIP] no data")
            continue

        if res["reachable"]:
            reachable += 1
            em_results = res["emails_on_page"]
            row_has_any = False
            parts = []
            for em in emails:
                found = em_results.get(em, False)
                parts.append(f"{em} [{'✓' if found else '✗'}]")
                if found:
                    row_has_any = True
                    email_found_count += 1
                email_total_count += 1
            if row_has_any:
                email_found_rows += 1

            print(f"  {idx+1:>2}. {title:<40} [OK] reachable")
            print(f"       {website}")
            print(f"       {'; '.join(parts)}")
        else:
            unreachable += 1
            print(f"  {idx+1:>2}. {title:<40} [SKIP] {res['note']}")

    reachable_pct = reachable / len(sample) * 100

    print(f"\n  ┌─ Results for {fname}")
    print(f"  ├─ Reachable:       {reachable}/{len(sample)} ({reachable_pct:.0f}%)")
    print(f"  ├─ Unreachable:     {unreachable}/{len(sample)} ({unreachable/len(sample)*100:.0f}%)")
    if reachable:
        em_row_pct = email_found_rows / reachable * 100
        em_indiv_pct = email_found_count / email_total_count * 100
        print(f"  ├─ Rows with email found:   {email_found_rows}/{reachable} ({em_row_pct:.0f}%)")
        print(f"  └─ Individual emails found: {email_found_count}/{email_total_count} ({em_indiv_pct:.0f}%)")
    else:
        print(f"  └─ No reachable sites — nothing to verify")


def main():
    random.seed(42)
    for fname in FILES:
        verify_file(fname)
    print("\n[DONE] Verification complete.")


if __name__ == "__main__":
    main()
