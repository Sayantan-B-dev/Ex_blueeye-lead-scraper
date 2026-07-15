# Cleaned Data Report

**Generated:** 2026-07-15 08:43:28

## Overview

- **Source folder:** `output/cleaned_data/`
- **Total unique leads:** 4,175
- **With phone:** 2,990
- **Without phone:** 1,185
- **Dedup key:** `(name, phone)`
- **Weburl format:** `https://www.justdial.com/` prepended to all entries

## Per-City Breakdown

| City | With Phone | Without Phone | Total |
|------|-----------|--------------|-------|
| ahmedabad | 116 | 51 | 167 |
| bengaluru | 151 | 50 | 201 |
| bhopal | 70 | 43 | 113 |
| bhubaneswar | 231 | 55 | 286 |
| bikaner | 33 | 48 | 81 |
| bilaspur | 48 | 50 | 98 |
| delhi | 289 | 45 | 334 |
| goa | 42 | 43 | 85 |
| gurugram | 229 | 46 | 275 |
| hyderabad | 169 | 42 | 211 |
| indore | 87 | 34 | 121 |
| jaipur | 110 | 44 | 154 |
| jodhpur | 58 | 39 | 97 |
| kolkata | 92 | 43 | 135 |
| lonavala | 47 | 38 | 85 |
| lucknow | 126 | 38 | 164 |
| mumbai | 227 | 53 | 280 |
| nagpur | 99 | 40 | 139 |
| noida | 229 | 45 | 274 |
| patna | 87 | 38 | 125 |
| pune | 158 | 41 | 199 |
| raipur | 55 | 48 | 103 |
| siliguri | 47 | 42 | 89 |
| surat | 47 | 45 | 92 |
| udaipur | 56 | 36 | 92 |
| vadodara | 56 | 36 | 92 |
| vapi | 31 | 52 | 83 |

**Total: 2,990 with phone, 1,185 without phone, 4,175 unique leads**

## Top Cities by Unique Leads

| Rank | City | With Phone | Without Phone | Total |
|------|------|-----------|--------------|-------|
| 1 | delhi | 289 | 45 | 334 |
| 2 | bhubaneswar | 231 | 55 | 286 |
| 3 | mumbai | 227 | 53 | 280 |
| 4 | gurugram | 229 | 46 | 275 |
| 5 | noida | 229 | 45 | 274 |
| 6 | hyderabad | 169 | 42 | 211 |
| 7 | bengaluru | 151 | 50 | 201 |
| 8 | pune | 158 | 41 | 199 |
| 9 | ahmedabad | 116 | 51 | 167 |
| 10 | lucknow | 126 | 38 | 164 |
| 11 | jaipur | 110 | 44 | 154 |
| 12 | nagpur | 99 | 40 | 139 |
| 13 | kolkata | 92 | 43 | 135 |
| 14 | patna | 87 | 38 | 125 |
| 15 | indore | 87 | 34 | 121 |
| 16 | bhopal | 70 | 43 | 113 |
| 17 | raipur | 55 | 48 | 103 |
| 18 | bilaspur | 48 | 50 | 98 |
| 19 | jodhpur | 58 | 39 | 97 |
| 20 | surat | 47 | 45 | 92 |
| 21 | udaipur | 56 | 36 | 92 |
| 22 | vadodara | 56 | 36 | 92 |
| 23 | siliguri | 47 | 42 | 89 |
| 24 | goa | 42 | 43 | 85 |
| 25 | lonavala | 47 | 38 | 85 |
| 26 | vapi | 31 | 52 | 83 |
| 27 | bikaner | 33 | 48 | 81 |

**Total unique leads: 4,175**

## Notes

- Dedup key: `(name, phone)` — case-insensitive name, exact phone match
- `weburl` column has been prefixed with `https://www.justdial.com/` for clickable links
- Source: 432 CSV files (27 cities x 16 categories)
- Output files: `output/cleaned_data/with_number/{city}_cleaned.csv` and `output/cleaned_data/without_number/{city}_cleaned.csv`
