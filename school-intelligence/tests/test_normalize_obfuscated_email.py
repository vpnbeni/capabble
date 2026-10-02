from school_intel.utils.text import normalize_obfuscated_email


def test_normalizes_bracket_at_and_dot() -> None:
    assert (
        normalize_obfuscated_email("indianpublicsport[at]gmail[dot]com")
        == "indianpublicsport@gmail.com"
    )


def test_normalizes_spaced_and_paren_variants() -> None:
    assert normalize_obfuscated_email("name (at) school (dot) in") == "name@school.in"
    assert normalize_obfuscated_email("NAME[AT]DOMAIN[DOT]ORG") == "NAME@DOMAIN.ORG"


def test_leaves_normal_email_unchanged() -> None:
    assert normalize_obfuscated_email("principal@school.edu") == "principal@school.edu"


def test_empty_and_none() -> None:
    assert normalize_obfuscated_email("") == ""
    assert normalize_obfuscated_email(None) == ""
    assert normalize_obfuscated_email("   ") == ""
