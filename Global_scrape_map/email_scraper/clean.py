import pandas as pd
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "global_scraper" / "output"
CLEAN_DIR = Path(__file__).resolve().parent / "cleaned_missing_emails"

CLEAN_DIR.mkdir(parents=True, exist_ok=True)

csv_files = sorted(OUTPUT_DIR.glob("*.csv"))
if not csv_files:
    print("No CSVs found in", OUTPUT_DIR)
    exit(1)

total_before = 0
total_after = 0

for f in csv_files:
    df = pd.read_csv(f, encoding="utf-8-sig", dtype=str)
    total_before += len(df)

    phone_null = df["phone"].isna() | df["phone"].eq("")
    web_null = df["website"].isna() | df["website"].eq("")
    keep = ~(phone_null & web_null)
    cleaned = df[keep].copy()

    total_after += len(cleaned)
    out_path = CLEAN_DIR / f.name
    cleaned.to_csv(out_path, index=False, encoding="utf-8-sig")
    removed = len(df) - len(cleaned)
    print(f"{f.stem:35s} {len(df):>6} -> {len(cleaned):>6}  (-{removed})")

print(f"\nTotal: {total_before} -> {total_after}  (-{total_before - total_after})")
print(f"Cleaned CSVs in {CLEAN_DIR}")
