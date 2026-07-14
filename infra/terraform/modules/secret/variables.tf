variable "project_id" {
  description = "GCP project ID owning the secret."
  type        = string
}

variable "secret_id" {
  description = "Secret Manager secret name."
  type        = string
}

variable "secret_payload" {
  description = "Initial JSON payload of the secret, e.g. {\"signatureKey\":\"...\"}."
  type        = string
  sensitive   = true
}

variable "accessor_sa_email" {
  description = "Service account granted secretmanager.secretAccessor on this secret."
  type        = string
}
