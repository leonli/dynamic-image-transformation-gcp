# Cloud Run v2 service running the image handler
# (counterpart of API Gateway + Lambda in the AWS solution).
#
# Ingress is restricted to traffic coming through the external Application
# Load Balancer so the CDN cache key (which includes the Accept header) can
# never be bypassed via the run.app URL. run.invoker is granted to allUsers as
# a resource-level IAM member — the LB fronting it performs no IAM
# authentication, and request signatures (ENABLE_SIGNATURE) are the
# application-level access control, exactly as in AWS.

resource "google_cloud_run_v2_service" "image_handler" {
  project  = var.project_id
  location = var.region
  name     = var.service_name

  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.image_handler.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
