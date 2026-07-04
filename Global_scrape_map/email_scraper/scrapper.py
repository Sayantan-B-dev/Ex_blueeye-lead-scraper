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


def get_logger(log_path):
    logger = logging.getLogger(str(log_path))
    logger.setLevel(logging.DEBUG)
    if not logger.handlers:
        fh = logging.FileHandler(log_path, mode="a", encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter("%(asctime)s  %(message)s", datefmt="%H:%M:%S"))
        logger.addHandler(fh)
    return logger


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


def load_attempted(log_path):
    if not log_path.exists():
        return set()
    attempted = set()
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 3:
                site = parts[2].rstrip("/").split("/")[0]
                if site and "." in site:
                    attempted.add(site)
    return attempted


async def process_country(csv_path, is_shallow):
    country = csv_path.stem
    out_path = OUTPUT_DIR / csv_path.name
    log_path = LOG_DIR / f"{country}.log"

    log = get_logger(log_path)
    attempted = load_attempted(log_path) if log_path.exists() else set()

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]
        rows = list(reader)

    if "website_status" not in fieldnames:
        idx = fieldnames.index("website") + 1 if "website" in fieldnames else len(fieldnames)
        fieldnames.insert(idx, "website_status")
    if "emails" not in fieldnames:
        fieldnames.append("emails")

    to_scrape = []
    skipped_log = 0
    skipped_email = 0
    for i, row in enumerate(rows):
        w = row.get("website", "").strip()
        e = row.get("emails", "").strip()
        s = row.get("website_status", "").strip()
        row.setdefault("website_status", "")
        row.setdefault("emails", "")
        if not w:
            continue
        if e:
            skipped_email += 1
            continue
        domain = w.rstrip("/").split("//")[-1].split("/")[0]
        if domain in attempted:
            skipped_log += 1
            row["website_status"] = "resumed"
            continue
        if is_shallow and s != "ok_no_email":
            skipped_log += 1
            continue
        to_scrape.append(i)

    if not to_scrape:
        print(f"{country:25s} nothing to scrape (email={skipped_email}, log_skip={skipped_log})")
        # still write partial progress if output doesn't exist
        if not out_path.exists():
            tmp = out_path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)
            tmp.replace(out_path)
        return

    print(f"{country:25s} {len(to_scrape):>6} to scan  (email_skip={skipped_email}, log_skip={skipped_log})")
    log.info("Starting — %s URLs, shallow=%s", len(to_scrape), is_shallow)

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
            domain = website.rstrip("/").split("//")[-1].split("/")[0]
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

            line = f"{status:15s} {domain}"
            if emails:
                line += f"  {'; '.join(emails)}"
            log.info(line)

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
    log.info("Done — %s/%s  found=%s  no_email=%s  errors=%s  elapsed=%ss",
             done, total, found, no_email, errors, int(elapsed))


async def main():
    is_shallow = "--shallow" in sys.argv
    is_fast = "--fast" in sys.argv
    if is_fast:
        is_shallow = False

    global semaphore
    semaphore = asyncio.Semaphore(CONCURRENCY)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    csv_files = sorted(INPUT_DIR.glob("*.csv"))
    if not csv_files:
        print(f"No CSVs found in {INPUT_DIR}")
        sys.exit(1)

    print(f"Mode: {'shallow' if is_shallow else 'fast (homepage only)'}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Logs:   {LOG_DIR}")
    print()

    for csv_path in csv_files:
        await process_country(csv_path, is_shallow=is_shallow)


if __name__ == "__main__":
    import logging
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    asyncio.run(main())
