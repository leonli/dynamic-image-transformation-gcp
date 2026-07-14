# Example variable values for the helloworld-334009 demo deployment.
# Usage: terraform apply -var-file=example.tfvars

project_id            = "helloworld-334009"
region                = "asia-southeast1"
name_prefix           = "dit"
service_account_email = "673474574447-compute@developer.gserviceaccount.com"

# Image built by deployment/build-and-deploy.sh (Artifact Registry repo "dit").
image = "asia-southeast1-docker.pkg.dev/helloworld-334009/dit/image-handler:latest"

# Load balancer / domain
domain         = "img.googledemo.com"
enable_http    = true # keep 80 open while the managed cert provisions
deploy_demo_ui = true

# Image handler behaviour (AWS CloudFormation parameter counterparts)
source_buckets                = "helloworld-334009-dit-source"
cors_enabled                  = "Yes"
cors_origin                   = "*"
auto_webp                     = "Yes"
enable_signature              = "No"
secret_name                   = "dit-signature-secret"
secret_key_name               = "signatureKey"
enable_default_fallback_image = "No"
fallback_image_bucket         = ""
fallback_image_key            = ""
sharp_size_limit              = ""
compat_aws_limits             = "No"

# Cloud Run sizing
min_instances = 0
max_instances = 10
