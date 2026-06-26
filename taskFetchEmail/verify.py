"""
verify.py — Playwright-based Google Maps verification for full/ CSVs.

Picks 50 random entries per file, searches each business name on
Google Maps, re-scrapes the listing, and compares the scraped
name/phone/website against the CSV values.

Uses asyncio with Playwright async API for concurrent contexts.
"""

import asyncio
import csv
import os
import random
import re
import time

from playwright.async_api import async_playwright

DIR = os.path.dirname(os.path.abspath(__file__))
FULL_DIR = os.path.join(DIR, "full")
FILES = ["p1_full.csv", "p2_full.csv", "p3_full.csv"]
SAMPLE_SIZE = 10
CONCURRENCY = 6

JUNK_CHARS = ["\ue0f0", "\uf0b0", "\uf597", "\ue315", "\ue5cd",
              "\ue89e", "\ue889", "\n", "\r", "\t"]


def clean_text(text):
    if not text:
        return ""
    for j in JUNK_CHARS:
        text = text.replace(j, " ")
    return " ".join(text.split()).strip()


async def safe_text(locator):
    try:
        if await locator.count() > 0:
            return clean_text(await locator.first.inner_text(timeout=3000))
    except:
        pass
    return ""


def get_maps_url(row):
    link = (row.get("link") or "").strip()
    if link:
        return link
    data_id = (row.get("data_id") or "").strip()
    if data_id:
        return f"https://www.google.com/maps?ftid={data_id}"
    lat = (row.get("latitude") or "").strip()
    lng = (row.get("longitude") or "").strip()
    if lat and lng:
        return f"https://www.google.com/maps?q={lat},{lng}"
    return None


async def visit_and_scrape(context, maps_url):
    """Navigate directly to a Google Maps listing URL and scrape data."""
    page = await context.new_page()
    result = {
        "scraped_name": "",
        "scraped_phone": "",
        "scraped_website": "",
        "status": "ok",
        "note": "",
    }

    try:
        await page.goto(maps_url, timeout=60000)
        await asyncio.sleep(random.uniform(4, 7))

        try:
            await page.wait_for_selector("h1.DUwDvf", timeout=15000)
        except:
            result["status"] = "no_panel"
            result["note"] = "Business panel did not load"
            await page.close()
            return result

        try:
            result["scraped_name"] = clean_text(
                await page.locator("h1.DUwDvf").first.inner_text(timeout=5000)
            )
        except:
            pass

        try:
            phone = page.locator('button[data-item-id^="phone"]')
            txt = await safe_text(phone)
            txt = re.sub(r'[^0-9+ ]', '', txt)
            result["scraped_phone"] = txt.strip()
        except:
            pass

        try:
            website = page.locator('a[data-item-id="authority"]')
            if await website.count() > 0:
                href = await website.first.get_attribute("href")
                if href:
                    result["scraped_website"] = href
        except:
            pass

    except Exception as e:
        result["status"] = "error"
        result["note"] = str(e)[:100]
    finally:
        await page.close()

    return result


def compare(name_csv, phone_csv, website_csv, scraped):
    mismatches = {}
    s_name = scraped.get("scraped_name", "")
    s_phone = scraped.get("scraped_phone", "")
    s_website = scraped.get("scraped_website", "")

    if name_csv and len(name_csv) > 2:
        if s_name:
            if name_csv.lower() not in s_name.lower() and s_name.lower() not in name_csv.lower():
                mismatches["name"] = (name_csv, s_name)

    if phone_csv:
        p_csv_clean = re.sub(r'\.0$|[^\d]', '', phone_csv).lstrip('0')
        p_sc_clean = re.sub(r'[^\d]', '', s_phone).lstrip('0')
        if p_csv_clean and p_sc_clean and p_csv_clean != p_sc_clean:
            mismatches["phone"] = (phone_csv, s_phone)

    if website_csv and s_website:
        def domain(u):
            u = u.strip().lower()
            if not u.startswith("http"):
                u = "https://" + u
            return re.sub(r'^https?://(www\.)?', '', u).rstrip('/')
        if domain(website_csv) != domain(s_website):
            mismatches["website"] = (website_csv, s_website)

    return mismatches


