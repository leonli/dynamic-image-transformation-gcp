# Dynamic Image Transformation for Google Cloud CDN

A Google Cloud–native port of the AWS Solution **[Dynamic Image Transformation for Amazon CloudFront](https://docs.aws.amazon.com/solutions/latest/dynamic-image-transformation-for-amazon-cloudfront/solution-overview.html)** (formerly *Serverless Image Handler*), designed for **drop-in API compatibility**: URL formats, the base64-encoded request JSON schema, Thumbor-compatible paths and filters, HMAC request signing, and error responses are byte-for-byte aligned with the AWS v7 serverless architecture, so clients migrating from AWS keep working without code changes.

用于从 AWS 无缝迁移的 GCP 原生动态图片处理方案:URL 格式、请求 JSON schema、Thumbor 滤镜、HMAC 签名与错误响应均与 AWS 方案逐字段兼容,迁移客户端零改动。

## Architecture

| AWS (v7 serverless) | This solution |
|---|---|
| Amazon CloudFront | Cloud CDN + Global External Application Load Balancer |
| CloudFront Function (request normalization) | In-service request normalizer (same logic, same cache-key discipline) |
| Amazon API Gateway + AWS Lambda | Cloud Run (Node.js 22 + [sharp](https://sharp.pixelplumbing.com/)) |
| Amazon S3 (source buckets) | Cloud Storage (`SOURCE_BUCKETS` allowlist, `s3:`/`gs:` path prefixes, optional `BUCKET_MAP` aliasing) |
| AWS Secrets Manager | Secret Manager (same JSON payload convention) |
| Amazon Rekognition | Cloud Vision API (`FACE_DETECTION` for smart crop, `SAFE_SEARCH_DETECTION` for content moderation) |
| Amazon CloudWatch | Cloud Logging / Cloud Monitoring |

```
Client → Global External ALB (+ Cloud CDN, managed TLS)
           ├─ /demo/*  → backend bucket (demo UI)
           ├─ /docs/*  → backend bucket (implementation guide)
           └─ default  → serverless NEG → Cloud Run image-handler
                            ├─ Cloud Storage (source images)
                            ├─ Secret Manager (request signing key)
                            └─ Cloud Vision (smart crop / moderation)
```

## Repository layout

```
source/image-handler/   TypeScript service: request parsing, sharp edit pipeline, tests
source/demo-ui/         Static demo UI (mirrors the AWS Demo UI)
source/docs-site/       Customer-facing implementation guide (EN/中文, Google docs style)
infra/terraform/        Deployment option 2: Terraform root module + submodules
infra/launch-wizard/    Deployment option 1: interactive Cloud Shell launch wizard
deployment/             run-unit-tests.sh / build-and-deploy.sh / run-e2e-tests.sh
docs/COMPAT_SPEC.md     Authoritative AWS-compatibility specification
DESIGN.md               Architecture & design decisions
storyline-run.md        Guided walkthrough scenarios (post-deployment)
```

## Deployment

**Option 1 — Launch Wizard** (mirrors the AWS console launch experience):

```bash
cd infra/launch-wizard && ./launch-wizard.sh
```

**Option 2 — Terraform**:

```bash
deployment/build-and-deploy.sh            # builds the container via Cloud Build, then terraform apply
# or manually:
cd infra/terraform
terraform init && terraform apply -var-file=example.tfvars
```

Both paths drive the same Terraform module, so the resulting infrastructure is identical.

## Testing

```bash
deployment/run-unit-tests.sh              # Jest unit tests + coverage (≥80% enforced)
BASE_URL=https://img.example.com deployment/run-e2e-tests.sh   # against a live deployment
```

## Requests at a glance

```
# Base64-encoded JSON (DEFAULT)
https://<endpoint>/eyJidWNrZXQiOiJteS1idWNrZXQiLCJrZXkiOiJpbWcuanBnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjozMDB9fX0=

# Thumbor-compatible
https://<endpoint>/fit-in/300x400/filters:grayscale()/img.jpg

# Query-parameter edits (either style)
https://<endpoint>/img.jpg?width=300&format=webp
```

See the full implementation guide under `/docs/` on a deployed endpoint, or `source/docs-site/`.

## License

Apache-2.0 — this project is an independent port inspired by the Apache-2.0 licensed
[aws-solutions/dynamic-image-transformation-for-amazon-cloudfront](https://github.com/aws-solutions/dynamic-image-transformation-for-amazon-cloudfront).
