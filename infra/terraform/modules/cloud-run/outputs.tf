output "service_name" {
  description = "Name of the Cloud Run service."
  value       = google_cloud_run_v2_service.image_handler.name
}

output "uri" {
  description = "run.app URI of the service."
  value       = google_cloud_run_v2_service.image_handler.uri
}

output "location" {
  description = "Region of the service."
  value       = google_cloud_run_v2_service.image_handler.location
}
