output "lb_ip" {
  description = "Global anycast IPv4 address of the load balancer."
  value       = google_compute_global_address.lb.address
}

output "url_map_name" {
  description = "Name of the URL map."
  value       = google_compute_url_map.main.name
}

output "certificate_name" {
  description = "Name of the managed SSL certificate (check its status while DNS propagates)."
  value       = google_compute_managed_ssl_certificate.main.name
}
