def test_estimate_tracks_the_canonical_token_unit():
    from server.routes_dump import _calculate_dump_item_cost
    from server.credits import calculate_task_token_cost

    class _Item:
        extracted_text = "x" * 4000   # ~1000 model input tokens

    est_in, est_out, est_tokens, est_usd = _calculate_dump_item_cost(_Item())

    # Flash is ~$0.15/1M in, ~$0.60/1M out. 1000 in + 600 out is ~$0.0005.
    assert est_usd < 0.01, (
        f"estimate says ${est_usd} for work that costs well under a cent")
    # And the token figure must agree with the canonical conversion of its own USD figure.
    assert est_tokens == max(1, calculate_task_token_cost(est_usd)), (
        "the estimate does not round-trip through the canonical conversion")