async def verify_one(context, idx, row):
    name_csv = (row.get("title") or "").strip()
    phone_csv = (row.get("phone") or "").strip()
    website_csv = (row.get("website") or "").strip()

    maps_url = get_maps_url(row)
    if not maps_url:
        return (idx, row, {"status": "no_url", "note": "No link or data_id+coords", "mismatches": {}})

    scraped = await visit_and_scrape(context, maps_url)
    mismatches = compare(name_csv, phone_csv, website_csv, scraped)
    scraped["mismatches"] = mismatches
    return (idx, row, scraped)


async def verify_file(fname, browser):
    path = os.path.join(FULL_DIR, fname)
    if not os.path.exists(path):
        print(f"[SKIP] {fname} — not found")
        return

    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    candidates = [r for r in rows if (r.get("title") or "").strip()]
    if not candidates:
        print(f"[SKIP] {fname} — no rows with title")
        return

    sample = random.sample(candidates, min(SAMPLE_SIZE, len(candidates)))

    print(f"\n{'='*70}")
    print(f"  {fname} — verifying {len(sample)} entries via Google Maps")
    print(f"{'='*70}")

    sem = asyncio.Semaphore(CONCURRENCY)

    async def worker(idx, row):
        async with sem:
            context = await browser.new_context(
                viewport={"width": 1400, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            try:
                return await verify_one(context, idx, row)
            finally:
                await context.close()

    tasks = [worker(i, row) for i, row in enumerate(sample)]
    results = await asyncio.gather(*tasks)
    results.sort(key=lambda x: x[0])

    total_ok = 0
    total_mismatch = 0
    total_error = 0
    field_mismatches = {"name": 0, "phone": 0, "website": 0}
    field_checked = {"name": 0, "phone": 0, "website": 0}

    for idx, row, res in results:
        name_csv = (row.get("title") or "?").strip()[:40]
        phone_csv = (row.get("phone") or "-").strip()[:25]
        website_csv = (row.get("website") or "-").strip()

        status = res["status"]
        note = res["note"]
        mismatches = res.get("mismatches", {})

        is_ok = status == "ok" and not mismatches
        if is_ok:
            total_ok += 1
        elif status == "ok" and mismatches:
            total_mismatch += 1
        else:
            total_error += 1

        for field in mismatches:
            field_mismatches[field] += 1

        for field in ["name", "phone", "website"]:
            if (row.get(field) or "").strip() and res.get(f"scraped_{field}"):
                field_checked[field] += 1

        if mismatches or status != "ok":
            status_tag = {"no_url": "[NU]", "no_panel": "[NP]", "error": "[ER]"}.get(status, "[MM]")
            print(f"\n  {idx+1:>2}. {status_tag} {name_csv}")
            if status == "ok":
                for field, (csv_val, sc_val) in mismatches.items():
                    print(f"       {field}: CSV='{csv_val}'  vs  MAPS='{sc_val}'")
            else:
                print(f"       Status: {note or status}")
        else:
            print(f"  {idx+1:>2}. [OK] {name_csv}")

    print(f"\n  ┌─ Results for {fname}")
    print(f"  ├─ Matched OK:     {total_ok}")
    print(f"  ├─ Mismatched:     {total_mismatch}")
    print(f"  ├─ Errors/NoData:  {total_error}")
    if field_mismatches["name"]:
        print(f"  ├─ Name mismatches:    {field_mismatches['name']}/{field_checked['name']}")
    if field_mismatches["phone"]:
        print(f"  ├─ Phone mismatches:   {field_mismatches['phone']}/{field_checked['phone']}")
    if field_mismatches["website"]:
        print(f"  └─ Website mismatches: {field_mismatches['website']}/{field_checked['website']}")


async def main():
    random.seed(42)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=300,
        )
        try:
            for fname in FILES:
                await verify_file(fname, browser)
        finally:
            await browser.close()

    print("\n[DONE] Verification complete.")


if __name__ == "__main__":
    asyncio.run(main())
