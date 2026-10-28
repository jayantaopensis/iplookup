'use strict';

const path = require('node:path');
const express = require('express');
const { FIELDS, parseFields } = require('./fields');
const { LANGUAGES, openDatabases, resolveQuery, lookup, failure } = require('./lookup');
const { createRateLimiter } = require('./rateLimit');

const CALLBACK_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

function clientIp(req) {
  return (req.ip || '').replace(/^::ffff:/, '');
}

// rateLimit is requests per minute per client IP; 0 turns limiting off.
function createApp(dbs, { rateLimit = 0, windowMs = 60_000, trustProxy = false } = {}) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');

  app.get('/api/fields', (req, res) => {
    res.json({ fields: FIELDS, languages: LANGUAGES });
  });

  const limiter =
    rateLimit > 0
      ? createRateLimiter({ limit: rateLimit, windowMs, keyOf: clientIp })
      : (req, res, next) => next();

  app.get(['/json', '/json/:query'], limiter, async (req, res, next) => {
    try {
      const fields = parseFields(req.query.fields);
      const lang = LANGUAGES.includes(req.query.lang) ? req.query.lang : 'en';
      const query = (req.params.query || clientIp(req)).trim();

      const resolved = await resolveQuery(query);
      const body = resolved.error
        ? failure(query, resolved.error, fields)
        : await lookup(dbs, resolved.ip, { fields, lang });

      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-store');

      const callback = req.query.callback;
      if (callback !== undefined) {
        if (!CALLBACK_RE.test(callback) || callback.length > 64) {
          return res.status(400).json({ status: 'fail', message: 'invalid callback' });
        }
        return res.type('application/javascript').send(`${callback}(${JSON.stringify(body)});`);
      }
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ status: 'fail', message: 'internal error' });
  });

  return app;
}

async function main() {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch {
    // No .env file; fall back to the real environment.
  }
  const port = Number(process.env.PORT) || 3000;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const dbs = await openDatabases(dataDir);
  const app = createApp(dbs, {
    rateLimit: Number(process.env.RATE_LIMIT) || 0,
    trustProxy: process.env.TRUST_PROXY || false,
  });
  app.listen(port, () => console.log(`IP Tracker listening on http://localhost:${port}`));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { createApp, main };
