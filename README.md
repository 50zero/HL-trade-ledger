# Hyperliquid Trade Ledger API

A dockerized service that provides detailed trade history, reconstructed position timelines, and cumulative PnL calculations for Hyperliquid users. Includes optional builder-only filtering for Insilico competitions.

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

### Common Query Parameters

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

### Using Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
# Edit .env with your values
```

Run with custom configuration:

```bash
TARGET_BUILDER=0x... docker compose up -d
```

## Builder-Only Mode

When `TARGET_BUILDER` is configured and `builderOnly=true` is passed:

1. **Trade Filtering**: Only trades with builder attribution matching TARGET_BUILDER are returned
2. **Taint Detection**: Positions with mixed builder/non-builder activity are marked as `tainted: true`
3. **Leaderboard Exclusion**: Tainted users are excluded from builder-only leaderboards

### Position Lifecycle Taint Rules

- A position lifecycle starts when netSize moves from 0 to non-zero
- A position lifecycle ends when netSize returns to 0
- If both builder and non-builder fills occur within the same lifecycle, it's marked as tainted

### Builder Attribution

Builder attribution is detected via the `builderFee` field in Hyperliquid fill data. A fill is considered builder-attributed if:
- `builderFee` exists and is greater than 0

**Note**: If a builder doesn't charge fees, fills won't be attributed. This is a limitation of the public API.

## PnL Calculation

### Relative Return (Capped Normalization)

```
effectiveCapital = min(equityAtFromMs, maxStartCapital)
returnPct = (realizedPnl / effectiveCapital) * 100
```

- `maxStartCapital` caps the effective capital to ensure fair comparison
- Return percentage is capped at ±1000% to prevent outliers

### Historical Equity Approximation

Since Hyperliquid doesn't provide historical equity snapshots, we approximate:

```
equityAtFromMs ≈ currentEquity - pnlEarnedSinceFromMs
```

This doesn't account for deposits/withdrawals but provides a reasonable estimate.

## Architecture

### Datasource Abstraction

The service implements a datasource abstraction layer (`IDataSource`) allowing easy swap to different backends:

```typescript
interface IDataSource {
  getUserFills(query: FillsQuery): Promise<RawFill[]>;
  getClearinghouseState(user: string): Promise<ClearinghouseState>;
  getName(): string;
  healthCheck(): Promise<boolean>;
}
```

Current implementation: `HyperliquidDataSource` (public API)

Future implementations can be added for:
- `InSilicoHLDataSource` - Insilico-HL backend
- `HyperServeDataSource` - HyperServe backend

### Rate Limiting

The Hyperliquid API has rate limits:
- 1200 weight per minute per IP
- `userFillsByTime`: 20 weight per request
- `clearinghouseState`: 2 weight per request

The service implements automatic rate limiting to stay within these bounds.

## Limitations & Assumptions

1. **Historical Equity**: No API for past equity snapshots; approximated from current state minus PnL
2. **Fill Limit**: Hyperliquid API returns max 10,000 recent fills; older data unavailable via public API
3. **Builder Attribution**: Only available when `builderFee > 0`; if builder doesn't charge fee, fills won't be attributed
4. **Leaderboard Users**: Users must be registered via POST /v1/users before appearing on leaderboard
5. **In-Memory Storage**: Registered users are lost on service restart

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Building Docker Image

```bash
docker build -t hl-trade-ledger .
```

### Running Without Docker Compose

```bash
docker run -d \
  -p 3000:3000 \
  -e TARGET_BUILDER=0x... \
  --name hl-ledger \
  hl-trade-ledger
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

## License

MIT
