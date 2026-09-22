def test_rate_limit_separates_clients_behind_the_proxy():
    from server.ratelimit import client_identity

    class _Req:
        def __init__(self, peer, headers):
            self.client = type("C", (), {"host": peer})()
            self.headers = headers

    a = client_identity(_Req("127.0.0.1", {"cf-connecting-ip": "203.0.113.7"}))
    b = client_identity(_Req("127.0.0.1", {"cf-connecting-ip": "203.0.113.8"}))
    assert a != b, "every user collapses onto one rate-limit bucket"

    spoof = client_identity(_Req("198.51.100.9", {"x-forwarded-for": "1.2.3.4"}))
    assert spoof == "198.51.100.9", "a spoofed header from an untrusted peer was honoured"
