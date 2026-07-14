# Launch Wizard (deployment path 1)

Interactive, CloudFormation-style deployment for **Dynamic Image
Transformation for Google Cloud CDN**. The wizard prompts for the same
parameter set as the AWS CloudFormation template (SourceBuckets, CorsEnabled,
AutoWebP, EnableSignature, DeployDemoUI, ...), builds the container with Cloud
Build, then drives the Terraform module in [`../terraform`](../terraform) —
so the wizard and plain Terraform (deployment path 2) always produce identical
resources.

## Open in Cloud Shell

The one-click counterpart of the AWS "Launch Stack" button — ready to use,
repo URL already filled in:

```
https://ssh.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/leonli/dynamic-image-transformation-gcp.git&cloudshell_tutorial=infra/launch-wizard/tutorial.md
```

Markdown button:

```markdown
[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://ssh.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/leonli/dynamic-image-transformation-gcp.git&cloudshell_tutorial=infra/launch-wizard/tutorial.md)
```

Cloud Shell clones the repo and opens `tutorial.md` as a guided walkthrough in
the side panel.

## Manual usage

```bash
cd infra/launch-wizard

./launch-wizard.sh            # interactive deploy
./launch-wizard.sh --dry-run  # collect parameters, terraform plan only, no build
./launch-wizard.sh --destroy  # tear the stack down
```

Requirements:

- `gcloud` authenticated (`gcloud auth login` + `gcloud auth application-default login`),
  or run inside Cloud Shell / a GCE VM where ADC is automatic
- `terraform` >= 1.5
- Permissions: Cloud Run, Cloud Build, Artifact Registry, GCS, Secret Manager,
  Compute (LB/CDN), `iam.serviceAccounts.actAs` on the runtime service
  account. **No project-level IAM admin is needed** — every grant is
  resource-level.

## What it does

1. Collects and validates parameters (each with a default; Yes/No values are
   checked strictly to match the CFN parameter style).
2. Prints a summary and asks for confirmation.
3. Checks `gcloud`/`terraform` and enables the required APIs (`run`,
   `compute`, `cloudbuild`, `artifactregistry`, `secretmanager`, `vision`,
   `storage`).
4. Creates the Artifact Registry repo `dit` if missing, then
   `gcloud builds submit` builds `source/image-handler` into
   `<region>-docker.pkg.dev/<project>/dit/image-handler:<tag>`.
5. Writes `../terraform/wizard.auto.tfvars` and runs
   `terraform init && terraform apply`.
6. Prints the endpoints and next steps (DNS A record, certificate status,
   image upload, e2e tests).

`--dry-run` stops after `terraform plan` and skips the container build.
`--destroy` runs `terraform destroy` against the same state/tfvars (the
Artifact Registry repo and images are intentionally kept).

## After deployment

- Create an **A record** for your domain pointing at the `lb_ip` output.
- The Google-managed certificate turns `ACTIVE` only after DNS resolves;
  until then use plain HTTP (`enable_http=true`) for testing.
- Upload images to `gs://<project>-dit-source/` and try
  `https://<domain>/<base64-request>` or a Thumbor-style path.
