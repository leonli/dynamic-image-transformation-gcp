#!/usr/bin/env bash
#
# run-unit-tests.sh — run the image handler unit test suite.
# Counterpart of deployment/run-unit-tests.sh in the AWS solution.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDLER_DIR="${REPO_ROOT}/source/image-handler"

echo "==> Installing dependencies (npm ci)"
cd "${HANDLER_DIR}"
npm ci

echo "==> Running unit tests"
npm test

echo "==> Unit tests passed"
