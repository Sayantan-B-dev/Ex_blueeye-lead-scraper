import asyncio
import csv
import os
import re
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import urlparse, urljoin

import aiohttp
from aiohttp import ClientTimeout, ClientError

CONCURRENCY = 50
TIMEOUT = 10
MAX_SHALLOW = 5
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
SKIP_DOMAIN_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".js"}
SKIP_EMAIL_DOMAINS = {"example.com", "domain.com", "domain.net", "yourdomain.com"}
PRIORITY_KEYWORDS = ["contact", "about", "email", "reach", "connect"]
COMMON_PATHS = [
    "/contact", "/contact-us", "/contactus", "/contact.html",
    "/about", "/about-us", "/aboutus", "/reach-us",
    "/get-in-touch", "/enquiry", "/connect", "/support",
]

BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "cleaned_missing_emails"
OUTPUT_DIR = BASE_DIR / "no_missing_emails"
LOG_DIR = BASE_DIR / "logs"

semaphore: asyncio.Semaphore = None


def decode_cfemail(hex_str):
    try:
        key = int(hex_str[:2], 16)
        data = bytes.fromhex(hex_str[2:])
        return "".join(chr(b ^ key) for b in data)
    except (ValueError, IndexError):
        return ""


def extract_emails(text):
    found = EMAIL_REGEX.findall(text)
    seen = set()
    result = []
    for e in found:
        e = e.lower().strip()
        local, domain = e.split("@", 1)
        if any(domain.endswith(ext) for ext in SKIP_DOMAIN_EXTS):
            continue
        if domain in SKIP_EMAIL_DOMAINS:
            continue
        if local.startswith(".") or local.endswith("."):
            continue
        if e not in seen:
            seen.add(e)
            result.append(e)
    for cf in re.findall(r'data-cfemail=["\']([a-fA-F0-9]+)["\']', text):
        decoded = decode_cfemail(cf)
        if decoded and decoded not in seen:
            seen.add(decoded)
            result.append(decoded)
    return result


def normalize_url(url):
    url = url.strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def priority_score(url):
    path = urlparse(url).path.lower()
    score = 0
    for kw in PRIORITY_KEYWORDS:
        if kw in path:
            score += 10
    if path in ("", "/", "/index.html"):
        score = -10
    return -score


def find_internal_links(html, base_url):
    domain = urlparse(base_url).netloc
    scheme = urlparse(base_url).scheme
    links = set()
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html):
        href = m.group(1).strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        if href.startswith("//"):
            href = scheme + ":" + href
        if not href.startswith(("http://", "https://")):
            href = urljoin(base_url, href)
        parsed = urlparse(href)
        if parsed.netloc and parsed.netloc != domain:
            continue
        path = parsed.path.lower()
        if any(path.endswith(ext) for ext in (".pdf", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".mp3", ".mp4", ".rar", ".exe")):
            continue
        links.add(href)
    return links


def contact_candidates(base_url):
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return {base + p for p in COMMON_PATHS}


async def fetch(session, url):
    async with semaphore:
        try:
            async with session.get(
                url, timeout=ClientTimeout(total=TIMEOUT),
                allow_redirects=True, ssl=False,
            ) as resp:
                if resp.status == 200:
                    return await resp.text(), "ok"
                return "", f"status_{resp.status}"
        except asyncio.TimeoutError:
            return "", "timeout"
        except ClientError as e:
            msg = str(e).lower()
            if "getaddrinfo" in msg or "name or service" in msg:
                return "", "dns_error"
            return "", "connection_error"
        except Exception:
            return "", "error"


async def fetch_homepage(session, website):
    url = normalize_url(website)
    if not url:
        return [], ""
    html, status = await fetch(session, url)
    if status != "ok":
        return [], status
    emails = extract_emails(html)
    return emails, "ok" if emails else "ok_no_email"


async def fetch_shallow(session, website):
    url = normalize_url(website)
    if not url:
        return [], ""
    html, status = await fetch(session, url)
    if status != "ok":
        return [], status
    emails = extract_emails(html)
    seen = set(emails)
    if emails:
        return emails, "ok"
    discovered = set()
    discovered |= find_internal_links(html, url)
    discovered |= contact_candidates(url)
    discovered.discard(url)
    if not discovered:
        return [], "ok_no_email"
    sorted_urls = sorted(discovered, key=priority_score)
    for page_url in sorted_urls[:MAX_SHALLOW]:
        page_html, page_status = await fetch(session, page_url)
        if page_status == "ok":
            for e in extract_emails(page_html):
                if e not in seen:
                    seen.add(e)
                    emails.append(e)
        if emails:
            return emails, "ok"
    return [], "ok_no_email"


