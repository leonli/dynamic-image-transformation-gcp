#!/usr/bin/env bash
#
# build-and-deploy.sh — build the image handler container with Cloud Build and
# deploy the whole stack with Terraform.
#
# Usage:
#   ./build-and-deploy.sh [--project <id>] [--region <region>] [--tag <tag>]
#                         [--var-file <tfvars>] [--plan-only]
#
# Environment variable equivalents: PROJECT, REGION, TAG, VAR_FILE.
# Flags take precedence over environment variables.
#
#   --plan-only   build nothing, run `terraform plan` only (dry run)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

PROJECT="${PROJECT:-helloworld-334009}"
REGION="${REGION:-asia-southeast1}"
TAG="${TAG:-latest}"
VAR_FILE="${VAR_FILE:-${TF_DIR}/example.tfvars}"
PLAN_ONLY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)   PROJECT="$2"; shift 2 ;;
    --region)    REGION="$2"; shift 2 ;;
    --tag)       TAG="$2"; shift 2 ;;
    --var-file)  VAR_FILE="$2"; shift 2 ;;
    --plan-only) PLAN_ONLY="true"; shift ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--project <id>] [--region <region>] [--tag <tag>] [--var-file <tfvars>] [--plan-only]" >&2
      exit 1
      ;;
  esac
done

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/dit/image-handler:${TAG}"

echo "==> Project:  ${PROJECT}"
echo "==> Region:   ${REGION}"
echo "==> Image:    ${IMAGE}"
echo "==> Var file: ${VAR_FILE}"

if [[ "${PLAN_ONLY}" != "true" ]]; then
  # Ensure the Artifact Registry docker repo "dit" exists.
  if ! gcloud artifacts repositories describe dit \
      --location "${REGION}" --project "${PROJECT}" >/dev/null 2>&1; then
    echo "==> Creating Artifact Registry repository 'dit'"
    gcloud artifacts repositories create dit \
      --repository-format=docker \
      --location "${REGION}" \
      --project "${PROJECT}" \
      --description "Dynamic Image Transformation images"
  fi

  echo "==> Building container image with Cloud Build"
  gcloud builds submit "${REPO_ROOT}/source/image-handler" \
    --tag "${IMAGE}" \
    --project "${PROJECT}"
fi

echo "==> terraform init"
terraform -chdir="${TF_DIR}" init -input=false

TF_ARGS=(-input=false -var-file="${VAR_FILE}"
  -var "project_id=${PROJECT}" -var "region=${REGION}" -var "image=${IMAGE}")

if [[ "${PLAN_ONLY}" == "true" ]]; then
  echo "==> terraform plan (plan-only mode, nothing will be created)"
  terraform -chdir="${TF_DIR}" plan "${TF_ARGS[@]}"
  exit 0
fi

echo "==> terraform apply"
terraform -chdir="${TF_DIR}" apply "${TF_ARGS[@]}" -auto-approve

echo "==> Outputs"
terraform -chdir="${TF_DIR}" output
