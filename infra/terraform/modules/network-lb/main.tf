# Global external Application Load Balancer + Cloud CDN
# (counterpart of CloudFront in the AWS solution).
#
#   anycast IP ── HTTPS proxy (managed cert) ──┐
#              └─ HTTP proxy (optional) ───────┤
#                                              ▼
#                                           URL map
#                    default ────────────► backend service ─► serverless NEG ─► Cloud Run
#                    /demo, /demo/* ─────► backend bucket (demo UI)
#                    /docs, /docs/* ─────► backend bucket (docs site)
#
# CDN behaviour:
#  - cache_mode USE_ORIGIN_HEADERS: TTLs follow the origin's Cache-Control,
#    which the image handler already emits AWS-compatibly (4xx max-age=10,
#    5xx max-age=600, success max-age=31536000). Negative caching therefore
#    needs no extra LB configuration.
#  - The Accept request header is part of the cache key via
#    cdn_policy.cache_key_policy.include_http_headers, so AUTO_WEBP responses
#    for WebP-capable and legacy clients are cached separately (counterpart of
#    the CloudFront cache policy header allowlist).

resource "google_compute_global_address" "lb" {
  project = var.project_id
  name    = "${var.name_prefix}-lb-ip"
}

# --- Cloud Run origin ---------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "cloud_run" {
  project               = var.project_id
  name                  = "${var.name_prefix}-serverless-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.cloud_run_service_name
  }
}

resource "google_compute_backend_service" "api" {
  project               = var.project_id
  name                  = "${var.name_prefix}-api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  enable_cdn            = true

  backend {
    group = google_compute_region_network_endpoint_group.cloud_run.id
  }

  cdn_policy {
    cache_mode = "USE_ORIGIN_HEADERS"

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = true
      # Vary the cache by the (normalized) Accept header for AUTO_WEBP.
      include_http_headers = ["Accept"]
    }
  }

  # Request logs go to Cloud Logging (CloudWatch counterpart).
  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# --- static site origins --------------------------------------------------------

# NOTE: no URL rewrite is configured, so the full request path reaches GCS:
# /demo/index.html is served from object "demo/index.html" in the demo bucket
# and /docs/... from "docs/..." in the docs bucket. Upload the sites under
# those prefixes (deployment scripts do this).

resource "google_compute_backend_bucket" "demo" {
  count = var.deploy_demo_ui ? 1 : 0

  project     = var.project_id
  name        = "${var.name_prefix}-demo-backend"
  bucket_name = var.demo_bucket_name
  enable_cdn  = true
}

resource "google_compute_backend_bucket" "docs" {
  project     = var.project_id
  name        = "${var.name_prefix}-docs-backend"
  bucket_name = var.docs_bucket_name
  enable_cdn  = true
}

# --- URL map --------------------------------------------------------------------

resource "google_compute_url_map" "main" {
  project         = var.project_id
  name            = "${var.name_prefix}-lb"
  default_service = google_compute_backend_service.api.id

  host_rule {
    hosts        = ["*"]
    path_matcher = "main"
  }

  path_matcher {
    name            = "main"
    default_service = google_compute_backend_service.api.id

    dynamic "path_rule" {
      for_each = var.deploy_demo_ui ? [1] : []
      content {
        paths   = ["/demo", "/demo/*"]
        service = google_compute_backend_bucket.demo[0].id
      }
    }

    path_rule {
      paths   = ["/docs", "/docs/*"]
      service = google_compute_backend_bucket.docs.id
    }
  }
}

# --- HTTPS front end --------------------------------------------------------------

resource "google_compute_managed_ssl_certificate" "main" {
  project = var.project_id
  name    = "${var.name_prefix}-cert"

  managed {
    domains = [var.domain]
  }
}

resource "google_compute_target_https_proxy" "main" {
  project          = var.project_id
  name             = "${var.name_prefix}-https-proxy"
  url_map          = google_compute_url_map.main.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.name_prefix}-https-fr"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "443"
  target                = google_compute_target_https_proxy.main.id
}

# --- optional plain-HTTP front end (same URL map, useful while the managed
# certificate is provisioning; disable in production) ------------------------------

resource "google_compute_target_http_proxy" "main" {
  count = var.enable_http ? 1 : 0

  project = var.project_id
  name    = "${var.name_prefix}-http-proxy"
  url_map = google_compute_url_map.main.id
}

resource "google_compute_global_forwarding_rule" "http" {
  count = var.enable_http ? 1 : 0

  project               = var.project_id
  name                  = "${var.name_prefix}-http-fr"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.id
  port_range            = "80"
  target                = google_compute_target_http_proxy.main[0].id
}
