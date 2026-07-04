import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent
QUERIES_FILE = ROOT / "queries.json"
BATCHES_DIR = ROOT / "batches"


def slugify(text):
    return text.replace(" ", "_").replace("/", "_").replace(",", "").replace("-", "_")


def split():
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    BATCHES_DIR.mkdir(parents=True, exist_ok=True)

    total_queries = 0
    total_batches = 0

    for country in sorted(queries):
        for state in sorted(queries[country]):
            qlist = queries[country][state]

            filename = f"{slugify(country)}_{slugify(state)}.txt"
            filepath = BATCHES_DIR / filename
            filepath.write_text("\n".join(qlist) + "\n", encoding="utf-8")

            total_queries += len(qlist)
            total_batches += 1
            print(f"  {filename} -- {len(qlist)} queries")

    print(f"\nDone. {total_batches} batches, {total_queries} total queries -> {BATCHES_DIR}/")


if __name__ == "__main__":
    split()
