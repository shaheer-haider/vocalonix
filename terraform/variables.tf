variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "location" {
  description = "Hetzner Cloud location (hel1 = Helsinki)"
  type        = string
  default     = "hel1"
}

variable "vocalonix_server_type" {
  description = "Server type for Vocalonix app (cx23 = 2 vCPU / 4 GB, cx33 = 4 vCPU / 8 GB)"
  type        = string
  default     = "cx23"
}

variable "dograh_server_type" {
  description = "Server type for Dograh voice stack (cx33 = 4 vCPU / 8 GB)"
  type        = string
  default     = "cx33"
}

variable "image" {
  description = "Operating system image for the servers"
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_key" {
  description = "SSH public key for server access. Leave empty to use terraform/.ssh/id_ed25519.pub"
  type        = string
  default     = ""
}
