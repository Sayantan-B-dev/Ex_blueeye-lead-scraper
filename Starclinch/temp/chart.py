"""
Accurate Vedic (Lahiri sidereal) birth chart calculator.
Birth: Sayantan Bharati, 17/07/1999 18:10 IST, Lat 22.94065 N, Lon 88.776727 E.
Uses Skyfield (JPL ephemeris) for true ecliptic longitudes + Lahiri ayanamsa.
All output written to stdout and chart.txt in temp/.
"""
import math
from datetime import datetime, timezone, timedelta
from skyfield.api import load, Topos

# ---------- birth data ----------
Y, M, D = 1999, 7, 17
H, MIN = 18, 10
LAT = 22.94065
LON = 88.776727
IST_OFFSET = 5.5 / 24.0  # IST = UTC+5:30

# ---------- constants ----------
SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio",
         "Sagittarius","Capricorn","Aquarius","Pisces"]
NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra",
              "Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni",
              "Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
              "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta",
              "Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"]
# nakshatra lords (for dasha start)
NAK_LORD = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn",
            "Mercury","Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter",
            "Saturn","Mercury","Ketu","Venus","Sun","Moon","Mars","Rahu",
            "Jupiter","Saturn","Mercury"]
DASHA_YEARS = {"Sun":6,"Moon":10,"Mars":7,"Rahu":18,"Jupiter":16,
               "Saturn":19,"Mercury":17,"Ketu":7,"Venus":20}

def sidereal_long(geocentric_ecl):
    """Convert true ecliptic longitude (deg) to Lahiri sidereal longitude."""
    # Lahiri ayanamsa at given year
    # ayanamsa(1900) = 22° 27' 27.42"  rate = 50.2388475 arcsec/yr
    ayan = 22 + (27/60) + (27.42/3600)
    ayan += (Y - 1900) * (50.2388475 / 3600.0)
    return (geocentric_ecl - ayan) % 360.0

