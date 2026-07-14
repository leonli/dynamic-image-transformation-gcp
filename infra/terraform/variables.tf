# Input variables.
#
# Variable names deliberately mirror the AWS CloudFormation parameter table of
# "Dynamic Image Transformation for Amazon CloudFront" (see DESIGN.md for the
# full mapping), so that AWS migrators can map their existing parameter values
# one-to-one. Yes/No toggles are kept as "Yes"/"No" strings on purpose.

# ---------------------------------------------------------------------------
# GCP placement
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID that hosts every resource of this solution."
  type        = string
  default     = "helloworld-334009"
}

variable "region" {
  description = "GCP region for Cloud Run, the serverless NEG and the GCS buckets (the load balancer itself is global)."
  type        = string
  default     = "asia-southeast1"
}

variable "name_prefix" {
  description = "Prefix applied to every resource name (Cloud Run service, LB components, secret, bucket suffixes)."
  type        = string
  default     = "dit"
}

variable "service_account_email" {
  description = "Runtime service account attached to the Cloud Run service. Defaults to the project's default compute service account. The caller only needs iam.serviceAccounts.actAs on it; all grants to it are resource-level."
  type        = string
  default     = "673474574447-compute@developer.gserviceaccount.com"
}

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------

variable "image" {
  description = "Fully qualified container image for the image handler, e.g. asia-southeast1-docker.pkg.dev/<project>/dit/image-handler:latest. Build it with deployment/build-and-deploy.sh or the launch wizard."
  type        = string
}

# ---------------------------------------------------------------------------
# Load balancer / domain
# ---------------------------------------------------------------------------

variable "domain" {
  description = "Public domain served by the HTTPS load balancer; a Google-managed certificate is provisioned for it (counterpart of the CloudFront alternate domain name)."
  type        = string
  default     = "img.googledemo.com"
}

variable "enable_http" {
  description = "If true, also expose plain HTTP on port 80 through the same URL map. Useful while the managed certificate is still provisioning; disable for production."
  type        = bool
  default     = true
}

variable "deploy_demo_ui" {
  description = "Whether to create the demo UI bucket and route /demo/* to it (counterpart of the CloudFormation DeployDemoUI parameter)."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Image handler behaviour (counterparts of the CFN parameter table; the
# resulting env var names inside the container are identical to AWS)
# ---------------------------------------------------------------------------

variable "source_buckets" {
  description = "Comma-separated whitelist of GCS buckets images may be served from; the first entry is the default bucket (CFN: SourceBuckets, env: SOURCE_BUCKETS). Leave empty to default to the source bucket created by this module."
  type        = string
  default     = ""
}

variable "cors_enabled" {
  description = "\"Yes\" to send Access-Control-Allow-Origin on responses (CFN: CorsEnabled, env: CORS_ENABLED)."
  type        = string
  default     = "No"
  validation {
    condition     = contains(["Yes", "No"], var.cors_enabled)
    error_message = "cors_enabled must be \"Yes\" or \"No\"."
  }
}

variable "cors_origin" {
  description = "Value of the Access-Control-Allow-Origin header when CORS is enabled (CFN: CorsOrigin, env: CORS_ORIGIN)."
  type        = string
  default     = "*"
}

variable "auto_webp" {
  description = "\"Yes\" to return WebP automatically when the client Accept header contains image/webp (CFN: AutoWebP, env: AUTO_WEBP). Requires the Accept header in the CDN cache key, which this module configures."
  type        = string
  default     = "No"
  validation {
    condition     = contains(["Yes", "No"], var.auto_webp)
    error_message = "auto_webp must be \"Yes\" or \"No\"."
  }
}

variable "enable_signature" {
  description = "\"Yes\" to require an HMAC-SHA256 signature query parameter on every request (CFN: EnableSignature, env: ENABLE_SIGNATURE)."
  type        = string
  default     = "No"
  validation {
    condition     = contains(["Yes", "No"], var.enable_signature)
    error_message = "enable_signature must be \"Yes\" or \"No\"."
  }
}

variable "secret_name" {
  description = "Name of the Secret Manager secret holding the signature key JSON (CFN: SecretsManagerSecret, env: SECRETS_MANAGER). Created by this module."
  type        = string
  default     = "dit-signature-secret"
}

variable "secret_key_name" {
  description = "JSON key inside the secret payload whose value is the HMAC signing key (CFN: SecretsManagerKey, env: SECRET_KEY)."
  type        = string
  default     = "signatureKey"
}

variable "signature_secret_json" {
  description = "Initial JSON payload stored in the Secret Manager secret. Rotate it out-of-band after the first apply; the placeholder must be changed before enabling signatures."
  type        = string
  default     = "{\"signatureKey\":\"CHANGE_ME\"}"
  sensitive   = true
}

variable "enable_default_fallback_image" {
  description = "\"Yes\" to serve a fallback image instead of an error body when processing fails (CFN: EnableDefaultFallbackImage, env: ENABLE_DEFAULT_FALLBACK_IMAGE)."
  type        = string
  default     = "No"
  validation {
    condition     = contains(["Yes", "No"], var.enable_default_fallback_image)
    error_message = "enable_default_fallback_image must be \"Yes\" or \"No\"."
  }
}

variable "fallback_image_bucket" {
  description = "GCS bucket containing the fallback image (CFN: FallbackImageS3Bucket, env: DEFAULT_FALLBACK_IMAGE_BUCKET)."
  type        = string
  default     = ""
}

variable "fallback_image_key" {
  description = "Object key of the fallback image (CFN: FallbackImageS3Key, env: DEFAULT_FALLBACK_IMAGE_KEY)."
  type        = string
  default     = ""
}

variable "sharp_size_limit" {
  description = "Maximum input pixel count accepted by sharp; empty keeps the sharp default (env: SHARP_SIZE_LIMIT)."
  type        = string
  default     = ""
}

variable "compat_aws_limits" {
  description = "\"Yes\" to replicate the AWS Lambda 6 MB response limit (413 TooLargeImageException) for byte-for-byte compatibility (env: COMPAT_AWS_LIMITS)."
  type        = string
  default     = "No"
  validation {
    condition     = contains(["Yes", "No"], var.compat_aws_limits)
    error_message = "compat_aws_limits must be \"Yes\" or \"No\"."
  }
}

variable "rewrite_match_pattern" {
  description = "Regex applied to incoming paths for the CUSTOM request type (env: REWRITE_MATCH_PATTERN). Empty disables rewriting."
  type        = string
  default     = ""
}

variable "rewrite_substitution" {
  description = "Substitution string paired with rewrite_match_pattern (env: REWRITE_SUBSTITUTION)."
  type        = string
  default     = ""
}

variable "bucket_map" {
  description = "GCP addition: comma-separated s3name=gcsname aliases so legacy S3 bucket names in requests resolve to GCS buckets (env: BUCKET_MAP)."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Cloud Run sizing
# ---------------------------------------------------------------------------

variable "min_instances" {
  description = "Minimum number of Cloud Run instances (0 = scale to zero)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances."
  type        = number
  default     = 10
}
