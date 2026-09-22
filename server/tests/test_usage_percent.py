def test_usage_percent_reads_the_real_token_balance():
    from server.database import User
    from server.payments import usage_percent

    fresh = User(public_id="p1", plan="pro", credits=0.0,
                 settings={"token_balance": 100000.0})
    assert usage_percent(fresh) == 0.0, (
        "a full allowance reported as fully exhausted"
    )

    half = User(public_id="p2", plan="pro", credits=0.0,
                settings={"token_balance": 50000.0})
    assert 49.0 <= usage_percent(half) <= 51.0, (
        "usage_percent does not move as tokens are spent"
    )
