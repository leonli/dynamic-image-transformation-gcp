# Root outputs — everything an operator needs after `terraform apply`.

output "lb_ip" {
  description = "Global anycast IP of the external HTTPS load balancer. Point the domain's A record at this address."
  value       = module.network_lb.lb_ip
}

output "api_endpoint" {
  description = "Public HTTPS endpoint of the image API (valid once DNS points at lb_ip and the managed certificate is ACTIVE)."
  value       = "https://${var.domain}"
}

output "demo_url" {
  description = "URL of the demo UI, or null when deploy_demo_ui = false."
  value       = var.deploy_demo_ui ? "https://${var.domain}/demo/index.html" : null
}

output "docs_url" {
  description = "URL of the documentation site."
  value       = "https://${var.domain}/docs/index.html"
}

output "cloud_run_url" {
  description = "Direct run.app URL of the Cloud Run service (ingress is restricted to the load balancer, so this is not publicly reachable)."
  value       = module.cloud_run.uri
}

output "source_bucket" {
  description = "Name of the private GCS bucket created for source images."
  value       = module.buckets.source_bucket_name
}
