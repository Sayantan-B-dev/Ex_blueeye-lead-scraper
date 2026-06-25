from pathlib import Path

queries_file = Path(__file__).parent / "queries.txt"
batches_dir = Path(__file__).parent / "batches"
batches_dir.mkdir(parents=True, exist_ok=True)

city_queries = {}
for line in queries_file.read_text(encoding="utf-8").strip().splitlines():
    line = line.strip()
    if not line:
        continue
    city = line.split(" in ", 1)[-1]
    city_queries.setdefault(city, []).append(line)

sorted_cities = sorted(city_queries.keys())

for idx, city in enumerate(sorted_cities, start=1):
    filename = f"batch_{idx:02d}_{city}.txt"
    filepath = batches_dir / filename
    filepath.write_text("\n".join(city_queries[city]) + "\n", encoding="utf-8")
    print(f"Created {filename} — {len(city_queries[city])} queries")

print(f"\nDone. {len(sorted_cities)} city batch files created in {batches_dir}")
