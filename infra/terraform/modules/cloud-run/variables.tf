variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
}

variable "image" {
  description = "Container image to deploy."
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account for the service."
  type        = string
}

variable "min_instances" {
  description = "Minimum instance count."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instance count."
  type        = number
  default     = 10
}

variable "env" {
  description = "Plain environment variables injected into the container."
  type        = map(string)
  default     = {}
}
