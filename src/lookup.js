'use strict';

const path = require('node:path');
const fs = require('node:fs');
const dns = require('node:dns').promises;
const maxmind = require('maxmind');
const ipaddr = require('ipaddr.js');
const countryToCurrency = require('country-to-currency');
const { FIELDS } = require('./fields');

// Languages GeoLite2 ships names in.
const LANGUAGES = ['en', 'de', 'es', 'fr', 'ja', 'pt-BR', 'ru', 'zh-CN'];

const PRIVATE_RANGES = new Set(['private', 'loopback', 'linkLocal', 'uniqueLocal', 'carrierGradeNat']);

async function openDatabases(dataDir) {
  const cityPath = path.join(dataDir, 'GeoLite2-City.mmdb');
  const asnPath = path.join(dataDir, 'GeoLite2-ASN.mmdb');
  for (const file of [cityPath, asnPath]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing database ${file}. Run "npm run download-db" first (see README).`);
    }
  }
  const [city, asn] = await Promise.all([maxmind.open(cityPath), maxmind.open(asnPath)]);
  return { city, asn };
}

// Returns { ip } for a usable public address, or { error } with the API's failure message.
function classifyIp(input) {
  if (!ipaddr.isValid(input)) return { error: 'invalid query' };
  let addr = ipaddr.parse(input);
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  const range = addr.range();
  if (PRIVATE_RANGES.has(range)) return { error: 'private range' };
  if (range !== 'unicast') return { error: 'reserved range' };
  return { ip: addr.toString() };
}

// Accepts an IP or a hostname; hostnames resolve to their first address.
async function resolveQuery(query) {
  if (ipaddr.isValid(query)) return classifyIp(query);
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(query)) {
    return { error: 'invalid query' };
  }
  try {
    const { address } = await dns.lookup(query);
    return classifyIp(address);
  } catch {
    return { error: 'invalid query' };
  }
}

function localName(names, lang) {
  if (!names) return '';
  return names[lang] || names.en || '';
}

// Current offset from UTC in seconds for an IANA zone, honouring DST.
function utcOffsetSeconds(timeZone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName').value; // "GMT", "GMT+05:30", "GMT-07:00"
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
    if (!m) return 0;
    const seconds = Number(m[2]) * 3600 + Number(m[3]) * 60;
    return m[1] === '-' ? -seconds : seconds;
  } catch {
    return 0;
  }
}

async function reverseDns(ip) {
  try {
    const names = await dns.reverse(ip);
    return names[0] || '';
  } catch {
    return '';
  }
}

// Builds the full record for a public IP, then trims it to the requested fields.
async function lookup(dbs, ip, { fields, lang = 'en' }) {
  const city = dbs.city.get(ip) || {};
  const asn = dbs.asn.get(ip) || {};
  const subdivision = (city.subdivisions && city.subdivisions[0]) || {};
  const countryCode = (city.country && city.country.iso_code) || '';
  const timezone = (city.location && city.location.time_zone) || '';
  const asOrg = asn.autonomous_system_organization || '';

  const full = {
    query: ip,
    status: 'success',
    continent: localName(city.continent && city.continent.names, lang),
    continentCode: (city.continent && city.continent.code) || '',
    country: localName(city.country && city.country.names, lang),
    countryCode,
    region: subdivision.iso_code || '',
    regionName: localName(subdivision.names, lang),
    city: localName(city.city && city.city.names, lang),
    district: '',
    zip: (city.postal && city.postal.code) || '',
    lat: city.location ? city.location.latitude : null,
    lon: city.location ? city.location.longitude : null,
    timezone,
    offset: timezone ? utcOffsetSeconds(timezone) : 0,
    currency: countryToCurrency[countryCode] || '',
    isp: asOrg,
    org: asOrg,
    as: asn.autonomous_system_number ? `AS${asn.autonomous_system_number} ${asOrg}`.trim() : '',
    asname: asOrg,
    reverse: fields.has('reverse') ? await reverseDns(ip) : '',
    mobile: null,
    proxy: null,
    hosting: null,
  };

  return pick(full, fields);
}

function failure(query, message, fields) {
  return pick({ query, status: 'fail', message }, fields);
}

// Keeps requested keys in canonical order. "status" is always kept so clients can branch on it.
function pick(record, fields) {
  const out = {};
  for (const { name } of FIELDS) {
    if (name in record && (fields.has(name) || name === 'status')) out[name] = record[name];
  }
  return out;
}

module.exports = { LANGUAGES, openDatabases, classifyIp, resolveQuery, lookup, failure, utcOffsetSeconds };