def sign_deg(sec):
    """Return (sign_name, degree_in_sign)."""
    s = int(sec // 30)
    return SIGNS[s], sec - s*30

def nakshatra_pada(sec):
    """Return (nakshatra_name, pada 1-4, lord)."""
    n = int(sec // (360/27.0))
    frac = (sec - n*(360/27.0)) / (360/27.0)
    pada = min(4, int(frac * 4) + 1)
    return NAKSHATRAS[n], pada, NAK_LORD[n]

def main():
    # Build timescale and body positions
    ts = load.timescale()
    eph = load('de421.bsp')  # JPL ephemeris (downloaded on first run)
    earth = eph['earth']
    sun = eph['sun']
    moon = eph['moon']
    venus = eph['venus']
    # Rahu = mean lunar node (ascending). Skyfield has 'earth_moon_barycenter'
    # We compute mean node from lunar orbit elements instead; use simplified:
    # Mean Rahu longitude (1900.0) = 259.1833°, rate = +0.0529539°/day
    # We'll compute from J2000 instead: node = 125.0445 - 0.0529539*D (D days from J2000)
    # That's the MEAN ascending node of Moon (Rahu). Good enough for Rahu dasha.

    # Birth UTC
    utc = datetime(Y, M, D, H, MIN, tzinfo=timezone.utc) - timedelta(hours=5, minutes=30)
    t = ts.utc(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second)

    # Geocentric ecliptic longitudes
    # Sun
    sl = earth.at(t).observe(sun).apparent().ecliptic_latlon()[1].degrees
    # Moon
    ml = earth.at(t).observe(moon).apparent().ecliptic_latlon()[1].degrees
    # Venus
    vl = earth.at(t).observe(venus).apparent().ecliptic_latlon()[1].degrees

    # Mean Rahu (ascending lunar node)
    j2000 = datetime(2000,1,1,12,0,0,tzinfo=timezone.utc)
    days_j2000 = (utc - j2000).total_seconds() / 86400.0
    rahu_trop = (125.0445 - 0.0529539 * days_j2000) % 360.0
    ketu_trop = (rahu_trop + 180.0) % 360.0

    # Jupiter + Mercury + Mars + Saturn (for house/financial analysis)
    jup = eph['jupiter barycenter']
    mer = eph['mercury']
    mar = eph['mars']
    sat = eph['saturn barycenter']
    jl = earth.at(t).observe(jup).apparent().ecliptic_latlon()[1].degrees
    ml2 = earth.at(t).observe(mer).apparent().ecliptic_latlon()[1].degrees
    mal = earth.at(t).observe(mar).apparent().ecliptic_latlon()[1].degrees
    sal = earth.at(t).observe(sat).apparent().ecliptic_latlon()[1].degrees

    # Sidereal
    sun_s = sidereal_long(sl)
    moon_s = sidereal_long(ml)
    venus_s = sidereal_long(vl)
    rahu_s = sidereal_long(rahu_trop)
    ketu_s = sidereal_long(ketu_trop)
    jup_s = sidereal_long(jl)
    mer_s = sidereal_long(ml2)
    mar_s = sidereal_long(mal)
    sat_s = sidereal_long(sal)

    # Lagna (ascendant): compute sidereal time -> RAMC -> ecliptic ascendant
    # GMST via skyfield
    gst = t.gast * 360.0 / 24.0  # Greenwich apparent sidereal time in degrees
    # Local sidereal time
    lst = (gst + LON) % 360.0
    ramc = lst  # right ascension of MC
    # Obliquity of ecliptic (~23.44)
    eps = 23.4367
    # Ascendant longitude (tropical) formula:
    # tan(A) = cos(RAMC) / ( -sin(RAMC)*cos(eps) - tan(lat)*sin(eps) )
    ramc_rad = math.radians(ramc)
    lat_rad = math.radians(LAT)
    denom = -math.sin(ramc_rad)*math.cos(math.radians(eps)) - math.tan(lat_rad)*math.sin(math.radians(eps))
    asc_trop = math.degrees(math.atan2(math.cos(ramc_rad), denom)) % 360.0
    lagna_s = sidereal_long(asc_trop)

    # ---- House placement of each graha (1-indexed from Lagna) ----
    all_bodies = {
        "Lagna": lagna_s, "Sun": sun_s, "Moon": moon_s, "Mars": mar_s,
        "Mercury": mer_s, "Jupiter": jup_s, "Venus": venus_s,
        "Saturn": sat_s, "Rahu": rahu_s, "Ketu": ketu_s,
    }
    def house_of(sec):
        # house = ceil((sec - lagna)/30), 1..12
        d = (sec - lagna_s) % 360.0
        return int(d // 30) + 1
    houses = {name: house_of(sec) for name, sec in all_bodies.items()}

    # Financial houses: 2nd (wealth), 11th (gains), 10th (career), 9th (fortune)
    # Lord of a house = ruler planet of the sign occupying that house's start.
    # Simpler: find which sign is in each house, then its ruler.
    SIGN_RULER = {  # Vedic (traditional) rulers
        "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
        "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
        "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
        "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter",
    }
    def house_sign(h):
        # sign at start of house h (1= lagna sign)
        lagna_sign_idx = int(lagna_s // 30)
        return SIGNS[(lagna_sign_idx + h - 1) % 12]
    def house_lord(h):
        return SIGN_RULER[house_sign(h)]

    financial = {}
    for h, label in [(2, "2nd (wealth)"), (11, "11th (gains)"),
                     (10, "10th (career)"), (9, "9th (fortune)"),
                     (6, "6th (effort)"), (1, "1st (self)")]:
        sign = house_sign(h)
        lord = house_lord(h)
        # where is that lord placed?
        lord_house = houses.get(lord)
        financial[h] = (label, sign, lord, lord_house)

    out = []
    out.append("=" * 60)
    out.append("  VEDIC (LAHIRI SIDEREAL) BIRTH CHART")
    out.append("  Sayantan Bharati | 17/07/1999 18:10 IST")
    out.append("  Lat 22.94065 N, Lon 88.776727 E (near Kolkata)")
    out.append("=" * 60)
    out.append("")
    out.append(f"  LAHIRI AYANAMSA (1999): {sidereal_long(0):.4f}° (subtracted)")
    out.append("")
    out.append("  PLANET      TROPICAL°   SIDEREAL°    SIGN")
    out.append("  " + "-" * 50)
    for name, trop, sid in [("Sun", sl, sun_s), ("Moon", ml, moon_s),
                            ("Venus", vl, venus_s), ("Rahu", rahu_trop, rahu_s),
                            ("Lagna", asc_trop, lagna_s)]:
        sn, deg = sign_deg(sid)
        out.append(f"  {name:<11} {trop:7.2f}°   {sid:7.2f}°   {sn} {deg:.2f}°")
    out.append("")

    # Moon nakshatra (drives dasha start)
    msign, mdeg = sign_deg(moon_s)
    mnak, mpada, mlord = nakshatra_pada(moon_s)
    out.append(f"  MOON NAKSHATRA : {mnak} (pada {mpada})  -> lord: {mlord}")
    out.append(f"  MOON SIDEREAL  : {msign} {mdeg:.2f}°")
    out.append("")

    # Vimshottari dasha from Moon nakshatra lord
    # sequence
    SEQ = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"]
    # find start index
    start = SEQ.index(mlord)
    # years remaining in current nakshatra portion:
    # each nakshatra = 13°20' = 800', pada = 200'. remaining in birth nakshatra:
    nak_span = 360/27.0
    # position within nakshatra
    within = moon_s - (int(moon_s // nak_span) * nak_span)
    # remaining degrees in this nakshatra
    rem_deg = nak_span - within
    # fraction of THIS lord's full dasha remaining
    frac = rem_deg / nak_span
    lord_full = DASHA_YEARS[mlord]
    rem_years = frac * lord_full

    # birth datetime for dasha start
    bd = datetime(Y, M, D, H, MIN)
    out.append("  VIMSHOTTARI DASHA (from Moon nakshatra lord)")
    out.append(f"  Starting lord: {mlord}  (full {lord_full}y, remaining at birth {rem_years:.2f}y)")
    out.append("")
    out.append(f"  {'PERIOD':<22} {'FROM':<12} {'TO':<12} {'YEARS'}")
    out.append("  " + "-" * 50)

    cur = bd  # dasha starts AT birth
    lines = []
    for i in range(9):
        lord = SEQ[(start + i) % 9]
        yrs = rem_years if i == 0 else DASHA_YEARS[lord]
        frm = cur
        to = cur + timedelta(days=yrs*365.25)
        lines.append((lord, frm, to, yrs))
        cur = to
    # print first (partial) then full ones
    out.append(f"  {mlord:<20} {lines[0][1].strftime('%Y-%m')}    {lines[0][2].strftime('%Y-%m')}   {rem_years:.2f}")
    for i in range(1, 9):
        lord = SEQ[(start + i) % 9]
        out.append(f"  {lord:<20} {lines[i][1].strftime('%Y-%m')}    {lines[i][2].strftime('%Y-%m')}   {DASHA_YEARS[lord]}")

    # Antardashas for Rahu MD (current)
    out.append("")
    out.append("  ANTARDASHA (sub-periods) WITHIN RAHU MAHADASHA")
    out.append("  (Rahu MD is your CURRENT period; shows relationship-timing windows)")
    out.append("")
    # Find Rahu mahadasha row
    for i in range(9):
        if SEQ[(start + i) % 9] == "Rahu":
            frm = lines[i][1]; to = lines[i][2]
            out.append(f"  RAHU MAHADASHA: {frm.strftime('%Y-%m')} -> {to.strftime('%Y-%m')}")
            # antardashas
            ad_seq = SEQ  # same 9-lord cycle
            base = frm
            out.append(f"  {'ANTAR':<12} {'FROM':<10} {'TO':<10} {'MO'}")
            out.append("  " + "-" * 40)
            for j in range(9):
                alord = SEQ[j]
                # proportion of Rahu MD length
                ayrs = DASHA_YEARS[alord] / 120.0 * (to-base).days/365.25
                afrm = base
                ato = base + timedelta(days=ayrs*365.25)
                base = ato
                out.append(f"  {alord:<12} {afrm.strftime('%Y-%m')}  {ato.strftime('%Y-%m')}  {ayrs:.1f}")
            break

    # ---- HOUSE PLACEMENTS ----
    out.append("")
    out.append("  PLANET HOUSE PLACEMENTS (from Lagna = " +
               SIGNS[int(lagna_s//30)] + ")")
    out.append("  " + "-" * 40)
    for name in ["Lagna","Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn","Rahu","Ketu"]:
        sn, deg = sign_deg(all_bodies[name])
        out.append(f"  {name:<10} House {houses[name]}  ({sn} {deg:.1f}°)")

    # ---- FINANCIAL ANALYSIS ----
    out.append("")
    out.append("  FINANCIAL HOUSES (2nd wealth / 11th gains / 10th career / 9th fortune)")
    out.append("  " + "-" * 60)
    for h in [2, 11, 10, 9, 6, 1]:
        label, sign, lord, lord_house = financial[h]
        lplaced = f"in House {lord_house} ({SIGNS[int(all_bodies[lord]//30)]})" if lord_house else "?"
        out.append(f"  {label:<18}: sign {sign:<11} lord {lord:<8} {lplaced}")

    # 2nd & 11th lords and their dasha periods (financial timing)
    out.append("")
    out.append("  WEALTH-TIMING (Mahadasha periods of 2nd & 11th lords)")
    second_lord = house_lord(2)
    eleventh_lord = house_lord(11)
    tenth_lord = house_lord(10)
    out.append(f"  2nd lord = {second_lord} | 11th lord = {eleventh_lord} | 10th lord = {tenth_lord}")
    out.append("")
    out.append(f"  {'DASHA LORD':<14} {'PERIOD':<28} {'NOTE'}")
    out.append("  " + "-" * 60)
    notes = {
        second_lord: "direct wealth",
        eleventh_lord: "gains/income",
        tenth_lord: "career",
        "Jupiter": "expansion (also 9th/12th lord)",
        "Venus": "via arts/partnership",
        "Mercury": "via trade/skill",
        "Sun": "via authority",
        "Mars": "via effort/tech",
        "Rahu": "via unconventional/online",
        "Saturn": "slow but lasting",
        "Moon": "via public/name",
        "Ketu": "sudden",
    }
    for i in range(9):
        lord = SEQ[(start + i) % 9]
        if lord in (second_lord, eleventh_lord, tenth_lord, "Jupiter", "Venus", "Mercury", "Rahu"):
            frm = lines[i][1].strftime('%Y-%m')
            to = lines[i][2].strftime('%Y-%m')
            note = notes.get(lord, "")
            out.append(f"  {lord:<14} {frm+' -> '+to:<28} {note}")

    out.append("")
    out.append("=" * 60)
    text = "\n".join(out)
    print(text)
    with open('chart.txt', 'w', encoding='utf-8') as f:
        f.write(text)
    print("\n[written to chart.txt]")

if __name__ == '__main__':
    main()
