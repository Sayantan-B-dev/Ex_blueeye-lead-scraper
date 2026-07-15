import os, csv, glob
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE, "output", "csv")
RAW_DIR = os.path.join(BASE, "output", "raw_merged_data")
CLEANED_DIR = os.path.join(BASE, "output", "cleaned_data")
WITH_NUM = os.path.join(CLEANED_DIR, "with_number")
WITHOUT_NUM = os.path.join(CLEANED_DIR, "without_number")
OUTPUT_DIR = os.path.join(BASE, "output")

csv_files = sorted(glob.glob(os.path.join(CSV_DIR, "*.csv")))
with open(csv_files[0], "r", encoding="utf-8") as fh:
    header = next(csv.reader(fh))

cat_counts = {}
for f in csv_files:
    fname = os.path.basename(f)
    cat = fname.replace(".csv", "").split("_", 1)[1]
    with open(f, "r", encoding="utf-8") as fh:
        r = sum(1 for _ in fh) - 1
    cat_counts[cat] = cat_counts.get(cat, 0) + r

# Raw counts
raw_files = sorted(glob.glob(os.path.join(RAW_DIR, "*.csv")))
city_raw = {}
for f in raw_files:
    city = os.path.basename(f).replace(".csv", "")
    with open(f, "r", encoding="utf-8") as fh:
        city_raw[city] = sum(1 for _ in fh) - 1

# Cleaned counts — with_number
with_num_files = sorted(glob.glob(os.path.join(WITH_NUM, "*.csv")))
city_with_num = {}
for f in with_num_files:
    city = os.path.basename(f).replace("_cleaned.csv", "")
    with open(f, "r", encoding="utf-8") as fh:
        city_with_num[city] = sum(1 for _ in fh) - 1

# Cleaned counts — without_number
without_num_files = sorted(glob.glob(os.path.join(WITHOUT_NUM, "*.csv")))
city_without_num = {}
for f in without_num_files:
    city = os.path.basename(f).replace("_cleaned.csv", "")
    with open(f, "r", encoding="utf-8") as fh:
        city_without_num[city] = sum(1 for _ in fh) - 1

total_raw = 43200
total_with = sum(city_with_num.values())
total_without = sum(city_without_num.values())
total_cleaned = total_with + total_without
total_dupes = total_raw - total_cleaned

# --- raw_merged_data_report.md ---
raw_report = os.path.join(BASE, "output", "raw_merged_data_report.md")
with open(raw_report, "w", encoding="utf-8") as rpt:
    rpt.write("# Raw Merged Data Report\n\n")
    rpt.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    rpt.write("## Overview\n\n")
    rpt.write(f"- **Source folder:** `output/csv/`\n")
    rpt.write(f"- **Output folder:** `output/raw_merged_data/`\n")
    rpt.write(f"- **Total files:** 432 (27 cities x 16 categories)\n")
    rpt.write(f"- **Total rows:** {total_raw:,}\n")
    rpt.write(f"- **Columns:** 18\n\n")
    rpt.write("## Columns\n\n")
    with open(os.path.join(CSV_DIR, os.listdir(CSV_DIR)[0]), "r", encoding="utf-8") as fh:
        header = next(csv.reader(fh))
    for i, col in enumerate(header, 1):
        rpt.write(f"{i}. `{col}`\n")
    rpt.write("\n")
    rpt.write("## Per-City Row Counts\n\n")
    rpt.write("| City | Files | Rows |\n|------|-------|------|\n")
    for city in sorted(city_raw):
        rpt.write(f"| {city} | 16 | {city_raw[city]:,} |\n")
    rpt.write(f"\n**Total: 27 cities, 432 files, {sum(city_raw.values()):,} rows**\n\n")
    rpt.write("## Per-Category Row Counts\n\n")
    rpt.write("| Category | Rows |\n|----------|------|\n")
    for cat in sorted(cat_counts):
        rpt.write(f"| {cat} | {cat_counts[cat]:,} |\n")
    rpt.write(f"\n**Total: 16 categories, {sum(cat_counts.values()):,} rows**\n\n")
    rpt.write("## Duplicate Analysis\n\n")
    rpt.write("| City | Raw Rows | Cleaned Rows | Duplicates Removed | Dedup % |\n")
    rpt.write("|------|----------|--------------|--------------------|--------|\n")
    for city in sorted(city_raw):
        raw = city_raw[city]
        cleaned = city_with_num.get(city, 0) + city_without_num.get(city, 0)
        dupes = raw - cleaned
        pct = dupes / raw * 100 if raw else 0
        rpt.write(f"| {city} | {raw:,} | {cleaned:,} | {dupes:,} | {pct:.1f}% |\n")
    rpt.write(f"\n**Total: {total_raw:,} raw rows, {total_dupes:,} duplicates removed ({total_dupes/total_raw*100:.1f}%), {total_cleaned:,} unique leads**\n")

# --- cleaned_data_report.md (with/without number split) ---
cleaned_report = os.path.join(OUTPUT_DIR, "cleaned_data_report.md")
with open(cleaned_report, "w", encoding="utf-8") as rpt:
    rpt.write("# Cleaned Data Report\n\n")
    rpt.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    rpt.write("## Overview\n\n")
    rpt.write(f"- **Source folder:** `output/cleaned_data/`\n")
    rpt.write(f"- **Total unique leads:** {total_cleaned:,}\n")
    rpt.write(f"- **With phone:** {total_with:,}\n")
    rpt.write(f"- **Without phone:** {total_without:,}\n")
    rpt.write(f"- **Dedup key:** `(name, phone)`\n")
    rpt.write(f"- **Weburl format:** `https://www.justdial.com/` prepended to all entries\n\n")
    rpt.write("## Per-City Breakdown\n\n")
    rpt.write("| City | With Phone | Without Phone | Total |\n")
    rpt.write("|------|-----------|--------------|-------|\n")
    for city in sorted(city_with_num):
        wn = city_with_num.get(city, 0)
        wo = city_without_num.get(city, 0)
        rpt.write(f"| {city} | {wn:,} | {wo:,} | {wn+wo:,} |\n")
    rpt.write(f"\n**Total: {total_with:,} with phone, {total_without:,} without phone, {total_cleaned:,} unique leads**\n\n")
    rpt.write("## Top Cities by Unique Leads\n\n")
    all_cities = {c: city_with_num.get(c, 0) + city_without_num.get(c, 0) for c in city_with_num}
    sorted_cities = sorted(all_cities.items(), key=lambda x: -x[1])
    rpt.write("| Rank | City | With Phone | Without Phone | Total |\n")
    rpt.write("|------|------|-----------|--------------|-------|\n")
    for rank, (city, total) in enumerate(sorted_cities, 1):
        wn = city_with_num.get(city, 0)
        wo = city_without_num.get(city, 0)
        rpt.write(f"| {rank} | {city} | {wn:,} | {wo:,} | {total:,} |\n")
    rpt.write(f"\n**Total unique leads: {total_cleaned:,}**\n\n")
    rpt.write("## Notes\n\n")
    rpt.write("- Dedup key: `(name, phone)` — case-insensitive name, exact phone match\n")
    rpt.write("- `weburl` column has been prefixed with `https://www.justdial.com/` for clickable links\n")
    rpt.write("- Source: 432 CSV files (27 cities x 16 categories)\n")
    rpt.write("- Output files: `output/cleaned_data/with_number/{city}_cleaned.csv` and `output/cleaned_data/without_number/{city}_cleaned.csv`\n")

print(f"Reports generated:")
print(f"  {raw_report}")
print(f"  {cleaned_report}")
