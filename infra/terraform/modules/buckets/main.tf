# GCS buckets:
#   <project>-<prefix>-source  private source images (counterpart of the S3 source bucket)
#   <project>-<prefix>-demo    demo UI static site, served via a backend bucket (optional)
#   <project>-<prefix>-docs    documentation static site, served via a backend bucket
#   <project>-<prefix>-logs    GCS usage/storage logs sink for the buckets above
#
# All grants are resource-level bucket IAM members; nothing touches project IAM.
# Load balancer request logs go to Cloud Logging (enabled on the backend
# service), not to the logs bucket — the logs bucket receives GCS usage logs.

locals {
  source_name = "${var.project_id}-${var.name_prefix}-source"
  demo_name   = "${var.project_id}-${var.name_prefix}-demo"
  docs_name   = "${var.project_id}-${var.name_prefix}-docs"
  logs_name   = "${var.project_id}-${var.name_prefix}-logs"
}

# --- logs bucket -------------------------------------------------------------

resource "google_storage_bucket" "logs" {
  project                     = var.project_id
  name                        = local.logs_name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true

  lifecycle_rule {
    condition {
      age = var.log_retention_days
    }
    action {
      type = "Delete"
    }
  }
}

# GCS usage logging is delivered by Google's storage analytics service account,
# which needs objectCreator on the destination bucket.
resource "google_storage_bucket_iam_member" "logs_writer" {
  bucket = google_storage_bucket.logs.name
  role   = "roles/storage.objectCreator"
  member = "group:cloud-storage-analytics@google.com"
}

# --- source bucket (private) -------------------------------------------------

resource "google_storage_bucket" "source" {
  project                     = var.project_id
  name                        = local.source_name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.force_destroy_source

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "usage/source"
  }
}

# The Cloud Run runtime SA only ever reads source images.
resource "google_storage_bucket_iam_member" "source_runtime_viewer" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.runtime_sa_email}"
}

# --- demo UI bucket (public static site, optional) ----------------------------

resource "google_storage_bucket" "demo" {
  count = var.deploy_demo_ui ? 1 : 0

  project                     = var.project_id
  name                        = local.demo_name
  location                    = var.location
  uniform_bucket_level_access = true
  # Backend buckets serve objects anonymously, so allUsers read is required.
  public_access_prevention = "inherited"
  force_destroy            = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "usage/demo"
  }
}

resource "google_storage_bucket_iam_member" "demo_public" {
  count = var.deploy_demo_ui ? 1 : 0

  bucket = google_storage_bucket.demo[0].name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# --- docs bucket (public static site) -----------------------------------------

resource "google_storage_bucket" "docs" {
  project                     = var.project_id
  name                        = local.docs_name
  location                    = var.location
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"
  force_destroy               = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  logging {
    log_bucket        = google_storage_bucket.logs.name
    log_object_prefix = "usage/docs"
  }
}

resource "google_storage_bucket_iam_member" "docs_public" {
  bucket = google_storage_bucket.docs.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
