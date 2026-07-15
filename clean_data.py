import csv
import glob
import os

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE, 'JustDial', 'output', 'csv')
OUTPUT = os.path.join(BASE, 'JustDial', 'justdial_clean.csv')

FIELDS = [
    'name', 'phone', 'whatsapp', 'address', 'area', 'city',
    'rating', 'reviews', 'categories', 'lat', 'lon', 'pincode',
    'docid', 'weburl', 'rating_ln', 'images', 'verified', 'paid_status'
]

def parse_csv(path):
    rows = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

def filled_count(row):
    return sum(1 for v in row.values() if v and v.strip())

def normalize_city(city):
    if not city:
        return ''
    parts = city.strip().replace('-', ' ').split()
    return ' '.join(p.capitalize() for p in parts)

def main():
    files = sorted(glob.glob(os.path.join(CSV_DIR, '*.csv')))
    if not files:
        print('No CSV files found in', CSV_DIR)
        return

    print(f'Found {len(files)} CSV files')
    
    merged = []
    for path in files:
        rows = parse_csv(path)
        merged.extend(rows)

    print(f'Total raw rows: {len(merged)}')

    seen = {}
    dupes = 0
    for row in merged:
        key = (row.get('name', '').strip().lower(),
               row.get('phone', '').strip(),
               normalize_city(row.get('city', '')).lower())
        if not key[0] and not key[1]:
            continue
        if key in seen:
            dupes += 1
            existing = seen[key]
            if filled_count(row) > filled_count(existing):
                seen[key] = row
        else:
            seen[key] = row

    unique = list(seen.values())
    print(f'Unique businesses: {len(unique)}')
    print(f'Duplicates removed: {dupes}')

    for row in unique:
        row['city'] = normalize_city(row.get('city', ''))

    with_phone = sum(1 for r in unique if r.get('phone', '').strip())
    print(f'With phone: {with_phone} ({with_phone/len(unique)*100:.1f}%)')

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(unique)

    print(f'\nClean file saved: {OUTPUT}')

if __name__ == '__main__':
    main()
