# Global Scrape Map — Google Maps Lead Scraper (59 Countries)

Scrapes Google Maps for event/wedding/venue businesses across **59 countries** using gosom/google-maps-scraper Docker containers. 4 parallel containers, 26,143 total queries.

## Data

- **59 countries**, 2,011 states/regions, **26,143 queries**
- 13 search tags per state: Event Management Company, Event Planner, Wedding Planner, Corporate Event Planner, Event Venue, Wedding Venue, Banquet Hall, Night Club, Hotel, Resort, Convention Center, Talent Agency, Entertainment Agency
- Query format: `"{tag} in {state}, {country}"`

## Run

```bash
cd Global_scrape_map\global_scraper

# Step 1: Generate batch files (one per country-state, 13 queries each)
python split_queries.py

# Step 2: Scrape (4 parallel Docker containers, fast mode)
python run.py

# Or from Global_scrape_map\:
..\run.bat
```

## Output

| Path | Contents |
|------|----------|
| `global_scraper/output/{Country}.csv` | One CSV per country (e.g. `United States.csv`) |
| `global_scraper/logs/{Country}.log` | One log per country (e.g. `United_States.log`) |
| `global_scraper/output/{batch}.done` | Resume marker per batch |

Every CSV row includes `country` and `state` columns.

## Resume

Re-run `python run.py` — already-completed batches are skipped via `.done` markers.

## Directory Structure

```
Global_scrape_map/
├── README.md
├── run.bat / run.ps1          # Convenience launchers
├── country.txt                # 59 target countries
├── data_tags.txt / .json      # 13 search tags
├── states.json                # Country → state subdivisions
├── queries.json               # All 26,143 queries nested by country
├── expand_country.py          # Generate states.json from pycountry
├── generate_queries.py        # Generate queries.json from states + tags
└── global_scraper/
    ├── __init__.py
    ├── queries.json            # Copy of all queries
    ├── split_queries.py        # Generate batch files per country-state
    ├── run.py                  # Main scraper (4 Docker containers)
    ├── batches/                # (gitignored) 2,011 batch txt files
    ├── output/                 # (gitignored) Per-country CSVs + .done markers
    └── logs/                   # (gitignored) Per-country logs
```

## Dependencies

- **Docker Desktop** — must be running
- **gosom/google-maps-scraper:latest** — auto-pulled if missing
- **Python 3.10+** — pandas, pycountry (for expansion only)
