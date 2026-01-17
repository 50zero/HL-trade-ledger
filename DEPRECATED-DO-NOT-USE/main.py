import time
import random
import requests
import pandas as pd
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="Hyperliquid Trade Ledger API (Test)")

# --- CONFIGURATION ---
# This is the address you want to filter for (Insilico / Based Deployer)
# You can replace this with the specific address found in the 'b' field if needed.
TARGET_BUILDER_ADDRESS = "0x2868fc0d9786a740b491577a43502259efa78a39"
HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info"

# Simple in-memory cache to avoid hitting rate limits when re-fetching the same txs
# Format: { "tx_hash": "builder_address_or_None" }
TX_CACHE = {}
SESSION = requests.Session()

# Basic rate limiting and retry behavior to reduce 429s.
MIN_REQUEST_INTERVAL = 0.15  # ~6-7 requests/sec across all endpoints
MAX_RETRIES = 4
BACKOFF_BASE = 0.25
LAST_REQUEST_AT = 0.0

# Known builder address labels. Keep keys lowercase.
BUILDER_ADDRESS_LABELS = {
    "0x2868fc0d9786a740b491577a43502259efa78a39": "Insilico",
    # Add Phantom/BaseApp/etc here as needed.
}

# --- DATA MODELLING ---

class Trade(BaseModel):
    time: int
    coin: str
    side: str
    px: float
    sz: float
    fee: float
    closedPnl: float
    builder: Optional[str] = None
    builderAddress: Optional[str] = None
    hash: Optional[str] = None

class PositionState(BaseModel):
    time: int
    coin: str
    netSize: float
    avgEntryPx: float
    tainted: bool

class PnLResponse(BaseModel):
    realizedPnl: float
    returnPct: float
    feesPaid: float
    tradeCount: int
    tainted: bool
    volume: float

# --- HELPER FUNCTIONS ---

def _normalize_address(addr: Optional[str]) -> Optional[str]:
    if not addr or not isinstance(addr, str):
        return None
    return addr.lower()

def _rate_limited_post(payload: Dict[str, Any]) -> Dict[str, Any]:
    global LAST_REQUEST_AT

    now = time.monotonic()
    wait_for = MIN_REQUEST_INTERVAL - (now - LAST_REQUEST_AT)
    if wait_for > 0:
        time.sleep(wait_for)

    for attempt in range(MAX_RETRIES):
        response = SESSION.post(HYPERLIQUID_API_URL, json=payload, timeout=15)
        if response.status_code == 429:
            backoff = BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 0.1)
            time.sleep(backoff)
            continue
        response.raise_for_status()
        LAST_REQUEST_AT = time.monotonic()
        return response.json()

    response.raise_for_status()
    return {}

def _find_builder_address(data: Any) -> Optional[str]:
    if isinstance(data, dict):
        builder = data.get("builder")
        if isinstance(builder, dict):
            addr = builder.get("b")
            if addr:
                return addr
        for value in data.values():
            addr = _find_builder_address(value)
            if addr:
                return addr
    elif isinstance(data, list):
        for value in data:
            addr = _find_builder_address(value)
            if addr:
                return addr
    return None

def _label_builder_address(addr: Optional[str]) -> Optional[str]:
    norm = _normalize_address(addr)
    if not norm:
        return None
    return BUILDER_ADDRESS_LABELS.get(norm, norm)

def fetch_hyperliquid_fills(user: str, start_time: int, end_time: int) -> List[Dict]:
    """
    Fetches raw fills from Hyperliquid's public info endpoint.
    """
    payload = {
        "type": "userFillsByTime",
        "user": user,
        "startTime": start_time,
        "endTime": end_time
    }
    
    try:
        data = _rate_limited_post(payload)
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print(f"Error fetching fills: {e}")
        return []

def get_builder_from_tx(tx_hash: str) -> Optional[str]:
    """
    Fetches full transaction details to find the 'builder' (b) field.
    This is necessary because 'userFills' does NOT contain the builder address.
    """
    if not tx_hash:
        return None
    
    # Check Cache first
    if tx_hash in TX_CACHE:
        return TX_CACHE[tx_hash]

    payload = {
        "type": "queryTx",
        "hash": tx_hash
    }
    
    try:
        data = _rate_limited_post(payload)
        builder_address = _find_builder_address(data)
        
        # Cache the result
        TX_CACHE[tx_hash] = _normalize_address(builder_address)
        return builder_address
        
    except Exception as e:
        print(f"Error fetching tx details for {tx_hash}: {e}")
        return None

