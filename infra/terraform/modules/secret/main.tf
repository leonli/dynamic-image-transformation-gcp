# Secret Manager secret holding the request-signature key JSON
# (counterpart of the AWS Secrets Manager secret used by EnableSignature).
#
# The payload is a JSON document, e.g. {"signatureKey":"..."}; the image
# handler reads the key named by SECRET_KEY out of it, exactly like AWS.
# Access is granted resource-level to the runtime SA only.

resource "google_secret_manager_secret" "signature" {
  project   = var.project_id
  secret_id = var.secret_id

  replication {
    auto {}
  }
}

# Initial version. Rotate by adding new versions out-of-band; Terraform will
# not fight rotation because only this initial payload is managed.
resource "google_secret_manager_secret_version" "initial" {
  secret      = google_secret_manager_secret.signature.id
  secret_data = var.secret_payload
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.signature.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.accessor_sa_email}"
}
