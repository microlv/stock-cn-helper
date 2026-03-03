import json
import time
from pathlib import Path
import requests

BASE = "https://push2.eastmoney.com/api/qt/clist/get"
FS = "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
FIELDS = "f12,f14,f100,f2,f3,f6,f7,f8,f9,f15,f16"


def fetch_page(page_no: int, page_size: int = 200):
    params = {
        "pn": str(page_no),
        "pz": str(page_size),
        "po": "1",
        "np": "1",
        "ut": "bd1d9ddb04089700cf9c27f6f7426281",
        "fltt": "2",
        "invt": "2",
        "fid": "f3",
        "fs": FS,
        "fields": FIELDS,
    }
    r = requests.get(BASE, params=params, timeout=15)
    r.raise_for_status()
    payload = r.json()
    data = payload.get("data") or {}
    return int(data.get("total") or 0), data.get("diff") or []


def normalize_industry(raw: str) -> str:
    s = str(raw or "其他")
    if "银行" in s:
        return "银行"
    if "保险" in s:
        return "保险"
    if "半导体" in s or "芯片" in s:
        return "半导体"
    if "新能源" in s or "光伏" in s or "电池" in s:
        return "新能源"
    if "白酒" in s or "酿酒" in s:
        return "白酒"
    if "医药" in s or "生物" in s:
        return "医药"
    if "医疗" in s:
        return "医疗服务"
    if "家电" in s:
        return "家电"
    if "消费" in s or "食品" in s:
        return "消费"
    if "安防" in s:
        return "安防"
    return s[:8]


def to_stock(item):
    return {
        "code": str(item.get("f12") or ""),
        "name": item.get("f14") or "-",
        "industryRaw": item.get("f100") or "其他",
        "industry": normalize_industry(item.get("f100") or "其他"),
        "price": float(item.get("f2") or 0),
        "pct": float(item.get("f3") or 0),
        "amountWan": float(item.get("f6") or 0),
        "amplitude": float(item.get("f7") or 0),
        "turnover": float(item.get("f8") or 0),
        "pe": float(item.get("f9") or 0),
        "high": float(item.get("f15") or 0),
        "low": float(item.get("f16") or 0),
    }


def main():
    total, first = fetch_page(1, 200)
    pages = max(1, (total + 199) // 200)
    all_items = [to_stock(x) for x in first]

    for p in range(2, pages + 1):
        try:
            _, diff = fetch_page(p, 200)
            all_items.extend(to_stock(x) for x in diff)
        except Exception:
            continue

    out = {
        "updatedAt": int(time.time() * 1000),
        "total": len(all_items),
        "source": "eastmoney-server-fetch",
        "stocks": [s for s in all_items if s["code"] and s["price"] > 0],
    }

    out_path = Path("data/market.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_path} with {out['total']} items")


if __name__ == "__main__":
    main()
