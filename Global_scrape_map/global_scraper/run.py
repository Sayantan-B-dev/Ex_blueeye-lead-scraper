"""
Global Google Maps scraper — mirrors method2/run.sh pattern:
  -fast-mode -geo per country, output redirected to log file,
  resume via CSV row check, PID tracking via subprocess.Popen.
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pandas as pd
from geo_data import get_geo

ROOT = Path(__file__).parent
BATCHES_DIR = ROOT / "batches"
OUTPUT_DIR = ROOT / "output"
LOG_DIR = ROOT / "logs"
IMAGE_NAME = "gosom/google-maps-scraper:latest"
MAX_CONCURRENT = 4

DOCKER_ENV = os.environ.copy()
DOCKER_ENV["MSYS_NO_PATHCONV"] = "1"


def parse_batch_file(batch_file):
    first = batch_file.read_text(encoding="utf-8").splitlines()[0]
    parts = first.split(" in ", 1)[1]
    state, country = parts.rsplit(", ", 1)
    return country, state


def csv_rows(path):
    """Return number of data rows in a CSV (method2-style resume check)."""
    if not path.exists():
        return 0
    try:
        df = pd.read_csv(path, encoding="utf-8-sig")
        return len(df)
    except Exception:
        return 0


def run():
    parser = argparse.ArgumentParser(description="Global Google Maps scraper")
    parser.add_argument(
        "--concurrent", type=int, default=MAX_CONCURRENT,
        help="Number of parallel Docker containers (default: 4)"
    )
    parser.add_argument(
        "--image", default=IMAGE_NAME,
        help=f"Docker image (default: {IMAGE_NAME})"
    )
    args = parser.parse_args()

    max_concurrent = args.concurrent
    image_name = args.image

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    batch_files = sorted(BATCHES_DIR.glob("*.txt"))
    if not batch_files:
        print(f"No batch files found in {BATCHES_DIR}/")
        print("Run split_queries.py first.")
        sys.exit(1)

    # Migration: if country CSV has data but no .done files exist yet,
    # create .done markers for its batches so they aren't re-scraped.
    existing_countries = set()
    for f in OUTPUT_DIR.glob("*.csv"):
        if not f.name.startswith(".tmp") and csv_rows(f) > 0:
            existing_countries.add(f.stem)

    # Build pending list — resume: skip if .done marker exists
    pending = []
    skipped = 0
    for batch_file in batch_files:
        stem = batch_file.stem
        country, state = parse_batch_file(batch_file)
        done_file = OUTPUT_DIR / f"{stem}.done"
        if done_file.exists():
            skipped += 1
            continue
        # If country CSV already has data, mark this batch done
        if country in existing_countries:
            done_file.write_text("", encoding="utf-8")
            skipped += 1
            continue
        # Also skip if temp CSV has data (container was mid-run on crash)
        temp_csv = OUTPUT_DIR / f".tmp_{stem}.csv"
        if csv_rows(temp_csv) > 0:
            temp_csv.unlink()
            done_file.write_text("", encoding="utf-8")
            skipped += 1
            continue
        pending.append((country, state, batch_file))

    total_pending = len(pending)
    total_all = skipped + total_pending

    if not pending:
        total_leads = sum(csv_rows(OUTPUT_DIR / f.name) for f in OUTPUT_DIR.glob("*.csv") if not f.name.startswith(".tmp"))
        print(f"ALL DONE -- {total_all} batches, {total_leads} total leads")
        return

    print(f"Global scraper -- {total_all} total batches, {total_pending} to run")
    print(f"  Concurrency: {max_concurrent}, Image: {image_name}")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"  Logs:   {LOG_DIR}/")
    print()

    # Verify Docker responsive
    try:
        subprocess.run(
            ["docker", "version", "--format", "{{.Server.Version}}"],
            capture_output=True, timeout=15, env=DOCKER_ENV,
            check=True,
        )
    except Exception:
        print("ERROR: Docker is not running or not found.")
        print("Start Docker Desktop and try again.")
        sys.exit(1)

    # Verify/pull image
    result = subprocess.run(
        ["docker", "image", "inspect", image_name],
        capture_output=True, text=True, timeout=30, env=DOCKER_ENV,
    )
    if result.returncode != 0:
        print(f"Pulling Docker image: {image_name} ...")
        subprocess.run(
            ["docker", "pull", image_name],
            check=True, timeout=300, env=DOCKER_ENV,
        )

    # Pre-create empty CSVs so gosom can write (matching method2)
    for _, _, batch_file in pending:
        temp_csv = OUTPUT_DIR / f".tmp_{batch_file.stem}.csv"
        temp_csv.write_text("", encoding="utf-8")

    # Launch containers in waves — method2 pattern
    index = 0
    procs = {}  # stem -> Popen object
    completed = 0
    failed = 0

    while index < len(pending) or procs:
        while len(procs) < max_concurrent and index < len(pending):
            country, state, batch_file = pending[index]
            stem = batch_file.stem
            temp_csv = OUTPUT_DIR / f".tmp_{stem}.csv"
            log_file = LOG_DIR / f"{stem}.log"
            geo = get_geo(country)

            cmd = [
                "docker", "run", "--rm",
                "-v", "gmaps-playwright-cache:/opt",
                "-v", f"{batch_file}:/queries.txt:ro",
                "-v", f"{OUTPUT_DIR}:/out",
                image_name,
                "-input", "/queries.txt",
                "-results", f"/out/{temp_csv.name}",
                "-depth", "60",
                "-fast-mode",
                "-geo", geo,
                "-c", "12",
                "-exit-on-inactivity", "3m",
            ]

            print(f"  {stem} -- launching... (geo: {geo})")

            with log_file.open("a", encoding="utf-8") as lf:
                proc = subprocess.Popen(
                    cmd,
                    stdout=lf,
                    stderr=subprocess.STDOUT,
                    env=DOCKER_ENV,
                )

            procs[stem] = (proc, country, state, temp_csv, log_file)
            index += 1

        # Poll running containers every 5s (method2 pattern)
        while procs:
            for stem in list(procs.keys()):
                proc, country, state, temp_csv, log_file = procs[stem]
                if proc.poll() is not None:
                    proc.wait()
                    del procs[stem]

                    done_file = OUTPUT_DIR / f"{stem}.done"
                    rows = csv_rows(temp_csv)
                    if rows > 0:
                        try:
                            df = pd.read_csv(temp_csv, encoding="utf-8-sig")
                            if not df.empty:
                                df["country"] = country
                                df["state"] = state

                                country_csv = OUTPUT_DIR / f"{country}.csv"
                                file_exists = country_csv.exists() and country_csv.stat().st_size > 0
                                # Validate existing CSV before appending (crash safety)
                                if file_exists:
                                    try:
                                        pd.read_csv(country_csv, encoding="utf-8-sig", nrows=1)
                                    except Exception:
                                        file_exists = False
                                df.to_csv(
                                    country_csv, mode="a" if file_exists else "w",
                                    header=not file_exists,
                                    index=False, encoding="utf-8-sig"
                                )

                                print(f"  {stem} -- done ({rows} leads -> {country_csv.name})")
                                done_file.write_text("", encoding="utf-8")
                                completed += 1
                            else:
                                print(f"  {stem} -- empty CSV")
                                failed += 1
                        except Exception as e:
                            print(f"  {stem} -- post-process error: {e}")
                            failed += 1
                    else:
                        exit_code = proc.returncode
                        if exit_code != 0:
                            print(f"  {stem} -- FAILED (exit={exit_code})")
                            failed += 1
                        else:
                            print(f"  {stem} -- 0 results")
                            done_file.write_text("", encoding="utf-8")
                            completed += 1

                    # Clean up temp file
                    if temp_csv.exists():
                        temp_csv.unlink()

                    remaining = total_pending - (completed + failed + len(procs))
                    print(f"  Progress: {completed} done, {failed} failed, {remaining} left")
                    print()
                    break

            if procs:
                time.sleep(5)

    print()
    print("=" * 55)
    print(f"  ALL DONE -- {completed} batches processed")
    if failed:
        print(f"  FAILED: {failed}")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"  Logs:   {LOG_DIR}/")
    print("=" * 55)


if __name__ == "__main__":
    run()
