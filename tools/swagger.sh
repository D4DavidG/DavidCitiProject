#!/usr/bin/env bash
# Swagger UI for the API: serves docs/ on this machine so docs/swagger.html can read docs/openapi.json.
#
#   ./tools/swagger.sh            # then open http://localhost:8090/swagger.html; Ctrl+C stops it
#   SWAGGER_PORT=8091 ./tools/swagger.sh
#
# Pick "Local" (needs ./bin/start-dev.sh running) or "AWS" in the page's server list, log in
# with POST /auth/login, and the token is filled into Authorize for you.
# Only this machine can reach it (127.0.0.1). After a route change, rebuild the file first:
#   .venv/bin/python tools/openapi.py
set -euo pipefail

port="${SWAGGER_PORT:-8090}"
cd "$(dirname "$0")/../docs"
echo "Swagger UI: http://localhost:${port}/swagger.html  (Ctrl+C to stop)"
exec python3 -m http.server "$port" --bind 127.0.0.1
