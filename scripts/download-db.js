'use strict';

// Downloads GeoLite2-City and GeoLite2-ASN into ./data.
// Needs a free MaxMind account: https://www.maxmind.com/en/geolite2/signup
//   MAXMIND_ACCOUNT_ID=123456 MAXMIND_LICENSE_KEY=xxxx npm run download-db

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const tar = require('tar');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file; fall back to the real environment.
}

const EDITIONS = ['GeoLite2-City', 'GeoLite2-ASN'];
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

async function download(edition, auth) {
  const url = `https://download.maxmind.com/geoip/databases/${edition}/download?suffix=tar.gz`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`${edition}: HTTP ${res.status} ${await res.text()}`);

  const tmp = path.join(os.tmpdir(), `${edition}-${Date.now()}.tar.gz`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  try {
    // Archive layout is <edition>_<date>/<edition>.mmdb; keep only the .mmdb.
    await tar.x({ file: tmp, cwd: DATA_DIR, strip: 1, filter: (p) => p.endsWith('.mmdb') });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  console.log(`  ${edition}.mmdb updated`);
}

async function main() {
  const { MAXMIND_ACCOUNT_ID: id, MAXMIND_LICENSE_KEY: key } = process.env;
  if (!id || !key) {
    console.error('Set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY (free at https://www.maxmind.com/en/geolite2/signup).');
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const auth = Buffer.from(`${id}:${key}`).toString('base64');
  console.log(`Downloading GeoLite2 databases into ${DATA_DIR}`);
  for (const edition of EDITIONS) await download(edition, auth);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
