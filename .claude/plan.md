# Fix: Heatmap inconsistent route counts on scan/rescan

## Root Causes

1. **`fetchMapGPS()` tries 4 URLs per activity** — URLs 1, 3, and 4 all hit the same intervals.icu endpoint. When the API rate-limits or times out one request, the next URL in the chain may or may not succeed depending on timing. This creates non-deterministic results.

2. **No distinction between "no GPS data" vs "transient error"** — `_hmFetchOneRoute()` catches ALL errors and returns `null`. Rate limits (429), timeouts, and network blips are treated the same as genuinely missing GPS. These activities get added to the `noGpsIds` blacklist and aren't retried.

3. **Batch of 5 concurrent requests x up to 4 URLs each = up to 20 simultaneous API hits** — with only 150ms between batches, this easily triggers rate limiting. Different timing on each scan means different activities fail.

## Fix Plan

### 1. Fix `fetchMapGPS()` — deduplicate URL attempts (app.js ~line 9020)
- Use a single URL strategy: try the authenticated API endpoint once
- Only fall back to the proxy URL if the primary fails with a non-404 error
- Remove redundant URLs 2 and 4 that hit the same endpoint differently
- Add 8s timeout per request to avoid hangs
- Return `{ status: 404 }` vs throwing on transient errors so callers can distinguish

### 2. Fix `_hmFetchOneRoute()` — distinguish errors from missing data (heatmap.js ~line 742)
- Return a sentinel `{ noGps: true }` when the API returns 404 or empty data
- Return `{ error: true }` on transient errors (network, timeout, rate limit)
- Only add to `noGpsIds` blacklist when we get a definitive "no GPS" response

### 3. Fix `_hmFetchAllRoutes()` — add retry for transient failures (heatmap.js ~line 782)
- Reduce batch size from 5 to 3 concurrent requests
- Increase delay between batches from 150ms to 300ms
- Collect transient failures separately from "no GPS" activities
- After first pass, retry transient failures once with a longer delay (1s between batches)
- Only blacklist activities that definitively have no GPS

### 4. Add rate-limit awareness
- Check `rlGetCount()` before each batch — if approaching limit, slow down
- If we get a 429 response, pause for 5 seconds before continuing

## Files to Change
- `C:\Users\Luka\Downloads\CyclingHub\app.js` — `fetchMapGPS()` (~line 9020)
- `C:\Users\Luka\Downloads\CyclingHub\js\heatmap.js` — `_hmFetchOneRoute()` (~line 742) and `_hmFetchAllRoutes()` (~line 782)
