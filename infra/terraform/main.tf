# Root module: wires buckets, secret, Cloud Run and the global HTTPS LB + CDN.
#
# IAM note: the caller is expected to run with the VM default service account
# via ADC and does NOT hold projects.setIamPolicy. Every grant in this stack is
# therefore resource-level (bucket / secret / Cloud Run service IAM members);
# no google_project_iam_member is used anywhere.

locals {
  # SOURCE_BUCKETS defaults to the source bucket this stack creates.
  source_buckets = var.source_buckets != "" ? var.source_buckets : module.buckets.source_bucket_name

  # Full environment for the image handler container. Names are identical to
  # the AWS solution (see docs/COMPAT_SPEC.md section 10).
  handler_env = {
    SOURCE_BUCKETS                = local.source_buckets
    CORS_ENABLED                  = var.cors_enabled
    CORS_ORIGIN                   = var.cors_origin
    AUTO_WEBP                     = var.auto_webp
    ENABLE_SIGNATURE              = var.enable_signature
    SECRETS_MANAGER               = module.secret.secret_name
    SECRET_KEY                    = var.secret_key_name
    ENABLE_DEFAULT_FALLBACK_IMAGE = var.enable_default_fallback_image
    DEFAULT_FALLBACK_IMAGE_BUCKET = var.fallback_image_bucket
    DEFAULT_FALLBACK_IMAGE_KEY    = var.fallback_image_key
    REWRITE_MATCH_PATTERN         = var.rewrite_match_pattern
    REWRITE_SUBSTITUTION          = var.rewrite_substitution
    SHARP_SIZE_LIMIT              = var.sharp_size_limit
    BUCKET_MAP                    = var.bucket_map
    COMPAT_AWS_LIMITS             = var.compat_aws_limits
    GCP_PROJECT                   = var.project_id
  }
}

module "buckets" {
  source = "./modules/buckets"

  project_id       = var.project_id
  location         = var.region
  name_prefix      = var.name_prefix
  runtime_sa_email = var.service_account_email
  deploy_demo_ui   = var.deploy_demo_ui
}

module "secret" {
  source = "./modules/secret"

  project_id        = var.project_id
  secret_id         = var.secret_name
  secret_payload    = var.signature_secret_json
  accessor_sa_email = var.service_account_email
}

module "cloud_run" {
  source = "./modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  service_name          = "${var.name_prefix}-image-handler"
  image                 = var.image
  service_account_email = var.service_account_email
  min_instances         = var.min_instances
  max_instances         = var.max_instances
  env                   = local.handler_env

  depends_on = [module.secret, module.buckets]
}

module "network_lb" {
  source = "./modules/network-lb"

  project_id             = var.project_id
  region                 = var.region
  name_prefix            = var.name_prefix
  domain                 = var.domain
  enable_http            = var.enable_http
  deploy_demo_ui         = var.deploy_demo_ui
  cloud_run_service_name = module.cloud_run.service_name
  demo_bucket_name       = module.buckets.demo_bucket_name
  docs_bucket_name       = module.buckets.docs_bucket_name
}
