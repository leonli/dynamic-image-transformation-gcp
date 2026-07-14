# Terraform and provider requirements.
#
# Backend: local state by default so the module works with nothing but ADC.
# To share state across operators, switch to a GCS backend, e.g.:
#
#   backend "gcs" {
#     bucket = "<your-tf-state-bucket>"
#     prefix = "dynamic-image-transformation"
#   }
#
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "local" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
