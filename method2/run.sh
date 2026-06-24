#!/usr/bin/env bash
# P-1 Scraper (method2) — sequential batches, resume safe, live query progress
# Usage: ./run.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/output"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$OUT_DIR" "$LOG_DIR"

BATCHES=("$SCRIPT_DIR"/batches/batch_*.txt)
TOTAL=${#BATCHES[@]}
DONE=0

echo "method2 — $TOTAL batches, $(wc -l < "$SCRIPT_DIR/queries.txt") queries"
echo ""

for f in "${BATCHES[@]}"; do
  bn=$(basename "$f" .txt)
  csv="$OUT_DIR/${bn}.csv"

  if [[ -f "$csv" ]]; then
    rows=$(tail -n +2 "$csv" 2>/dev/null | wc -l)
    if [[ $rows -gt 0 ]]; then
      echo "  [$DONE/$TOTAL] $bn — ✅ done ($rows leads)"
      ((DONE++))
      continue
    fi
  fi

  echo "  [$DONE/$TOTAL] $bn — ▶ running..."
  log="$LOG_DIR/${bn}.log"
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v gmaps-playwright-cache:/opt \
    -v "$f:/queries.txt:ro" \
    -v "$OUT_DIR:/out" \
    gosom/google-maps-scraper \
    -input /queries.txt \
    -results "/out/${bn}.csv" \
    -depth 20 \
    -email \
    -c 4 \
    -exit-on-inactivity 3m > "$log" 2>&1 &
  DPID=$!

  # Live progress: parse JSON log lines for per-query lead counts
  declare -A JOB_P JOB_Q
  log_offset=1
  last_q=""
  while kill -0 "$DPID" 2>/dev/null; do
    total=$(wc -l < "$log" 2>/dev/null || echo 0)
    if [[ $total -gt $log_offset ]]; then
      while IFS= read -r line; do
        ((log_offset++))
        jobid=$(echo "$line" | grep -oP '"jobid":"\K[^"]+')
        [[ -z "$jobid" ]] && continue
        if echo "$line" | grep -qP '"message":"\d+ places found"'; then
          n=$(echo "$line" | grep -oP '"message":"\K\d+')
          JOB_P["$jobid"]=$n
        fi
        if echo "$line" | grep -q '"message":"job finished"'; then
          search=$(echo "$line" | grep -oP 'search/\K[^ ,?]+' | sed 's/+/ /g')
          if [[ -n "$search" && -z "${JOB_Q[$jobid]+_}" ]]; then
            JOB_Q["$jobid"]="$search"
            p=${JOB_P[$jobid]:-?}
            echo "    ✓ $search ($p leads)"
          fi
        fi
      done < <(tail -n +"$log_offset" "$log" 2>/dev/null)
    fi
    sleep 2
  done

  wait "$DPID"
  ((DONE++))

  rows=$(tail -n +2 "$csv" 2>/dev/null | wc -l)
  echo "  [$DONE/$TOTAL] $bn — ✅ done ($rows leads)"
  echo ""
done

echo "═══════════════════════════════════════"
echo "  ALL DONE — $TOTAL batches"
total=0
for f in "$OUT_DIR"/*.csv; do
  r=$(tail -n +2 "$f" 2>/dev/null | wc -l)
  total=$((total + r))
done
echo "  Total leads: $total"
