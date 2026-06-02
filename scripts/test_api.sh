#!/usr/bin/env bash
# scripts/test_api.sh — smoke tests against live App Runner URL
# Usage: ./scripts/test_api.sh [API_URL]
set -e

API_URL="${1:-}"
if [ -z "$API_URL" ]; then
    API_URL=$(cd "$(dirname "$0")/../terraform" && terraform output -raw api_url 2>/dev/null)
fi

if [ -z "$API_URL" ]; then
    echo "ERROR: Could not determine API URL. Pass it as argument or run terraform apply first."
    exit 1
fi

ASPIRIN="CC(=O)Oc1ccccc1C(=O)O"
PASS=0; FAIL=0

check() {
    local desc="$1"; local expected="$2"; local actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc"
        PASS=$((PASS+1))
    else
        echo "  ✗ $desc (expected=$expected, got=$actual)"
        FAIL=$((FAIL+1))
    fi
}

echo "Smoke testing: $API_URL"
echo ""

# Health
echo "GET /health"
status=$(curl -sf "$API_URL/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "status == ok" "ok" "$status"

# Analyze — valid SMILES
echo "POST /analyze (valid)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"smiles\":\"$ASPIRIN\",\"compound_name\":\"Aspirin\"}")
check "HTTP 200" "200" "$code"

# Analyze — invalid SMILES
echo "POST /analyze (invalid SMILES)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/analyze" \
    -H "Content-Type: application/json" \
    -d '{"smiles":"INVALID_XYZ"}')
check "HTTP 422" "422" "$code"

# Screen
echo "POST /screen"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/screen" \
    -H "Content-Type: application/json" \
    -d "{\"smiles_list\":[\"$ASPIRIN\"]}")
check "HTTP 200" "200" "$code"

# Screen — empty list
echo "POST /screen (empty list)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/screen" \
    -H "Content-Type: application/json" \
    -d '{"smiles_list":[]}')
check "HTTP 400" "400" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
