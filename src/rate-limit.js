export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  return function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) {
      for (const [id, stamps] of hits) {
        if (stamps.every((at) => now - at >= windowMs)) hits.delete(id);
      }
    }
    return true;
  };
}
