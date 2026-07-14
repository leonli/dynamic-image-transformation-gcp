variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Region of the Cloud Run service / serverless NEG."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix, e.g. \"dit\"."
  type        = string
}

variable "domain" {
  description = "Domain for the Google-managed SSL certificate."
  type        = string
}

variable "enable_http" {
  description = "Also expose port 80 (same URL map)."
  type        = bool
  default     = true
}

variable "deploy_demo_ui" {
  description = "Whether the demo UI backend bucket and /demo/* route exist."
  type        = bool
  default     = true
}

variable "cloud_run_service_name" {
  description = "Name of the Cloud Run service behind the serverless NEG."
  type        = string
}

variable "demo_bucket_name" {
  description = "GCS bucket of the demo UI (null when deploy_demo_ui = false)."
  type        = string
  default     = null
}

variable "docs_bucket_name" {
  description = "GCS bucket of the documentation site."
  type        = string
}
