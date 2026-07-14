variable "project_id" {
  description = "GCP project ID owning the buckets."
  type        = string
}

variable "location" {
  description = "Bucket location (region)."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix, e.g. \"dit\"."
  type        = string
}

variable "runtime_sa_email" {
  description = "Cloud Run runtime service account granted read access to the source bucket."
  type        = string
}

variable "deploy_demo_ui" {
  description = "Whether to create the demo UI bucket."
  type        = bool
  default     = true
}

variable "force_destroy_source" {
  description = "Allow terraform destroy to delete the source bucket even when it contains images. Keep false in production."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Days to keep objects in the logs bucket before automatic deletion."
  type        = number
  default     = 90
}
