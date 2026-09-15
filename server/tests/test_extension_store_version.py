"""The store-version reader must not mistake the XML prolog for the version.

The Chrome Web Store update manifest begins with

    <?xml version="1.0" encoding="UTF-8"?>

so a loose `version="..."` scan returns **1.0** and the site reports the store as
permanently behind (it showed `store_version: 1.0`, `update_pending: true`, while
the store was actually serving 2.7.0). The version must be read off the
`<updatecheck>` element.

These tests are written to fail against the old loose regex.
"""
from unittest.mock import patch

from server import routes_extension

# A verbatim-shaped (trimmed) real manifest: the prolog is the trap, and the
# attributes on <updatecheck> are deliberately out of the order the old code
# would have found convenient.
MANIFEST = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0" server="prod">'
    '<daystart elapsed_days="7196" elapsed_seconds="77017"/>'
    '<app appid="nlbbjhgmdmjmlgojeiblkhfmmnlmfmjk" cohort="1::" status="ok">'
    '<updatecheck codebase="https://example.invalid/x_2_7_0_0.crx" status="ok" version="2.7.0"/>'
    '</app></gupdate>'
)

# Same, but with version FIRST on the element and a different value — proves the
# parse does not depend on attribute order.
MANIFEST_REORDERED = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<gupdate><app appid="x" status="ok">'
    '<updatecheck version="3.1.4" codebase="https://example.invalid/x.crx" status="ok"/>'
    '</app></gupdate>'
)


class _Resp:
    def __init__(self, body: str):
        self._body = body.encode()

    def read(self, _n=None):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _parse(body: str):
    """Drive fetch_store_version with a stubbed HTTP response."""
    routes_extension._store_version_cache["value"] = None
    routes_extension._store_version_cache["at"] = 0.0
    with patch("urllib.request.urlopen", return_value=_Resp(body)):
        return routes_extension.fetch_store_version()


def test_version_is_not_the_xml_prolog():
    """The exact bug: 1.0 comes from the declaration, not the store."""
    assert _parse(MANIFEST) == "2.7.0"


def test_attribute_order_does_not_matter():
    assert _parse(MANIFEST_REORDERED) == "3.1.4"


def test_manifest_without_updatecheck_does_not_invent_a_version():
    """No updatecheck -> no version, rather than falling back to the prolog."""
    assert _parse('<?xml version="1.0" encoding="UTF-8"?><gupdate></gupdate>') is None
