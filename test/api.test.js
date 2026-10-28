'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, parseTrustProxy } = require('../src/server');
const { parseFields } = require('../src/fields');
const { classifyIp, utcOffsetSeconds } = require('../src/lookup');

// In-memory stand-ins for the two GeoLite2 readers.
const fakeDbs = {
  city: {
    get: (ip) =>
      ip === '8.8.8.8'
        ? {
            continent: { code: 'NA', names: { en: 'North America', de: 'Nordamerika' } },
            country: { iso_code: 'US', names: { en: 'United States', de: 'Vereinigte Staaten' } },
            subdivisions: [{ iso_code: 'CA', names: { en: 'California' } }],
            city: { names: { en: 'Mountain View' } },
            postal: { code: '94043' },
            location: { latitude: 37.422, longitude: -122.085, time_zone: 'America/Los_Angeles' },
          }
        : null,
  },
  asn: {
    get: (ip) => (ip === '8.8.8.8' ? { autonomous_system_number: 15169, autonomous_system_organization: 'GOOGLE' } : null),
  },
};

let server;
let base;

before(async () => {
  server = createApp(fakeDbs).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const get = (path) => fetch(base + path);

test('parseFields handles defaults, bitmasks and name lists', () => {
  assert.ok(parseFields().has('country'));
  assert.ok(!parseFields().has('currency'));
  assert.deepEqual([...parseFields('17')].sort(), ['city', 'country']);
  assert.deepEqual([...parseFields('lat, lon,bogus')], ['lat', 'lon']);
});

test('classifyIp separates public, private, reserved and invalid input', () => {
  assert.deepEqual(classifyIp('8.8.8.8'), { ip: '8.8.8.8' });
  assert.deepEqual(classifyIp('::ffff:8.8.8.8'), { ip: '8.8.8.8' });
  assert.equal(classifyIp('192.168.1.1').error, 'private range');
  assert.equal(classifyIp('127.0.0.1').error, 'private range');
  assert.equal(classifyIp('240.0.0.1').error, 'reserved range');
  assert.equal(classifyIp('999.1.1.1').error, 'invalid query');
});

test('utcOffsetSeconds reflects the zone offset', () => {
  assert.equal(utcOffsetSeconds('UTC'), 0);
  assert.equal(utcOffsetSeconds('Asia/Kolkata'), 19800);
});

test('default lookup returns the default fields in order', async () => {
  const res = await get('/json/8.8.8.8');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.deepEqual(Object.keys(body), [
    'query', 'status', 'country', 'countryCode', 'region', 'regionName', 'city',
    'zip', 'lat', 'lon', 'timezone', 'isp', 'org', 'as',
  ]);
  assert.equal(body.as, 'AS15169 GOOGLE');
});

test('fields, lang and extra fields work together', async () => {
  const body = await (await get('/json/8.8.8.8?fields=country,currency,continent&lang=de')).json();
  assert.deepEqual(body, { status: 'success', continent: 'Nordamerika', country: 'Vereinigte Staaten', currency: 'USD' });
});

test('private addresses fail with a message', async () => {
  const body = await (await get('/json/10.0.0.1')).json();
  assert.deepEqual(body, { query: '10.0.0.1', status: 'fail', message: 'private range' });
});

test('JSONP wraps the body and rejects unsafe callbacks', async () => {
  const ok = await get('/json/8.8.8.8?fields=country&callback=app.onGeo');
  assert.match(ok.headers.get('content-type'), /javascript/);
  assert.equal(await ok.text(), 'app.onGeo({"status":"success","country":"United States"});');
  assert.equal((await get('/json/8.8.8.8?callback=alert(1)')).status, 400);
});

test('TRUST_PROXY text maps to valid Express settings', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  for (const raw of ['false', 'true', '1', 'loopback, 10.0.0.0/8']) {
    assert.doesNotThrow(() => createApp(fakeDbs, { trustProxy: parseTrustProxy(raw) }));
  }
});

test('no rate limit by default', async () => {
  for (let i = 0; i < 60; i++) {
    const res = await get('/json/8.8.8.8?fields=country');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-rl'), null);
  }
});

test('rate limiter answers 429 once the window is used up', async () => {
  const limited = createApp(fakeDbs, { rateLimit: 1 }).listen(0);
  await new Promise((r) => limited.once('listening', r));
  const url = `http://127.0.0.1:${limited.address().port}/json/8.8.8.8`;
  try {
    const first = await fetch(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-rl'), '0');
    const second = await fetch(url);
    assert.equal(second.status, 429);
  } finally {
    limited.close();
  }
});
