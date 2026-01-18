# Hyperliquid Trade Ledger API

A dockerized API service that provides trade history, reconstructed position timelines, and cumulative PnL calculations for Hyperliquid users. 

## Quick Start (One Command)

```bash
docker compose up -d
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/trades` | GET | Get normalized trade fills |
| `/v1/positions/history` | GET | Get position history timeline |
| `/v1/pnl` | GET | Get PnL summary |
| `/v1/leaderboard` | GET | Get ranked leaderboard |
| `/v1/users` | GET | List registered users |
| `/v1/users` | POST | Register user for leaderboard |
| `/v1/users/:user` | DELETE | Unregister user |

### Example Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | string | Wallet address (0x...) - Required for trades/positions/pnl |
| `coin` | string | Filter by coin (e.g., BTC, ETH) |
| `fromMs` | number | Start timestamp in milliseconds |
| `toMs` | number | End timestamp in milliseconds |
| `builderOnly` | boolean | Filter to builder-attributed trades only |

### Example Requests

```bash
# Health check
curl http://localhost:3000/health

# Get trades for a wallet
curl "http://localhost:3000/v1/trades?user=0x0e09b56ef137f417e424f1265425e93bfff77e17"

# Get BTC position history
curl "http://localhost:3000/v1/positions/history?user=0x...&coin=BTC"

# Get PnL summary
curl "http://localhost:3000/v1/pnl?user=0x..."

# Get PnL with time range and capital cap
curl "http://localhost:3000/v1/pnl?user=0x...&fromMs=1704067200000&toMs=1704153600000&maxStartCapital=10000"

# Register a user for leaderboard
curl -X POST http://localhost:3000/v1/users \
  -H "Content-Type: application/json" \
  -d '{"user": "0x0e09b56ef137f417e424f1265425e93bfff77e17"}'

# Get leaderboard by PnL
curl "http://localhost:3000/v1/leaderboard?metric=pnl"

# Get leaderboard by return percentage (with capital cap)
curl "http://localhost:3000/v1/leaderboard?metric=returnPct&maxStartCapital=1000"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `TARGET_BUILDER` | - | Builder address for builderOnly filtering |
| `DATASOURCE_TYPE` | hyperliquid | Data source (hyperliquid, insilico-hl, hyperserve) |
| `HYPERLIQUID_BASE_URL` | https://api.hyperliquid.xyz | Hyperliquid API URL |
| `CACHE_FILLS_TTL_MS` | 60000 | Fills cache TTL (ms) |
| `CACHE_CLEARINGHOUSE_TTL_MS` | 5000 | Clearinghouse cache TTL (ms) |
| `MAX_START_CAPITAL` | 1000000 | Default max capital for return calculation |
| `LOG_LEVEL` | info | Log level (debug, info, warn, error) |


## PnL Calculation

### Relative Return

```
effectiveCapital = min(equityAtFromMs, maxStartCapital)
returnPct = (realizedPnl / effectiveCapital) * 100
```

- `maxStartCapital` caps the effective capital to ensure fair comparison
- Return percentage is capped for outlier prevention


### Rate Limiting

The Hyperliquid API has rate limits:
- 1200 weight per minute per IP
- `userFillsByTime`: 20 weight per request
- `clearinghouseState`: 2 weight per request

The service accounts for rate limiting to stay within these bounds. *Large requests may take longer to build the entire result*


### Building Docker Image

```bash
docker build -t hl-trade-ledger .
```

## Response Examples

### GET /v1/trades

```json
{
  "trades": [
    {
      "timeMs": 1704067200000,
      "coin": "BTC",
      "side": "buy",
      "px": 42000.50,
      "sz": 0.1,
      "fee": 4.20,
      "closedPnl": 0,
      "builder": "builder"
    }
  ]
}
```

### GET /v1/positions/history

```json
{
  "positions": [
    {
      "timeMs": 1704067200000,
      "coin": "BTC",
      "netSize": 0.1,
      "avgEntryPx": 42000.50,
      "tainted": false
    }
  ]
}
```

### GET /v1/pnl

```json
{
  "realizedPnl": 1500.00,
  "returnPct": 15.0,
  "feesPaid": 150.00,
  "tradeCount": 42,
  "tainted": false,
  "effectiveCapital": 10000.00
}
```

### GET /v1/leaderboard

```json
{
  "entries": [
    {
      "rank": 1,
      "user": "0x1234...",
      "metricValue": 5000.00,
      "tradeCount": 100,
      "tainted": false
    }
  ],
  "generatedAt": 1704153600000
}
```

