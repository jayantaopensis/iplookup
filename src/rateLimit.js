'use strict';

// Fixed-window, in-memory limiter. Exposes the remaining quota in X-Rl and
// the seconds until reset in X-Ttl so clients can pace themselves.
function createRateLimiter({ limit, windowMs, keyOf }) {
  const windows = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
  }, windowMs);
  sweep.unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = keyOf(req);
    let w = windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      windows.set(key, w);
    }
    w.count += 1;

    const remaining = Math.max(0, limit - w.count);
    res.set('X-Rl', String(remaining));
    res.set('X-Ttl', String(Math.ceil((w.resetAt - now) / 1000)));

    if (w.count > limit) {
      res.set('Access-Control-Allow-Origin', '*');
      return res.status(429).json({ status: 'fail', message: 'rate limit exceeded' });
    }
    next();
  };
}

module.exports = { createRateLimiter };
