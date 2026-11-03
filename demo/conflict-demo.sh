#!/usr/bin/env bash
# Reproduces offline edits, idempotent replay, auto-merge and a conflict against a running API.
set -euo pipefail
API=${API:-http://localhost:3000}
TOKEN=${API_TOKEN:-dev-token-change-me}
uuid() { cat /proc/sys/kernel/random/uuid; }
push() { # user body
  curl -sS -X POST "$API/sync/push" -H "Authorization: Bearer $TOKEN" -H "x-user-id: $1" \
    -H 'Content-Type: application/json' -d "$2"; echo
}
ID=$(uuid); OP1=$(uuid)
echo "1) alice creates the inspection (v1)"
push alice "{\"ops\":[{\"opId\":\"$OP1\",\"inspectionId\":\"$ID\",\"baseVersion\":0,\"patch\":{\"title\":\"Pump 1\",\"notes\":\"\"}}]}"
echo "2) same op replayed after a network drop -> same result, no duplicate"
push alice "{\"ops\":[{\"opId\":\"$OP1\",\"inspectionId\":\"$ID\",\"baseVersion\":0,\"patch\":{\"title\":\"Pump 1\",\"notes\":\"\"}}]}"
echo "3) bob edits notes (v2)"
push bob "{\"ops\":[{\"opId\":\"$(uuid)\",\"inspectionId\":\"$ID\",\"baseVersion\":1,\"patch\":{\"notes\":\"bob: valve leaking\"}}]}"
echo "4) alice (still on v1) edits another field -> auto-merged"
push alice "{\"ops\":[{\"opId\":\"$(uuid)\",\"inspectionId\":\"$ID\",\"baseVersion\":1,\"patch\":{\"title\":\"Pump 1A\"}}]}"
echo "5) alice (still on v1) edits notes -> CONFLICT"
push alice "{\"ops\":[{\"opId\":\"$(uuid)\",\"inspectionId\":\"$ID\",\"baseVersion\":1,\"patch\":{\"notes\":\"alice: all fine\"}}]}"
echo "6) history"
curl -sS "$API/inspections/$ID/history" -H "Authorization: Bearer $TOKEN"; echo
