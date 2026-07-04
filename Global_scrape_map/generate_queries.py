import json
from pathlib import Path

ROOT = Path(__file__).parent
STATES_FILE = ROOT / "states.json"
TAGS_FILE = ROOT / "data_tags.json"
QUERIES_FILE = ROOT / "queries.json"


def build():
    states = json.loads(STATES_FILE.read_text(encoding="utf-8"))
    tags = json.loads(TAGS_FILE.read_text(encoding="utf-8"))

    queries = {}
    for country, state_list in states.items():
        state_map = {}
        for state in state_list:
            state_map[state] = [f"{tag} in {state}, {country}" for tag in tags]
        queries[country] = state_map

    QUERIES_FILE.write_text(
        json.dumps(queries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    total_queries = sum(len(s) * len(tags) for s in states.values())
    print(f"Done — {len(states)} countries, {total_queries} queries -> {QUERIES_FILE}")


if __name__ == "__main__":
    build()
