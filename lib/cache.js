const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function cachePath(name) {
  return path.join(CACHE_DIR, `${name}__${todayKey()}.json`);
}

// Returns cached data for `name` if fetched today; otherwise calls fetchFn(),
// caches the result (dated to today) and returns it. If fetchFn() throws and
// a stale (older) cache file for `name` exists, falls back to that instead of failing.
async function getOrFetch(name, fetchFn) {
  const fresh = cachePath(name);
  if (fs.existsSync(fresh)) {
    return JSON.parse(fs.readFileSync(fresh, 'utf8'));
  }

  try {
    const data = await fetchFn();
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(fresh, JSON.stringify({ fetchedAt: new Date().toISOString(), data }, null, 2), 'utf8');
    return { fetchedAt: new Date().toISOString(), data };
  } catch (err) {
    const stale = findMostRecentStale(name);
    if (stale) {
      console.warn(`[cache] fetch failed for "${name}" (${err.message}); using stale cache from ${stale.file}`);
      return JSON.parse(fs.readFileSync(stale.file, 'utf8'));
    }
    throw err;
  }
}

function findMostRecentStale(name) {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const prefix = `${name}__`;
  const candidates = fs.readdirSync(CACHE_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => ({ file: path.join(CACHE_DIR, f), mtime: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0] || null;
}

module.exports = { getOrFetch, todayKey };