def normalize_trade(fill: Dict) -> Dict:
    """
    Maps Hyperliquid raw fill format to the challenge's normalized format.
    Now performs a look-up for the builder address.
    """
    side = "Buy" if fill.get("side") == "B" else "Sell"
    tx_hash = fill.get("hash") or fill.get("txHash")
    builder_addr = fill.get("builder") or fill.get("builderAddress")
    builder_addr = _normalize_address(builder_addr)
    
    # --- REAL ATTRIBUTION LOGIC ---
    # We now fetch the actual builder address from the transaction details
    # instead of guessing based on fees.
    if not builder_addr:
        builder_addr = _normalize_address(get_builder_from_tx(tx_hash))
    builder_label = _label_builder_address(builder_addr)

    return {
        "time": int(fill.get("time")),
        "coin": fill.get("coin"),
        "side": side,
        "px": float(fill.get("px")),
        "sz": float(fill.get("sz")),
        "fee": float(fill.get("fee", 0)),
        "closedPnl": float(fill.get("closedPnl", 0)),
        "builder": builder_label,
        "builderAddress": builder_addr,
        "hash": tx_hash
    }

def reconstruct_lifecycle(trades: List[Dict], target_builder: str):
    df = pd.DataFrame(trades)
    if df.empty:
        return []

    df = df.sort_values("time")
    
    history = []
    current_qty = 0.0
    current_avg_px = 0.0
    
    lifecycle_tainted = False

    for index, row in df.iterrows():
        size = row['sz']
        price = row['px']
        direction = 1 if row['side'] == "Buy" else -1
        signed_size = size * direction

        # Check attribution for taint
        # IMPORTANT: 'target_builder' should be the address, not "BASED Deployer"
        is_builder_trade = (row.get('builder') == target_builder)
        
        if abs(current_qty) > 0 and not is_builder_trade:
            lifecycle_tainted = True
        
        if current_qty == 0 and not is_builder_trade:
             lifecycle_tainted = True

        # Update Position State
        if (current_qty >= 0 and direction == 1) or (current_qty <= 0 and direction == -1):
            total_cost = (abs(current_qty) * current_avg_px) + (size * price)
            current_qty += signed_size
            current_avg_px = total_cost / abs(current_qty) if current_qty != 0 else 0
        else:
            current_qty += signed_size
            if abs(current_qty) < 1e-9: 
                current_qty = 0
                current_avg_px = 0
                lifecycle_tainted = False 

        history.append({
            "time": row['time'],
            "coin": row['coin'],
            "netSize": current_qty,
            "avgEntryPx": current_avg_px,
            "tainted": lifecycle_tainted
        })
        
    return history

# --- API ENDPOINTS ---

@app.get("/v1/trades", response_model=List[Trade])
def get_trades(
    user: str,
    coin: Optional[str] = None,
    fromMs: int = 0,
    toMs: int = int(time.time() * 1000),
    builderOnly: bool = False
):
    raw_data = fetch_hyperliquid_fills(user, fromMs, toMs)
    
    # Normalize (this will now be slower as it fetches tx details for each trade)
    normalized = []
    print(f"Processing {len(raw_data)} trades... this may take a moment.")
    for f in raw_data:
        normalized.append(normalize_trade(f))

    if coin:
        normalized = [t for t in normalized if t["coin"] == coin]

    if builderOnly:
        # Ensure TARGET_BUILDER_ADDRESS matches the format returned by the API (usually lowercase 0x...)
        target = _normalize_address(TARGET_BUILDER_ADDRESS)
        normalized = [t for t in normalized if t["builderAddress"] == target]

    return normalized

@app.get("/v1/pnl", response_model=PnLResponse)
def get_pnl(user: str):
    # Simplified for brevity - logic is same as before but uses new normalize_trade
    raw_data = fetch_hyperliquid_fills(user, 0, int(time.time()*1000))
    trades = [normalize_trade(f) for f in raw_data]
    
    realized_pnl = sum(t['closedPnl'] for t in trades)
    fees = sum(t['fee'] for t in trades)
    vol = sum(t['px'] * t['sz'] for t in trades)
    
    return {
        "realizedPnl": realized_pnl,
        "returnPct": 0,
        "feesPaid": fees,
        "tradeCount": len(trades),
        "tainted": False,
        "volume": vol
    }

# --- ROOT ENDPOINT ---
@app.get("/")
def read_root():
    return {"status": "active", "docs_url": "http://127.0.0.1:8001/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
