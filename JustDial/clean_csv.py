import os, csv, glob
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE, "output", "csv")
RAW_DIR = os.path.join(BASE, "output", "raw_merged_data")
CLEANED_DIR = os.path.join(BASE, "output", "cleaned_data")
WITH_NUM = os.path.join(CLEANED_DIR, "with_number")
WITHOUT_NUM = os.path.join(CLEANED_DIR, "without_number")

os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(WITH_NUM, exist_ok=True)
os.makedirs(WITHOUT_NUM, exist_ok=True)

files = sorted(glob.glob(os.path.join(CSV_DIR, "*.csv")))
if not files:
    print(f"No CSV files found in {CSV_DIR}")
    exit(1)

city_files = {}
for f in files:
    fname = os.path.basename(f)
    city = fname.split("_")[0]
    city_files.setdefault(city, []).append(f)

with open(files[0], "r", encoding="utf-8") as fh:
    header = next(csv.reader(fh))

# --- raw_merged_data/ ---
print("=== Creating raw_merged_data/ ===")
for city in sorted(city_files):
    out_path = os.path.join(RAW_DIR, f"{city}.csv")
    count = 0
    with open(out_path, "w", encoding="utf-8", newline="") as out_f:
        w = csv.writer(out_f)
        w.writerow(header)
        for fpath in sorted(city_files[city]):
            with open(fpath, "r", encoding="utf-8") as fh:
                reader = csv.reader(fh)
                next(reader)
                for row in reader:
                    w.writerow(row)
                    count += 1
    print(f"raw_merged_data/{city}.csv  {count} rows")

# --- cleaned_data/ (dedup + split by phone presence + fix weburl) ---
print("\n=== Creating cleaned_data/ ===")
for city in sorted(city_files):
    seen = set()
    with_number = []
    without_number = []
    for fpath in sorted(city_files[city]):
        with open(fpath, "r", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                key = (row.get("name", "").strip().lower(), row.get("phone", "").strip())
                if key not in seen:
                    seen.add(key)
                    # Fix weburl
                    raw_url = row.get("weburl", "").strip()
                    if raw_url and not raw_url.startswith("http"):
                        row["weburl"] = "https://www.justdial.com/" + raw_url
                    if row.get("phone", "").strip():
                        with_number.append(row)
                    else:
                        without_number.append(row)
    with_num_path = os.path.join(WITH_NUM, f"{city}_cleaned.csv")
    with open(with_num_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(with_number)
    without_num_path = os.path.join(WITHOUT_NUM, f"{city}_cleaned.csv")
    with open(without_num_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(without_number)
    print(f"cleaned_data/with_number/{city}_cleaned.csv  {len(with_number)} rows")
    print(f"cleaned_data/without_number/{city}_cleaned.csv  {len(without_number)} rows")
