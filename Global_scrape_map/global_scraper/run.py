"""
Global Google Maps scraper using gosom/google-maps-scraper Docker containers.
4 parallel containers. Each country-state batch produces a CSV with
`country` and `state` columns appended. One CSV per country. One log per country.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pandas as pd

ROOT = Path(__file__).parent
BATCHES_DIR = ROOT / "batches"
OUTPUT_DIR = ROOT / "output"
LOG_DIR = ROOT / "logs"
IMAGE_NAME = "gosom/google-maps-scraper:latest"
MAX_CONCURRENT = 4


def slugify(text):
    return text.replace(" ", "_").replace("/", "_").replace(",", "").replace("-", "_")


def log_write(log_file, message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with log_file.open("a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {message}\n")


def parse_batch_file(batch_file):
    first = batch_file.read_text(encoding="utf-8").splitlines()[0]
    parts = first.split(" in ", 1)[1]
    state, country = parts.rsplit(", ", 1)
    return country, state


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

    # Build pending list — collect all batches not yet marked .done
    pending = []
    done_total = 0
    for batch_file in batch_files:
        stem = batch_file.stem
        done_file = OUTPUT_DIR / f"{stem}.done"
        if done_file.exists():
            done_total += 1
            continue

        country, state = parse_batch_file(batch_file)
        pending.append((country, state, batch_file))

    total_pending = len(pending)
    total_all = done_total + total_pending

    if not pending:
        print(f"All {total_all} batches already done. Nothing to run.")
        return

    print(f"Global scraper — {total_all} total batches, {total_pending} pending")
    print(f"  Concurrency: {max_concurrent}, Image: {image_name}")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"  Logs:   {LOG_DIR}/")
    print()

    # Verify Docker availability
    try:
        subprocess.run(
            ["docker", "info"],
            capture_output=True, text=True, check=True, timeout=10
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: Docker is not running or not found.")
        print("Start Docker Desktop and try again.")
        sys.exit(1)

    # Verify image is pulled
    result = subprocess.run(
        ["docker", "image", "inspect", image_name],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        print(f"Pulling Docker image: {image_name} ...")
        subprocess.run(
            ["docker", "pull", image_name],
            check=True, timeout=300,
        )

    index = 0
    procs = {}
    completed = 0
    failed = 0

    while index < len(pending) or procs:
        while len(procs) < max_concurrent and index < len(pending):
            country, state, batch_file = pending[index]
            batch_stem = batch_file.stem
            temp_csv_name = f".tmp_{batch_stem}.csv"
            temp_csv = OUTPUT_DIR / temp_csv_name
            log_file = LOG_DIR / f"{slugify(country)}.log"

            cmd = [
                "docker", "run", "--rm",
                "-v", "gmaps-playwright-cache:/opt",
                "-v", f"{batch_file}:/queries.txt:ro",
                "-v", f"{OUTPUT_DIR}:/out",
                image_name,
                "-input", "/queries.txt",
                "-results", f"/out/{temp_csv_name}",
                "-depth", "60",
                "-fast-mode",
                "-c", "12",
                "-exit-on-inactivity", "3m",
            ]

            log_write(log_file, f"LAUNCH: {batch_stem}")
            print(f"  [{index+1}/{total_pending}] {batch_stem} -- launching...")

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            procs[proc.pid] = (proc, country, state, batch_file, log_file, temp_csv, batch_stem)
            index += 1

        if not procs:
            break

        for pid in list(procs.keys()):
            proc, country, state, batch_file, log_file, temp_csv, batch_stem = procs[pid]
            if proc.poll() is not None:
                stdout, stderr = proc.communicate()

                if proc.returncode == 0 and temp_csv.exists():
                    try:
                        df = pd.read_csv(temp_csv, encoding="utf-8-sig")
                        if not df.empty:
                            df["country"] = country
                            df["state"] = state

                            country_csv = OUTPUT_DIR / f"{country}.csv"
                            file_exists = country_csv.exists() and country_csv.stat().st_size > 0
                            df.to_csv(
                                country_csv, mode="a" if file_exists else "w",
                                header=not file_exists,
                                index=False, encoding="utf-8-sig"
                            )

                            msg = f"OK: {batch_stem} -- {len(df)} rows -> {country_csv.name}"
                            log_write(log_file, msg)
                            print(f"  + {batch_stem} -- {len(df)} leads -> {country_csv.name}")
                        else:
                            msg = f"EMPTY: {batch_stem} -- 0 results"
                            log_write(log_file, msg)
                            print(f"  ~ {batch_stem} -- 0 results")
                    except Exception as e:
                        msg = f"ERROR processing {batch_stem}: {e}"
                        log_write(log_file, msg)
                        print(f"  ! {batch_stem} -- post-process error: {e}")
                        failed += 1

                    if temp_csv.exists():
                        temp_csv.unlink()
                else:
                    msg = f"FAILED: {batch_stem} (exit={proc.returncode})"
                    log_write(log_file, msg)
                    if stdout:
                        log_write(log_file, f"  stdout: {stdout[-500:]}")
                    if stderr:
                        log_write(log_file, f"  stderr: {stderr[-500:]}")
                    print(f"  ! {batch_stem} -- Docker failed (exit={proc.returncode})")
                    failed += 1

                done_file = OUTPUT_DIR / f"{batch_stem}.done"
                done_file.write_text(f"OK {time.time()}\n", encoding="utf-8")

                completed += 1
                remaining = total_pending - completed
                print(f"  Progress: {completed}/{total_pending} done, {remaining} left")
                print()

                del procs[pid]
                break

        if procs:
            time.sleep(3)

    print("=" * 55)
    print(f"  ALL DONE -- {completed} batches processed")
    if failed:
        print(f"  FAILED: {failed}")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"  Logs:   {LOG_DIR}/")
    print("=" * 55)


if __name__ == "__main__":
    run()
