# IP Tracker

Self-hosted IP geolocation JSON API with an interactive docs page. Lookups run
against local MaxMind GeoLite2 databases, so there are no third-party calls and
no external rate limits.

## Setup

1. Create a free MaxMind account at <https://www.maxmind.com/en/geolite2/signup>,
   then generate a license key under **Manage License Keys**.
2. Install and download the databases (`GeoLite2-City` and `GeoLite2-ASN` into `./data`):

   ```powershell
   npm install
   $env:MAXMIND_ACCOUNT_ID="123456"; $env:MAXMIND_LICENSE_KEY="your_key"; npm run download-db
   ```

3. Start the server and open <http://localhost:3000>:

   ```powershell
   npm start
   ```

MaxMind updates GeoLite2 twice a week. Rerun `npm run download-db` to refresh, then restart the server.

## Docker

Put your MaxMind credentials in `.env` (`MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`), then:

```bash
docker compose up -d --build
```

On first start the container downloads the databases into the `geodata` volume, so later
restarts are instant. To pull fresh data, restart with `REFRESH_DB_ON_START=true` in `.env`.
Behind a reverse proxy (nginx, Caddy, Traefik), add `TRUST_PROXY=1` to `.env` so caller
lookups use the visitor's IP.

Without compose:

```bash
docker build -t ip-tracker .
docker run -d -p 3000:3000 --env-file .env -v geodata:/app/data --name ip-tracker ip-tracker
```

## API

`GET /json/{ip-or-hostname}?fields=…&lang=…&callback=…`

| Parameter | Meaning |
|---|---|
| `fields` | Comma list (`country,city,lat,lon`) or the sum of field codes (see the Fields table on the page or `GET /api/fields`) |
| `lang` | `en`, `de`, `es`, `fr`, `ja`, `pt-BR`, `ru`, `zh-CN` |
| `callback` | JSONP function name |

Leaving the address out looks up the caller. Failures return `"status": "fail"`
with `message` set to `private range`, `reserved range` or `invalid query`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Folder holding the `.mmdb` files |
| `RATE_LIMIT` | `0` (unlimited) | Requests per minute per client IP when set above 0 (headers `X-Rl`, `X-Ttl`; 429 when exceeded) |
| `TRUST_PROXY` | off | Set (e.g. `1`) when running behind a reverse proxy so client IPs come from `X-Forwarded-For` |

## Data limitations

GeoLite2 does not include `district`, `mobile`, `proxy` or `hosting`. These
fields are always empty or `null`. `isp`, `org` and `asname` all come from the
ASN database's organization name.

## Licence note

GeoLite2 data is © MaxMind and licensed under the GeoLite2 EULA, which requires
the attribution shown in the page footer.

## Tests

```powershell
npm test
```
