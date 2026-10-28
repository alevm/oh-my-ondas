#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Check a shopping cart against the parts plan (docs/hardware/parts-plan.csv).

Usage:
  firmware/tools/cart_check.py cart.txt          # pasted cart text, or lines "1207 x2"
  firmware/tools/cart_check.py -                 # read the cart from stdin
  firmware/tools/cart_check.py --plan            # plan only: what is still missing

Per plan group: need + spare against owned + ordered + cart.
  SHORT     below need: the build stops
  NO SPARE  need met, spare not
  OVER      more than need + spare: remove the extra
  ASK       owned count or condition unknown: the user decides
  OK
Cart items that match no plan group are NOT IN PLAN.
Exit 1 if anything is SHORT, NO SPARE, OVER or NOT IN PLAN.
"""

import csv
import re
import sys
from pathlib import Path

PLAN = Path(__file__).resolve().parents[2] / "docs" / "hardware" / "parts-plan.csv"


def load_plan():
    with open(PLAN, newline="") as f:
        rows = list(csv.DictReader(f))
    for n, row in enumerate(rows, 2):
        if None in row or None in row.values():  # an unquoted comma shifts the columns
            sys.exit(f"{PLAN}:{n}: wrong column count, quote fields that contain commas")
    return rows


def parse_cart(text):
    """Return {id: qty}. 'PID: 1207' (Adafruit cart page) counts 1 unless a quantity follows."""
    cart = {}
    for m in re.finditer(r"PID:\s*([A-Za-z0-9-]+)", text):
        cart[m.group(1)] = cart.get(m.group(1), 0) + 1
    if cart:
        return cart, True
    for line in text.splitlines():
        m = re.match(r"\s*([A-Za-z0-9.-]+)\s*(?:[x×*]\s*(\d+))?\s*$", line)
        if m:
            cart[m.group(1)] = cart.get(m.group(1), 0) + int(m.group(2) or 1)
    return cart, False


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    plan = load_plan()
    cart, assumed = ({}, False) if argv[1] == "--plan" else parse_cart(
        sys.stdin.read() if argv[1] == "-" else Path(argv[1]).read_text())

    index = {}
    for row in plan:
        for i in row["ids"].split():
            index[i] = row["group"]
    in_cart = {}
    unknown = []
    for i, q in cart.items():
        if i in index:
            in_cart[index[i]] = in_cart.get(index[i], 0) + q
        else:
            unknown.append((i, q))

    bad = False
    print(f"{'group':12} {'need':>4} {'spare':>5} {'owned':>5} {'ord':>4} {'cart':>4}  status")
    for row in plan:
        g, need, spare = row["group"], int(row["need"]), int(row["spare"])
        owned_unknown = row["owned"] == "?"
        have = (0 if owned_unknown else int(row["owned"])) + int(row["ordered"])
        c = in_cart.get(g, 0)
        total = have + c
        if argv[1] != "--plan" and c == 0 and total >= need + spare and not row["condition"]:
            continue  # nothing to say: covered and not in this cart
        if row["condition"]:
            status = f"ASK: {row['condition']}"
        elif total < need:
            status = f"SHORT by {need - total}" + (" (owned unknown)" if owned_unknown else "")
        elif total < need + spare:
            status = "NO SPARE"
        elif total > need + spare and c:
            status = f"OVER by {total - need - spare}: remove from cart"
        elif owned_unknown:
            status = "OK (owned unknown, not counted)"
        else:
            status = "OK"
        bad |= status.startswith(("SHORT", "NO SPARE", "OVER"))
        print(f"{g:12} {need:>4} {spare:>5} {row['owned']:>5} {row['ordered']:>4} {c:>4}  {status}")
        print(f"{'':12} source: {row['source']}")
    for i, q in unknown:
        bad = True
        print(f"{i:12} {'':>4} {'':>5} {'':>5} {'':>4} {q:>4}  NOT IN PLAN: remove, or add it to the plan first")
    if assumed:
        print("cart quantities read as 1 per line: check the cart for any quantity above 1")
    print(f"plan: {PLAN}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
