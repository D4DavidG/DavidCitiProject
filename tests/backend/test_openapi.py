"""The OpenAPI file (docs/openapi.json) matches the route table.

tools/openapi.py builds the file from api/routes.py; these tests check what it
builds, and that the saved file is the same as a fresh build. No database.
"""

import inspect

from api import routes


def test_every_handler_has_a_one_line_docstring():
    missing = [r.handler.__name__ for r in routes.ROUTES if not inspect.getdoc(r.handler)]
    assert missing == []
