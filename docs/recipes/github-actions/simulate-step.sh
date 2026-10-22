#!/bin/bash
# Runs the `run:` block of inspect-claim.yml locally, with the environment GitHub would give it, against a FINISHED public run.
# Usage: bash simulate-step.sh <workflow name> <run id> <run url>   -> prints the step's exit code and the first lines of the job summary
set -u
export WORKFLOW="$1" RUN_ID="$2" RUN_URL="$3" GITHUB_STEP_SUMMARY="$PWD/summary.md"
: > "$GITHUB_STEP_SUMMARY"
# extract the run block from the workflow file, exactly as written
awk '/^        run: \|/{f=1;next} f&&/^      - /{f=0} f{sub(/^          /,"");print}' "$(dirname "$0")/inspect-claim.yml" > step.sh
bash -e step.sh > /dev/null 2>step.err; code=$?
echo "step exit code: $code"
echo "job summary starts: $(head -c 160 "$GITHUB_STEP_SUMMARY" | tr '\n' ' ')"
