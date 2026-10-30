#!/usr/bin/env bash
set -euo pipefail

smoke_origin="${1:-http://127.0.0.1:5173}"
smoke_dir=$(mktemp -d /tmp/provenance-http-XXXXXX)
trap 'rm -rf "$smoke_dir"' EXIT

curl -fsS -X POST "$smoke_origin/api/live/sessions" -H 'Content-Type: application/json' -d '{"title":"Smoke workshop","prompt":"What matters most?"}' > "$smoke_dir/create.json"
smoke_code=$(jq -r .code "$smoke_dir/create.json")
smoke_host=$(jq -r .hostToken "$smoke_dir/create.json")
curl -fsS -X POST "$smoke_origin/api/live/sessions/$smoke_code/join" > "$smoke_dir/join.json"
smoke_participant=$(jq -r .participantToken "$smoke_dir/join.json")
curl -fsS -X POST "$smoke_origin/api/live/sessions/$smoke_code/status" -H "Authorization: Bearer $smoke_host" -H 'Content-Type: application/json' -d '{"status":"open"}' > "$smoke_dir/open.json"
curl -fsS -X PUT "$smoke_origin/api/live/sessions/$smoke_code/submission" -H "X-Participant-Token: $smoke_participant" -H 'Content-Type: application/json' -d '{"text":"Keep public shade."}' > "$smoke_dir/submit.json"
curl -fsS "$smoke_origin/api/live/sessions/$smoke_code" > "$smoke_dir/public.json"
curl -fsS "$smoke_origin/api/live/sessions/$smoke_code" -H "X-Participant-Token: $smoke_participant" > "$smoke_dir/own.json"
curl -fsS -X POST "$smoke_origin/api/live/sessions/$smoke_code/status" -H "Authorization: Bearer $smoke_host" -H 'Content-Type: application/json' -d '{"status":"closed"}' > "$smoke_dir/close.json"
smoke_revision=$(jq -r .revision "$smoke_dir/close.json")
jq -n --argjson revision "$smoke_revision" '{summary:"Shade matters.",method:"manual tfidf",averageAlignment:0.6,gini:0,validCount:1,scores:{P001:0.6},sourceRevision:$revision}' > "$smoke_dir/publish-body.json"
curl -fsS -X POST "$smoke_origin/api/live/sessions/$smoke_code/publish" -H "Authorization: Bearer $smoke_host" -H 'Content-Type: application/json' --data-binary @"$smoke_dir/publish-body.json" > "$smoke_dir/published.json"
jq -e '.status == "published" and .result.summary == "Shade matters."' "$smoke_dir/published.json" >/dev/null
jq -e 'has("submissions") | not' "$smoke_dir/public.json" >/dev/null
jq -e '.own.text == "Keep public shade."' "$smoke_dir/own.json" >/dev/null
printf 'HTTP facilitator/participant flow passed.\n'
