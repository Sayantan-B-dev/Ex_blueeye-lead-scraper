import csv
import os
import sys
from pathlib import Path
from datetime import datetime

import ctypes
kernel32 = ctypes.windll.kernel32
STD_OUTPUT_HANDLE = -11
ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
handle = kernel32.GetStdHandle(STD_OUTPUT_HANDLE)
mode = ctypes.c_uint32()
if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
    kernel32.SetConsoleMode(handle, mode.value | ENABLE_VIRTUAL_TERMINAL_PROCESSING)

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns
from rich import box
from rich.layout import Layout
from rich.live import Live

if sys.stdout.encoding and sys.stdout.encoding.upper() not in ("UTF-8", "UTF8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
console = Console(color_system="truecolor", legacy_windows=False, force_terminal=True)

BASE_DIR = Path(__file__).resolve().parent
FOLDERS = ["cleaned_missing_emails", "missing_emails", "no_missing_emails"]


def pct_bar(val, total, width=15):
    frac = val / total if total else 0
    filled = round(frac * width)
    empty = width - filled
    if frac >= 0.8:
        color = "green"
    elif frac >= 0.5:
        color = "yellow"
    elif frac >= 0.2:
        color = "orange1"
    else:
        color = "red"
    bar = "━" * filled + "─" * empty
    return f"[{color}]{bar}[/]"


def pct_fmt(val, total):
    if not total:
        return "  0.0%"
    return f"{val / total * 100:5.1f}%"


def stat_row(label, val, total, style=""):
    bar = pct_bar(val, total)
    pct = pct_fmt(val, total)
    return [Text(label, style=style), Text(f"{val:,}", style=style + " bold"), Text.from_markup(bar), Text(pct, style=style)]


def fmt(v):
    return f"{v:,}"


def txt_line(label, val, total):
    pct = f"{val / total * 100:5.1f}%" if total else "  0.0%"
    bar_w = 30
    frac = val / total if total else 0
    filled = int(frac * bar_w)
    bar = "█" * filled + "░" * (bar_w - filled)
    return f"  {label:<30s} {val:>10,}  {bar}  {pct:>7s}"


def analyze(path):
    name = os.path.basename(path)
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    fn = [c for c in reader.fieldnames if c]
    total = len(rows)

    wk = "website" if "website" in (rows[0] if rows else {}) else "Website"
    pk = "phone" if "phone" in (rows[0] if rows else {}) else "Phone"
    ek = "emails" if "emails" in (rows[0] if rows else {}) else "email"

    def w(r): return r.get(wk, "").strip()
    def p(r): return r.get(pk, "").strip()
    def e(r): return r.get(ek, "").strip()
    def ws(r): return r.get("website_status", "").strip()
    def em(r): return r.get("emails", "").strip()

    has_web = sum(1 for r in rows if w(r))
    has_phone = sum(1 for r in rows if p(r))
    has_email = sum(1 for r in rows if e(r))
    has_web_phone_email = sum(1 for r in rows if w(r) and p(r) and e(r))

    no_web = total - has_web
    no_phone = total - has_phone
    no_email = total - has_email

    nwnp = sum(1 for r in rows if not w(r) and not p(r))
    nwhp = sum(1 for r in rows if not w(r) and p(r))
    hwnp = sum(1 for r in rows if w(r) and not p(r))
    hwhp = sum(1 for r in rows if w(r) and p(r))

    nwhe = sum(1 for r in rows if not w(r) and e(r))
    hwne = sum(1 for r in rows if w(r) and not e(r))
    hwhe = sum(1 for r in rows if w(r) and e(r))
    nwne_h = sum(1 for r in rows if not e(r) and not w(r) and p(r))

    nene = sum(1 for r in rows if not e(r) and not p(r))

    a = sum(1 for r in rows if not w(r))
    b = sum(1 for r in rows if w(r) and not p(r) and not e(r))
    c = sum(1 for r in rows if w(r) and p(r) and not e(r))
    d = sum(1 for r in rows if w(r) and not p(r) and e(r))
    f_ = sum(1 for r in rows if not w(r) and p(r) and not e(r))
    g_ = sum(1 for r in rows if not w(r) and not p(r) and e(r))
    h_ = sum(1 for r in rows if not w(r) and p(r) and e(r))

    ws_all = sum(1 for r in rows if ws(r))
    ws_ok = sum(1 for r in rows if ws(r) == "ok")
    ws_no_email = sum(1 for r in rows if ws(r) == "ok_no_email")
    ws_timeout = sum(1 for r in rows if ws(r) == "timeout")
    ws_dns = sum(1 for r in rows if ws(r) == "dns_error")
    ws_ssl = sum(1 for r in rows if ws(r) == "ssl_error")
    ws_conn = sum(1 for r in rows if ws(r) == "connection_error")
    ws_other = ws_all - ws_ok - ws_no_email - ws_timeout - ws_dns - ws_ssl - ws_conn

    emails_found_count = sum(len(em(r).split(";")) for r in rows if em(r))
    emails_unique = set()
    emails_per_domain = {}
    for r in rows:
        if em(r):
            for e_addr in em(r).split(";"):
                ea = e_addr.strip().lower()
                if ea:
                    emails_unique.add(ea)
                    domain = ea.split("@")[-1] if "@" in ea else "unknown"
                    emails_per_domain[domain] = emails_per_domain.get(domain, 0) + 1
    top_domains = sorted(emails_per_domain.items(), key=lambda x: -x[1])[:10]

    return {
        "name": name, "total": total,
        "has_web": has_web, "no_web": no_web, "has_phone": has_phone, "no_phone": no_phone,
        "has_email": has_email, "no_email": no_email, "all3": has_web_phone_email,
        "nwnp": nwnp, "nwhp": nwhp, "hwnp": hwnp, "hwhp": hwhp,
        "nwhe": nwhe, "hwne": hwne, "hwhe": hwhe, "nene": nene,
        "a": a, "b": b, "c": c, "d": d, "f_": f_, "g_": g_, "h_": h_,
        "ws_all": ws_all, "ws_ok": ws_ok, "ws_no_email": ws_no_email,
        "ws_timeout": ws_timeout, "ws_dns": ws_dns, "ws_ssl": ws_ssl,
        "ws_conn": ws_conn, "ws_other": ws_other,
        "emails_found_count": emails_found_count, "emails_unique": len(emails_unique),
        "top_domains": top_domains,
    }


def print_rich_dashboard(results, source):
    tt = tr = tw = tp = te = ta = tok = tno = terr = 0
    ttimeout = tdns = tssl = tconn = tother = 0
    total_emails_found = 0
    total_emails_unique = set()
    all_top_domains = {}

    for r in results:
        tt += r["total"]
        tw += r["has_web"]
        tp += r["has_phone"]
        te += r["has_email"]
        ta += r["all3"]
        tok += r["ws_ok"]
        tno += r["ws_no_email"]
        terr += r["ws_timeout"] + r["ws_dns"] + r["ws_ssl"] + r["ws_conn"] + r["ws_other"]
        ttimeout += r["ws_timeout"]
        tdns += r["ws_dns"]
        tssl += r["ws_ssl"]
        tconn += r["ws_conn"]
        tother += r["ws_other"]
        total_emails_found += r["emails_found_count"]
        total_emails_unique.update(r["emails_unique"] if isinstance(r["emails_unique"], (set, list)) else [])
        for d, c in r.get("top_domains", []):
            all_top_domains[d] = all_top_domains.get(d, 0) + c
    top10 = sorted(all_top_domains.items(), key=lambda x: -x[1])[:10]

    # ── 1: EXECUTIVE SUMMARY ──
    t1 = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    t1.add_column("Metric", style="bold", width=30)
    t1.add_column("Count", justify="right", width=12)
    t1.add_column("Bar", width=17)
    t1.add_column("%", justify="right", width=8)
    t1.add_row(*stat_row("Total leads", tt, tt, "bold white"))
    t1.add_row(*stat_row("Has website", tw, tt, "cyan"))
    t1.add_row(*stat_row("No website", tt - tw, tt, "dim"))
    t1.add_row(*stat_row("Has phone", tp, tt, "green"))
    t1.add_row(*stat_row("No phone", tt - tp, tt, "dim"))
    t1.add_row(*stat_row("Has email", te, tt, "green" if te else "red"))
    t1.add_row(*stat_row("No email", tt - te, tt, "dim"))
    t1.add_row(*stat_row("All three (web+phone+email)", ta, tt, "green bold" if ta else "dim"))

    # ── 2: WEBSITE STATUS ──
    t2 = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    t2.add_column("Status", style="bold", width=30)
    t2.add_column("Count", justify="right", width=12)
    t2.add_column("Bar", width=17)
    t2.add_column("%", justify="right", width=8)
    t2.add_row(*stat_row("Websites scraped", tok + tno + terr, tw, "cyan"))
    t2.add_row(*stat_row("  ok (email found)", tok, tw, "green"))
    t2.add_row(*stat_row("  ok (no email)", tno, tw, "yellow"))
    t2.add_row(Text("-" * 70, style="dim"), "", "", "")
    t2.add_row(*stat_row("  timeout", ttimeout, tw, "red"))
    t2.add_row(*stat_row("  dns_error", tdns, tw, "red"))
    t2.add_row(*stat_row("  ssl_error", tssl, tw, "red"))
    t2.add_row(*stat_row("  connection_error", tconn, tw, "red"))
    t2.add_row(*stat_row("  other errors", tother, tw, "red"))

    # ── 3: INTERSECTIONS ──
    t3 = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    t3.add_column("Intersection", style="bold", width=30)
    t3.add_column("Count", justify="right", width=12)
    t3.add_column("Bar", width=17)
    t3.add_column("%", justify="right", width=8)
    t3.add_row(*stat_row("Web + phone + email", ta, tt, "green bold"))
    t3.add_row(*stat_row("Web + phone, no email", sum(r["c"] for r in results), tt, "yellow"))
    t3.add_row(*stat_row("Web + email, no phone", sum(r["d"] for r in results), tt, "yellow"))
    t3.add_row(*stat_row("Web only", sum(r["b"] for r in results), tt, "dim"))
    t3.add_row(Text("-" * 70, style="dim"), "", "", "")
    t3.add_row(*stat_row("Phone only", sum(r["f_"] for r in results), tt, "dim"))
    t3.add_row(*stat_row("Email only", sum(r["g_"] for r in results), tt, "dim"))
    t3.add_row(*stat_row("Phone + email, no web", sum(r["h_"] for r in results), tt, "dim"))
    t3.add_row(*stat_row("No website, no phone, no email", sum(r["nwnp"] for r in results), tt, "dim"))

    # ── 4: EMAIL PERFORMANCE ──
    t4 = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    t4.add_column("Email Metric", style="bold", width=30)
    t4.add_column("Count", justify="right", width=12)
    t4.add_column("Details", width=50)
    hit_rate = te / tw * 100 if tw else 0
    email_per_row = total_emails_found / tt if tt else 0
    t4.add_row(*[Text("Email hit rate (websites)", style="bold"), Text(f"{hit_rate:.1f}%", style="green bold"), Text(f"{te} of {tw} websites yielded emails")])
    t4.add_row(*[Text("Total emails extracted", style="bold"), Text(f"{total_emails_found:,}", style="green bold"), Text(f"across {te} rows with email")])
    t4.add_row(*[Text("Unique email addresses", style="bold"), Text(f"{len(total_emails_unique):,}", style="green bold"), Text(f"after dedup")])
    t4.add_row(*[Text("Avg emails per row", style="bold"), Text(f"{email_per_row:.2f}", style="bold"), Text("total emails / total rows")])
    t4.add_row(*[Text("High-value leads (all 3)", style="bold"), Text(f"{ta:,}", style="green bold"), Text(f"{ta/tt*100:.1f}% of total — ready for outreach")])
    t4.add_row(Text("-" * 70, style="dim"), Text(""), Text(""))
    for i, (dom, cnt) in enumerate(top10):
        t4.add_row(*[Text(f"  Top domain #{i+1}: {dom}", style="dim"), Text(f"{cnt:,}", style="dim"), Text("")])

    # ── 5: COUNTRY BREAKDOWN TABLE ──
    t5 = Table(show_header=True, header_style="bold", box=box.SIMPLE)
    t5.add_column("Country", style="cyan", width=22)
    t5.add_column("Total", justify="right", width=7)
    t5.add_column("Web", justify="right", width=7)
    t5.add_column("NoWeb", justify="right", width=7)
    t5.add_column("Phone", justify="right", width=7)
    t5.add_column("Email", justify="right", width=7)
    t5.add_column("All3", justify="right", width=6)
    t5.add_column("OK", justify="right", width=6)
    t5.add_column("NoEm", justify="right", width=6)
    t5.add_column("Err", justify="right", width=6)
    t5.add_column("Hit%", justify="right", width=6)

    for r in sorted(results, key=lambda x: -x["total"]):
        hr = r["has_email"] / r["has_web"] * 100 if r["has_web"] else 0
        t5.add_row(
            r["name"].replace(".csv", ""), fmt(r["total"]), fmt(r["has_web"]),
            fmt(r["no_web"]), fmt(r["has_phone"]), fmt(r["has_email"]),
            fmt(r["all3"]), fmt(r["ws_ok"]), fmt(r["ws_no_email"]),
            fmt(r["ws_timeout"] + r["ws_dns"] + r["ws_ssl"] + r["ws_conn"] + r["ws_other"]),
            f"{hr:.1f}",
        )
    t5.add_row(
        Text("TOTAL", style="bold white"), Text(f"{tt:,}", style="bold"),
        Text(f"{tw:,}", style="bold"), Text(f"{tt-tw:,}", style="bold"),
        Text(f"{tp:,}", style="bold"),
        Text(f"{te:,}", style="bold green" if te else "bold"),
        Text(f"{ta:,}", style="bold green" if ta else "bold"),
        Text(f"{tok:,}", style="bold"),
        Text(f"{tno:,}", style="bold"),
        Text(f"{terr:,}", style="bold red" if terr else "bold"),
        Text(f"{te/tw*100:.1f}" if tw else "0", style="bold green"),
    )

    pan1 = Panel(t1, title="[bold]Executive Summary[/]", border_style="blue")
    pan2 = Panel(t2, title="[bold]Website Status Breakdown[/]", border_style="cyan")
    pan3 = Panel(t3, title="[bold]Intersection Analysis[/]", border_style="green")
    pan4 = Panel(t4, title="[bold]Email Enrichment Performance[/]", border_style="magenta")

    console.print()
    console.print(Panel(f"[bold]Lead Quality Report[/] — [cyan]{source}/[/] — [white]{len(results)} files[/] — [dim]{datetime.now():%Y-%m-%d %H:%M}[/]", border_style="bright_yellow"))
    console.print(Columns([pan1, pan2], equal=True))
    console.print(Columns([pan3, pan4], equal=True))
    console.print(Panel(t5, title=f"[bold]Per-Country Breakdown ({len(results)} countries)[/]", border_style="bright_yellow"))


def generate_txt(results, source):
    lines = []
    sep = "=" * 100
    dash = "-" * 100

    tt = tr = tw = tp = te = ta = tok = tno = terr = 0
    ttimeout = tdns = tssl = tconn = tother = 0
    total_emails_found = 0
    total_emails_unique = set()
    all_top_domains = {}

    for r in results:
        tt += r["total"]
        tw += r["has_web"]
        tp += r["has_phone"]
        te += r["has_email"]
        ta += r["all3"]
        tok += r["ws_ok"]
        tno += r["ws_no_email"]
        terr += r["ws_timeout"] + r["ws_dns"] + r["ws_ssl"] + r["ws_conn"] + r["ws_other"]
        ttimeout += r["ws_timeout"]
        tdns += r["ws_dns"]
        tssl += r["ws_ssl"]
        tconn += r["ws_conn"]
        tother += r["ws_other"]
        total_emails_found += r["emails_found_count"]
        if isinstance(r["emails_unique"], set):
            total_emails_unique.update(r["emails_unique"])
        for d, c in r.get("top_domains", []):
            all_top_domains[d] = all_top_domains.get(d, 0) + c
    top10 = sorted(all_top_domains.items(), key=lambda x: -x[1])[:10]

    lines.append(sep)
    lines.append("  LEAD QUALITY — COMPREHENSIVE ANALYSIS REPORT")
    lines.append(f"  Folder: {source}/    Files: {len(results)}    Generated: {datetime.now():%Y-%m-%d %H:%M}")
    lines.append(sep)

    # Executive Summary
    def bar(val, total, w=30):
        frac = val / total if total else 0
        filled = int(frac * w)
        return "█" * filled + "░" * (w - filled)

    lines.append("")
    lines.append("  EXECUTIVE SUMMARY")
    lines.append(dash)
    lines.append(txt_line("Total leads", tt, tt) + f"    100.0%")
    lines.append(txt_line("Has website", tw, tt))
    lines.append(txt_line("No website", tt - tw, tt))
    lines.append(txt_line("Has phone", tp, tt))
    lines.append(txt_line("No phone", tt - tp, tt))
    lines.append(txt_line("Has email", te, tt))
    lines.append(txt_line("No email", tt - te, tt))
    lines.append(txt_line("All three (web+phone+email)", ta, tt))

    # Website Status
    lines.append("")
    lines.append("  WEBSITE STATUS BREAKDOWN")
    lines.append(dash)
    lines.append(txt_line("Websites scraped", tok + tno + terr, tw))
    lines.append(txt_line("  ok (email found)", tok, tw))
    lines.append(txt_line("  ok (no email)", tno, tw))
    lines.append(txt_line("  timeout", ttimeout, tw))
    lines.append(txt_line("  dns_error", tdns, tw))
    lines.append(txt_line("  ssl_error", tssl, tw))
    lines.append(txt_line("  connection_error", tconn, tw))
    lines.append(txt_line("  other errors", tother, tw))

    # Intersections
    lines.append("")
    lines.append("  INTERSECTION ANALYSIS")
    lines.append(dash)
    lines.append(txt_line("Web + phone + email (all 3)", ta, tt))
    lines.append(txt_line("Web + phone, no email", sum(r["c"] for r in results), tt))
    lines.append(txt_line("Web + email, no phone", sum(r["d"] for r in results), tt))
    lines.append(txt_line("Web only (no phone, no email)", sum(r["b"] for r in results), tt))
    lines.append(txt_line("Phone only", sum(r["f_"] for r in results), tt))
    lines.append(txt_line("Email only", sum(r["g_"] for r in results), tt))
    lines.append(txt_line("Phone + email (no web)", sum(r["h_"] for r in results), tt))
    lines.append(txt_line("No web, no phone, no email", sum(r["nwnp"] for r in results), tt))

    # Email Performance
    hit_rate = te / tw * 100 if tw else 0
    lines.append("")
    lines.append("  EMAIL ENRICHMENT PERFORMANCE")
    lines.append(dash)
    lines.append(f"  Email hit rate (websites):        {hit_rate:>7.1f}%     ({te} of {tw} websites yielded emails)")
    lines.append(f"  Total emails extracted:           {total_emails_found:>10,}     (across {te} rows)")
    lines.append(f"  Unique email addresses:           {len(total_emails_unique):>10,}")
    lines.append(f"  Avg emails per row:               {total_emails_found/tt:>10.2f}" if tt else "  Avg emails per row:                        0.00")
    lines.append(f"  High-value leads (all 3):         {ta:>10,}     ({ta/tt*100:.1f}% of total)")
    lines.append(f"  Top email domains:")
    for i, (dom, cnt) in enumerate(top10):
        lines.append(f"    #{i+1}: {dom:<40s} {cnt:>6,}")

    # Country Breakdown
    lines.append("")
    lines.append(f"  PER-COUNTRY BREAKDOWN ({len(results)} countries)")
    lines.append(dash)
    header = f"  {'Country':<22s} {'Total':>7s} {'Web':>7s} {'NoWeb':>7s} {'Phone':>7s} {'Email':>7s} {'All3':>6s} {'OK':>6s} {'NoEm':>6s} {'Err':>6s} {'Hit%':>6s}"
    lines.append(header)
    lines.append("  " + "-" * (len(header) - 2))
    for r in sorted(results, key=lambda x: -x["total"]):
        hr = r["has_email"] / r["has_web"] * 100 if r["has_web"] else 0
        e = r["ws_timeout"] + r["ws_dns"] + r["ws_ssl"] + r["ws_conn"] + r["ws_other"]
        lines.append(f"  {r['name'].replace('.csv',''):<22s} {r['total']:>7,} {r['has_web']:>7,} {r['no_web']:>7,} {r['has_phone']:>7,} {r['has_email']:>7,} {r['all3']:>6,} {r['ws_ok']:>6,} {r['ws_no_email']:>6,} {e:>6,} {hr:>5.1f}%")
    lines.append("  " + "-" * (len(header) - 2))
    lines.append(f"  {'TOTAL':<22s} {tt:>7,} {tw:>7,} {tt-tw:>7,} {tp:>7,} {te:>7,} {ta:>6,} {tok:>6,} {tno:>6,} {terr:>6,} {te/tw*100:>5.1f}%" if tw else "")

    return "\n".join(lines)


def generate_csv(results):
    rows_csv = []
    for r in sorted(results, key=lambda x: -x["total"]):
        row = {
            "country": r["name"].replace(".csv", ""),
            "total": r["total"],
            "has_website": r["has_web"], "no_website": r["no_web"],
            "has_phone": r["has_phone"], "no_phone": r["no_phone"],
            "has_email": r["has_email"], "no_email": r["no_email"],
            "all_three": r["all3"],
            "no_web_no_phone": r["nwnp"], "no_web_has_phone": r["nwhp"],
            "has_web_no_phone": r["hwnp"], "has_web_has_phone": r["hwhp"],
            "no_web_has_email": r["nwhe"], "has_web_no_email": r["hwne"],
            "has_web_has_email": r["hwhe"],
            "ws_ok": r["ws_ok"], "ws_no_email": r["ws_no_email"],
            "ws_timeout": r["ws_timeout"], "ws_dns": r["ws_dns"],
            "ws_ssl": r["ws_ssl"], "ws_connection_error": r["ws_conn"],
            "ws_other": r["ws_other"],
            "emails_found_total": r["emails_found_count"],
            "emails_unique": r["emails_unique"] if isinstance(r["emails_unique"], int) else len(r["emails_unique"]),
            "cat_no_website": r["a"], "cat_website_only": r["b"],
            "cat_website_phone": r["c"], "cat_website_email": r["d"],
            "cat_phone_only": r["f_"], "cat_email_only": r["g_"],
            "cat_phone_email_no_web": r["h_"],
        }
        rows_csv.append(row)

    # Total row
    tt = sum(r["total"] for r in results)
    rows_csv.append({
        "country": "TOTAL",
        "total": tt,
        "has_website": sum(r["has_web"] for r in results),
        "no_website": sum(r["no_web"] for r in results),
        "has_phone": sum(r["has_phone"] for r in results),
        "no_phone": sum(r["no_phone"] for r in results),
        "has_email": sum(r["has_email"] for r in results),
        "no_email": sum(r["no_email"] for r in results),
        "all_three": sum(r["all3"] for r in results),
        "no_web_no_phone": sum(r["nwnp"] for r in results),
        "no_web_has_phone": sum(r["nwhp"] for r in results),
        "has_web_no_phone": sum(r["hwnp"] for r in results),
        "has_web_has_phone": sum(r["hwhp"] for r in results),
        "no_web_has_email": sum(r["nwhe"] for r in results),
        "has_web_no_email": sum(r["hwne"] for r in results),
        "has_web_has_email": sum(r["hwhe"] for r in results),
        "ws_ok": sum(r["ws_ok"] for r in results),
        "ws_no_email": sum(r["ws_no_email"] for r in results),
        "ws_timeout": sum(r["ws_timeout"] for r in results),
        "ws_dns": sum(r["ws_dns"] for r in results),
        "ws_ssl": sum(r["ws_ssl"] for r in results),
        "ws_connection_error": sum(r["ws_conn"] for r in results),
        "ws_other": sum(r["ws_other"] for r in results),
        "emails_found_total": sum(r["emails_found_count"] for r in results),
        "emails_unique": len(set().union(*[r["emails_unique"] if isinstance(r["emails_unique"], set) else set() for r in results])),
        "cat_no_website": sum(r["a"] for r in results),
        "cat_website_only": sum(r["b"] for r in results),
        "cat_website_phone": sum(r["c"] for r in results),
        "cat_website_email": sum(r["d"] for r in results),
        "cat_phone_only": sum(r["f_"] for r in results),
        "cat_email_only": sum(r["g_"] for r in results),
        "cat_phone_email_no_web": sum(r["h_"] for r in results),
    })

    return rows_csv


def main():
    source = "no_missing_emails"
    for i, a in enumerate(sys.argv):
        if a == "--source" and i + 1 < len(sys.argv):
            source = sys.argv[i + 1]

    folder_path = BASE_DIR / source
    if not folder_path.is_dir():
        console.print(f"[red]ERROR:[/] '{source}' not found")
        console.print(f"Available: {', '.join(FOLDERS)}")
        sys.exit(1)

    paths = sorted(folder_path.glob("*.csv"))
    if not paths:
        console.print(f"[red]ERROR:[/] No CSV files in {source}/")
        sys.exit(1)

    results = [analyze(p) for p in paths]

    # Rich dashboard
    print_rich_dashboard(results, source)

    # TXT report
    txt = generate_txt(results, source)
    txt_path = BASE_DIR / "report.txt"
    txt_path.write_text(txt, encoding="utf-8")
    console.print(f"\n[dim]TXT report: {txt_path}[/]")

    # CSV report
    csv_rows = generate_csv(results)
    csv_path = BASE_DIR / "report.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=csv_rows[0].keys())
        w.writeheader()
        w.writerows(csv_rows)
    console.print(f"[dim]CSV report: {csv_path}[/]")


if __name__ == "__main__":
    main()
