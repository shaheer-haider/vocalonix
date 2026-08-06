output "vocalonix_public_ip" {
  description = "Public IPv4 of the Vocalonix app server"
  value       = hcloud_server.vocalonix.ipv4_address
}

output "dograh_public_ip" {
  description = "Public IPv4 of the Dograh server"
  value       = hcloud_server.dograh.ipv4_address
}

output "vocalonix_private_ip" {
  description = "Private IPv4 of the Vocalonix app server"
  value       = "10.0.1.2"
}

output "dograh_private_ip" {
  description = "Private IPv4 of the Dograh server"
  value       = "10.0.1.3"
}

output "ssh_private_key_path" {
  description = "Path to the generated SSH private key"
  value       = "${path.module}/.ssh/id_ed25519"
  sensitive   = true
}
