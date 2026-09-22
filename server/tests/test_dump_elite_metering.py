def test_elite_is_charged_for_dump_finalization():
    """Elite is a 270,000-token allowance, not unlimited spend."""
    import uuid
    from server.credits import get_token_balance, is_unmetered
    from server.database import SessionLocal, User

    db = SessionLocal()
    pid = f"elite-{uuid.uuid4().hex[:8]}"
    elite = User(public_id=pid, plan="elite", credits=0.0, role="user",
                 settings={"token_balance": 5000.0})
    db.add(elite); db.commit(); db.refresh(elite)
    try:
        assert is_unmetered(elite) is False, (
            "Elite must stay METERED — only the operator is exempt")
        assert get_token_balance(elite) == 5000.0
    finally:
        db.close()

    # The gate itself: as a metered user, an insufficient balance must be refused.
    import inspect
    from server import routes_dump
    src = inspect.getsource(routes_dump)
    assert 'plan != "elite"' not in src, (
        "an Elite plan check still bypasses the token gate/charge in routes_dump")
