from school_intel.api.auth_tokens import create_session_token, verify_session_token


def test_session_token_roundtrip():
    token = create_session_token(
        username="capabble",
        role="admin",
        secret="unit-test-secret",
        ttl_seconds=120,
    )
    payload = verify_session_token(token, "unit-test-secret")
    assert payload["username"] == "capabble"
    assert payload["role"] == "admin"


def test_session_token_rejects_bad_secret():
    token = create_session_token(
        username="capabble",
        role="admin",
        secret="unit-test-secret",
        ttl_seconds=120,
    )
    try:
        verify_session_token(token, "wrong-secret")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "signature" in str(exc).lower()
