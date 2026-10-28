'use strict';

// Every field the API can return, in output order. `bit` lets clients request
// a subset with one integer (sum of bits), `def` marks fields returned by default.
const FIELDS = [
  { name: 'query', bit: 8192, def: true, type: 'string', example: '8.8.8.8', desc: 'The IP address that was looked up' },
  { name: 'status', bit: 16384, def: true, type: 'string', example: 'success', desc: '"success" or "fail"' },
  { name: 'message', bit: 32768, def: true, type: 'string', example: 'private range', desc: 'Present only on failure: "private range", "reserved range" or "invalid query"' },
  { name: 'continent', bit: 1048576, def: false, type: 'string', example: 'North America', desc: 'Continent name' },
  { name: 'continentCode', bit: 2097152, def: false, type: 'string', example: 'NA', desc: 'Two-letter continent code' },
  { name: 'country', bit: 1, def: true, type: 'string', example: 'United States', desc: 'Country name' },
  { name: 'countryCode', bit: 2, def: true, type: 'string', example: 'US', desc: 'ISO 3166-1 alpha-2 country code' },
  { name: 'region', bit: 4, def: true, type: 'string', example: 'CA', desc: 'Region / state code (ISO 3166-2 suffix)' },
  { name: 'regionName', bit: 8, def: true, type: 'string', example: 'California', desc: 'Region / state name' },
  { name: 'city', bit: 16, def: true, type: 'string', example: 'Mountain View', desc: 'City name' },
  { name: 'district', bit: 524288, def: false, type: 'string', example: '', desc: 'City subdivision (not available in GeoLite2, always empty)' },
  { name: 'zip', bit: 32, def: true, type: 'string', example: '94043', desc: 'Postal code' },
  { name: 'lat', bit: 64, def: true, type: 'float', example: '37.422', desc: 'Latitude' },
  { name: 'lon', bit: 128, def: true, type: 'float', example: '-122.085', desc: 'Longitude' },
  { name: 'timezone', bit: 256, def: true, type: 'string', example: 'America/Los_Angeles', desc: 'IANA time zone' },
  { name: 'offset', bit: 33554432, def: false, type: 'int', example: '-25200', desc: 'Current UTC offset of the time zone in seconds (DST aware)' },
  { name: 'currency', bit: 8388608, def: false, type: 'string', example: 'USD', desc: 'ISO 4217 currency of the country' },
  { name: 'isp', bit: 512, def: true, type: 'string', example: 'GOOGLE', desc: 'Network operator (from the ASN database)' },
  { name: 'org', bit: 1024, def: true, type: 'string', example: 'GOOGLE', desc: 'Organization (from the ASN database)' },
  { name: 'as', bit: 2048, def: true, type: 'string', example: 'AS15169 GOOGLE', desc: 'AS number and organization' },
  { name: 'asname', bit: 4194304, def: false, type: 'string', example: 'GOOGLE', desc: 'AS organization name' },
  { name: 'reverse', bit: 4096, def: false, type: 'string', example: 'dns.google', desc: 'Reverse DNS hostname (slows the response)' },
  { name: 'mobile', bit: 65536, def: false, type: 'bool|null', example: 'null', desc: 'Cellular connection (not in GeoLite2, always null)' },
  { name: 'proxy', bit: 131072, def: false, type: 'bool|null', example: 'null', desc: 'Proxy / VPN / Tor (not in GeoLite2, always null)' },
  { name: 'hosting', bit: 16777216, def: false, type: 'bool|null', example: 'null', desc: 'Hosting / data center (not in GeoLite2, always null)' },
];

const BY_NAME = new Map(FIELDS.map((f) => [f.name, f]));
const DEFAULT_FIELDS = new Set(FIELDS.filter((f) => f.def).map((f) => f.name));

// Accepts a bitmask ("66846719"), a comma list ("country,city,lat") or nothing.
// Unknown names are ignored rather than rejected.
function parseFields(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return new Set(DEFAULT_FIELDS);
  }
  const value = String(raw).trim();
  if (/^\d+$/.test(value)) {
    const mask = Number(value);
    return new Set(FIELDS.filter((f) => Math.floor(mask / f.bit) % 2 === 1).map((f) => f.name));
  }
  return new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter((name) => BY_NAME.has(name)),
  );
}

module.exports = { FIELDS, DEFAULT_FIELDS, parseFields };
