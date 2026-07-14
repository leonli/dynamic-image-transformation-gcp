output "secret_name" {
  description = "Short name of the secret (value for the SECRETS_MANAGER env var)."
  value       = google_secret_manager_secret.signature.secret_id
}

output "secret_full_id" {
  description = "Fully qualified resource ID of the secret (projects/*/secrets/*)."
  value       = google_secret_manager_secret.signature.id
}
