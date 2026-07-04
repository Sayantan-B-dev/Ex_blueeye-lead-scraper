import pandas as pd
from pathlib import Path

folders=["cleaned_missing_emails","missing_emails","no_missing_emails"]


OUTPUT_DIR = Path(__file__).resolve().parent / folders[2]
REPORT = Path(__file__).resolve().parent / "report.csv"

csv_files = sorted(OUTPUT_DIR.glob("*.csv"))
if not csv_files:
    print("No CSVs found in output/")
    exit(1)

total = missing_phone = missing_website = missing_both = 0

for f in csv_files:
    df = pd.read_csv(f, encoding="utf-8-sig", dtype=str)
    total += len(df)
    phone_null = df["phone"].isna() | df["phone"].eq("")
    web_null = df["website"].isna() | df["website"].eq("")
    missing_phone += (phone_null & ~web_null).sum()
    missing_website += (web_null & ~phone_null).sum()
    missing_both += (phone_null & web_null).sum()

report_df = pd.DataFrame({
    "metric": [
        "total_leads",
        "missing_only_phone",
        "missing_only_website",
        "missing_both_phone_and_website",
    ],
    "count": [total, missing_phone, missing_website, missing_both],
})
report_df.to_csv(REPORT, index=False)
print(f"Report written to {REPORT}")
print(report_df.to_string(index=False))
