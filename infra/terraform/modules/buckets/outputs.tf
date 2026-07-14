output "source_bucket_name" {
  description = "Name of the private source image bucket."
  value       = google_storage_bucket.source.name
}

output "demo_bucket_name" {
  description = "Name of the demo UI bucket, or null when the demo UI is not deployed."
  value       = var.deploy_demo_ui ? google_storage_bucket.demo[0].name : null
}

output "docs_bucket_name" {
  description = "Name of the documentation site bucket."
  value       = google_storage_bucket.docs.name
}

output "logs_bucket_name" {
  description = "Name of the logs bucket."
  value       = google_storage_bucket.logs.name
}