async def process_country(csv_path, is_shallow):
    country = csv_path.stem
    out_path = OUTPUT_DIR / csv_path.name
    log_path = LOG_DIR / f"{country}.log"

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]
        rows = list(reader)

    if "website_status" not in fieldnames:
        idx = fieldnames.index("website") + 1 if "website" in fieldnames else len(fieldnames)
        fieldnames.insert(idx, "website_status")
    if "emails" not in fieldnames:
        fieldnames.append("emails")

    # Load previous output if exists — use for resume
    prev_rows = {}
    if out_path.exists():
        with open(out_path, "r", encoding="utf-8-sig") as f:
            rdr = csv.DictReader(f)
            for r in rdr:
                w = r.get("website", "").strip()
                if w:
                    prev_rows[w] = r

    to_scrape = []
    skipped = 0
    for i, row in enumerate(rows):
        w = row.get("website", "").strip()
        e = row.get("emails", "").strip()
        s = row.get("website_status", "").strip()
        row.setdefault("website_status", "")
        row.setdefault("emails", "")

        if not w:
            continue

        # Carry over from previous output if already done
        if w in prev_rows:
            pr = prev_rows[w]
            pe = pr.get("emails", "").strip()
            ps = pr.get("website_status", "").strip()
            if pe or ps:
                row["emails"] = pe
                row["website_status"] = ps
                skipped += 1
                continue

        if e:
            skipped += 1
            continue

        # For shallow pass, only process rows that were ok_no_email in fast pass
        if is_shallow and s != "ok_no_email":
            skipped += 1
            continue

        to_scrape.append(i)

    if not to_scrape:
        print(f"{country:25s} nothing to scrape  (resume_skip={skipped})")
        if not out_path.exists():
            tmp = out_path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)
            tmp.replace(out_path)
        return

    print(f"{country:25s} {len(to_scrape):>6} to scan  (resume_skip={skipped})")

    connector = aiohttp.TCPConnector(limit=CONCURRENCY, limit_per_host=5, force_close=True)
    timeout = ClientTimeout(total=TIMEOUT + 3)
    async with aiohttp.ClientSession(
        connector=connector, timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Connection": "close"},
    ) as session:
        total = len(to_scrape)
        found = no_email = errors = done = 0
        start_ts = time.time()
        next_save = 50
        save_lock = asyncio.Lock()

        async def worker(idx):
            nonlocal found, no_email, errors, done, next_save
            website = rows[idx].get("website", "").strip()
            try:
                if is_shallow:
                    emails, status = await fetch_shallow(session, website)
                else:
                    emails, status = await fetch_homepage(session, website)
            except Exception:
                emails, status = [], "error"
                traceback.print_exc()

            rows[idx]["emails"] = "; ".join(emails)
            rows[idx]["website_status"] = status

            if emails:
                found += 1
            elif status in ("ok", "ok_no_email"):
                no_email += 1
            else:
                errors += 1
            done += 1

            if done >= next_save or done >= total:
                async with save_lock:
                    if done >= next_save or done >= total:
                        tmp = out_path.with_suffix(".tmp")
                        with open(tmp, "w", encoding="utf-8", newline="") as f:
                            w = csv.DictWriter(f, fieldnames=fieldnames)
                            w.writeheader()
                            w.writerows(rows)
                        tmp.replace(out_path)
                        next_save = done + 50

        tasks = [worker(idx) for idx in to_scrape]
        batch_size = CONCURRENCY * 2
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            await asyncio.gather(*batch)
            elapsed = time.time() - start_ts
            rate = done / elapsed if elapsed > 0 else 0
            remain = (total - done) / rate if rate > 0 else 0
            sys.stdout.write(
                f"\r  {done}/{total}  "
                f"found={found}  no_email={no_email}  errors={errors}  "
                f"rate={rate:.0f}/s  eta={remain:.0f}s  "
            )
            sys.stdout.flush()

    elapsed = time.time() - start_ts
    print(f"\r  Done {done}/{total}  "
          f"found={found}  no_email={no_email}  errors={errors}  "
          f"in {elapsed:.0f}s  ")


async def main():
    is_shallow = "--shallow" in sys.argv
    if "--fast" in sys.argv:
        is_shallow = False

    global semaphore
    semaphore = asyncio.Semaphore(CONCURRENCY)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    source_dir = OUTPUT_DIR if is_shallow else INPUT_DIR
    csv_files = sorted(source_dir.glob("*.csv"))
    if not csv_files:
        print(f"No CSVs found in {source_dir}")
        sys.exit(1)

    print(f"Mode: {'shallow' if is_shallow else 'fast (homepage only)'}")
    print(f"Input:  {source_dir}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    for csv_path in csv_files:
        await process_country(csv_path, is_shallow=is_shallow)


if __name__ == "__main__":
    import logging
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    # Suppress noisy asyncio connection-reset warnings on Windows
    asyncio.run(main())
