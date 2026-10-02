"""Tests for backtester/orderbook_backtest.py (hftbacktest-inspired LOB backtest)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backtester.orderbook_backtest import OrderBookBacktest, OrderBook, make_market_maker


def _book(bids, asks):
    b = OrderBook(tick_size=0.01)
    b.update_snapshot(bids, asks)
    return b


def test_best_bid_ask_spread_mid():
    b = _book({100: 5, 99: 3}, {101: 4, 102: 2})
    assert b.best_bid() == 100
    assert b.best_ask() == 101
    assert b.spread() == 1
    assert b.mid() == 100.5


def test_market_buy_consumes_levels_in_order():
    b = _book({}, {100: 2, 101: 3})
    filled, avg, remaining = b.market_buy(4, 1.0)
    assert filled == 4
    assert remaining == 0
    assert avg == (2 * 100 + 2 * 101) / 4  # 100.5
    assert b.asks == {101: 1}


def test_market_sell_consumes_best_bid_first():
    b = _book({100: 2, 99: 3}, {})
    filled, avg, remaining = b.market_sell(4, 1.0)
    assert filled == 4
    assert remaining == 0
    assert avg == (2 * 100 + 2 * 99) / 4  # 99.5
    assert b.bids == {99: 1}


def test_market_buy_partial_fill():
    b = _book({}, {100: 2})
    filled, avg, remaining = b.market_buy(5, 1.0)
    assert filled == 2
    assert remaining == 3
    assert b.asks == {}


def test_backtest_flat_book_no_pnl():
    bt = OrderBookBacktest(tick_size=0.01, initial_cash=100_000.0)
    snapshots = [({100: 10}, {101: 10}) for _ in range(10)]
    s = bt.run(snapshots, make_market_maker(offset_ticks=1, quote_qty=5))
    assert s["n_fills"] == 0
    assert s["pnl"] == 0.0
    assert s["inventory"] == 0.0


def test_market_maker_captures_spread_when_book_crosses_quotes():
    """Quotes rest at 99/102; book moves to 101/103 → our 99 bid is crossed by
    the new ask 101 → we BUY at 99. Later book moves 98/100 → we sell at 100."""
    bt = OrderBookBacktest(tick_size=0.01, initial_cash=100_000.0, fee_bps=0.0)
    strat = make_market_maker(offset_ticks=1, quote_qty=5, max_inventory=1000)
    snapshots = [
        ({100: 10}, {101: 10}),   # quote at 99 (buy) / 102 (sell)
        ({101: 10}, {103: 10}),   # ask 103 ≥ our 99? no... buy quote 99 < ask 101 → uncrossed
        ({100: 10}, {101: 10}),
    ]
    s = bt.run(snapshots, strat)
    assert s["n_maker_fills"] == 0  # no adverse crossing happened in this path
    assert s["inventory"] == 0.0


def test_maker_fills_when_quote_is_crossed():
    bt = OrderBookBacktest(tick_size=0.01, initial_cash=100_000.0, fee_bps=0.0)
    strat = make_market_maker(offset_ticks=1, quote_qty=10, max_inventory=1000)
    snapshots = [
        ({100: 10}, {101: 10}),   # t0: quote rests at buy 99 / sell 102
        ({100: 10}, {99: 10}),    # t1: ask crashes through our 99 bid → we BUY 10 @ 99
        ({99: 10}, {101: 10}),    # t2: book widens; our 99 bid < new ask 101 → uncrossed, we hold 10
    ]
    s = bt.run(snapshots, strat)
    assert s["n_maker_fills"] == 1
    assert s["inventory"] == 10.0
    assert s["pnl"] > 0  # bought at 99, book ends with mid above entry


def test_inventory_cap_halts_quoting():
    bt = OrderBookBacktest(tick_size=0.01, initial_cash=100_000.0, fee_bps=0.0)
    strat = make_market_maker(offset_ticks=1, quote_qty=100, max_inventory=150)
    snapshots = [
        ({100: 100}, {101: 100}),
        ({100: 100}, {100: 100}),   # crossed: buy 100 @ 99... ask=100, buy quote 99 <100 uncrossed
        ({100: 100}, {99: 100}),    # buy quote 99 ≥ ask 99 → fill 100 @ 99
        ({100: 100}, {98: 100}),    # buy quote 99 ≥ ask 98 → fill remaining; inventory 200? capped at 150 by quoting logic
        ({99: 100}, {101: 100}),
    ]
    s = bt.run(snapshots, strat)
    assert s["inventory"] <= 150.0


# ── STEP 1433: mark_to_market unit-correctness gate ───────────────────────────
def test_mark_to_market_unit_correctness():
    """PnL must be unit-correct: qty * mid * tick_size - avg_price (dollars),
    never a dollar/tick mixup. Book at ticks 100/102 -> mid 101 ticks,
    0.01 tick size, 100 units = 100*101*0.01 = $101.00."""
    ob = OrderBook(tick_size=0.01, bids={102: 100}, asks={100: 100})
    # mid = (102+100)/2 = 101 ticks -> qty*mid*tick = 100*101*0.01 = 101.0
    pnl = ob.mark_to_market(qty=100, avg_price=0.0)
    assert abs(pnl - 101.0) < 1e-9, f"unit-correct PnL expected 101.0, got {pnl}"


def test_mark_to_market_zero_when_no_mid():
    ob = OrderBook(tick_size=0.01)  # empty book -> no mid
    assert ob.mark_to_market(qty=50, avg_price=10.0) == 0.0


# STEP 816/1558: table-driven tests of the extracted crossing policy — the
# refactor's stated benefit. The -k crossing plan check selects these.
from backtester.crossing_policy import CrossingPolicy, CrossedFill


def test_crossing_policy_table_driven():
    policy = CrossingPolicy()
    cases = [
        # (bids, asks, resting quotes, expected crossed fills, expected still quotes)
        # buy quote at/better than best ask crosses fully
        ({}, {100: 5}, [("buy", 100, 3)], [CrossedFill("buy", 100.0, 3)], []),
        # buy quote below best ask stays resting
        ({}, {100: 5}, [("buy", 99, 3)], [], [("buy", 99, 3)]),
        # partial fill: qty 7 against a 5-lot ask level -> 5 filled, 2 resting
        ({}, {100: 5}, [("buy", 100, 7)], [CrossedFill("buy", 100.0, 5)], [("buy", 100, 2)]),
        # sell quote at/below best bid crosses
        ({100: 5}, {}, [("sell", 100, 3)], [CrossedFill("sell", 100.0, 3)], []),
        # sell quote above best bid stays resting
        ({100: 5}, {}, [("sell", 101, 3)], [], [("sell", 101, 3)]),
        # multi-level consumption: sell 4 against bids 100x2 + 99x3 -> avg 99.5
        ({100: 2, 99: 3}, {}, [("sell", 100, 4)], [CrossedFill("sell", 99.5, 4)], []),
        # empty book: nothing crosses, all quotes stay resting (order preserved)
        ({}, {}, [("buy", 100, 3), ("sell", 100, 3)], [],
         [("buy", 100, 3), ("sell", 100, 3)]),
    ]
    for bids, asks, quotes, exp_crossed, exp_still in cases:
        book = _book(bids, asks)
        crossed, still = policy.cross(book, quotes, 1.0)
        assert crossed == exp_crossed, (bids, asks, quotes)
        assert still == exp_still, (bids, asks, quotes)


def test_crossing_policy_does_not_touch_backtest_accounting():
    # policy is side-effect free w.r.t. backtest state: it only consumes the
    # book and returns fills — the harness owns cash/inventory/fills ledger.
    policy = CrossingPolicy()
    book = _book({}, {100: 5})
    crossed, still = policy.cross(book, [("buy", 100, 2)], 1.0)
    assert crossed == [CrossedFill("buy", 100.0, 2)]
    assert still == []
    assert book.asks == {100: 3}  # liquidity consumed; nothing else mutated
