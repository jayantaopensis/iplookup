'use strict';

// Container entry point: fetch the GeoLite2 databases on first start
// (when the data volume is empty), then run the server.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const required = ['GeoLite2-City.mmdb', 'GeoLite2-ASN.mmdb'];
const missing = required.filter((f) => !fs.existsSync(path.join(dataDir, f)));

if (missing.length > 0 || process.env.REFRESH_DB_ON_START === 'true') {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'download-db.js')], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Could not download GeoLite2 databases; check MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY.');
    process.exit(1);
  }
}

require('../src/server')
  .main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
