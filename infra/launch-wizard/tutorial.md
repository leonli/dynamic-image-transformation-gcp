# Deploy Dynamic Image Transformation for Google Cloud CDN

<walkthrough-tutorial-duration duration="20"></walkthrough-tutorial-duration>

## Introduction

This tutorial deploys the GCP counterpart of AWS "Dynamic Image
Transformation for CloudFront":

- **Cloud Run** image handler (sharp, Thumbor-compatible URLs, HMAC signatures)
- **Global HTTPS Load Balancer + Cloud CDN** (Accept header in the cache key
  for auto-WebP)
- **GCS buckets** for source images, demo UI and docs
- **Secret Manager** secret for request signatures

Click **Start** to begin.

## Select your project

<walkthrough-project-setup></walkthrough-project-setup>

Set the project in your Cloud Shell session:

```bash
gcloud config set project <walkthrough-project-id/>
```

## Run the wizard

The wizard asks for every parameter (defaults in brackets — press Enter to
accept), shows a summary, then builds the container and applies Terraform:

```bash
cd infra/launch-wizard
./launch-wizard.sh
```

Prefer to see the plan without creating anything first?

```bash
./launch-wizard.sh --dry-run
```

Parameter tips:

- **SourceBuckets** — comma-separated whitelist; the first bucket is the
  default. The wizard creates `<project>-dit-source` for you.
- **AutoWebP=Yes** — WebP is returned automatically to browsers that accept
  it; the CDN caches WebP and non-WebP variants separately.
- **EnableSignature=Yes** — requests must carry an HMAC-SHA256 `signature`
  query parameter (same algorithm as AWS). Rotate the placeholder secret right
  after deploying.

## Point DNS at the load balancer

When the wizard finishes it prints `lb_ip`. Create an **A record** for your
domain pointing at that IP, then watch the managed certificate:

```bash
gcloud compute ssl-certificates list
```

The certificate becomes `ACTIVE` 15-60 minutes after DNS propagates. Until
then, test over plain HTTP:

```bash
curl -s -H "Host: <your-domain>" "http://<lb_ip>/fit-in/200x200/your-image.jpg" -o /tmp/out.jpg
```

## Try it

Upload an image and request a resized version:

```bash
gsutil cp my-photo.jpg gs://<walkthrough-project-id/>-dit-source/
curl -s "https://<your-domain>/fit-in/300x300/my-photo.jpg" -o /tmp/thumb.jpg
```

Or the AWS-compatible base64 JSON form:

```bash
REQ=$(printf '{"key":"my-photo.jpg","edits":{"resize":{"width":300}}}' | base64 -w0)
curl -s "https://<your-domain>/${REQ}" -o /tmp/thumb2.jpg
```

Open the demo UI at `https://<your-domain>/demo/index.html` and the docs at
`https://<your-domain>/docs/index.html`.

## Clean up

```bash
cd infra/launch-wizard
./launch-wizard.sh --destroy
```

## Congratulations

<walkthrough-conclusion-trophy></walkthrough-conclusion-trophy>

You deployed the full image transformation stack. Run the e2e suite any time:

```bash
BASE_URL=https://<your-domain> ./deployment/run-e2e-tests.sh
```
