import json
from pathlib import Path

ROOT = Path(__file__).parent
COUNTRIES_FILE = ROOT / "country.txt"
STATES_FILE = ROOT / "states.json"


def load_countries():
    text = COUNTRIES_FILE.read_text(encoding="utf-8")
    return [line.strip() for line in text.strip().splitlines() if line.strip()]


def build():
    import pycountry

    name2code = {}
    for c in pycountry.countries:
        name2code[c.name.lower()] = c.alpha_2
        for attr in ("common_name", "official_name"):
            val = getattr(c, attr, None)
            if val:
                name2code[val.lower()] = c.alpha_2

    countries = load_countries()
    result = {}

    for name in countries:
        code = name2code.get(name.lower())
        if not code:
            print(f"  SKIP  {name} — no ISO code")
            result[name] = []
            continue

        try:
            subdivisions = list(pycountry.subdivisions.get(country_code=code))
        except KeyError:
            subdivisions = []

        states = [s.name for s in subdivisions]
        if not states:
            states = [name]
        result[name] = states
        print(f"  OK  {name} ({code}): {len(states)} states")

    STATES_FILE.write_text(
        json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )
    print(f"\nDone — {len(result)} countries -> {STATES_FILE}")


if __name__ == "__main__":
    build()
