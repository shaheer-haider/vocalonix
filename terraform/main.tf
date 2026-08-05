locals {
  ssh_public_key = var.ssh_public_key != "" ? var.ssh_public_key : file("${path.module}/.ssh/id_ed25519.pub")
}

resource "hcloud_ssh_key" "devin" {
  name       = "vocalonix-devin"
  public_key = local.ssh_public_key
}

resource "hcloud_network" "vocalonix" {
  name     = "vocalonix"
  ip_range = "10.0.0.0/16"
}

resource "hcloud_network_subnet" "vocalonix" {
  network_id   = hcloud_network.vocalonix.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.0.1.0/24"
}

resource "hcloud_firewall" "vocalonix" {
  name = "vocalonix"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "3478"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "3478"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "5349"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "5349"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "49152-49200"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "8000"
    source_ips = ["10.0.1.0/24"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "9000"
    source_ips = ["10.0.1.0/24"]
  }
}

locals {
  cloud_init = <<-YAML
    #cloud-config
    package_update: true
    package_upgrade: true
    packages:
      - apt-transport-https
      - ca-certificates
      - curl
      - gnupg
      - lsb-release
    runcmd:
      - install -m 0755 -d /etc/apt/keyrings
      - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
      - apt-get update
      - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      - usermod -aG docker ubuntu
    YAML
}

resource "hcloud_server" "vocalonix" {
  name         = "vocalonix-app"
  server_type  = var.vocalonix_server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.devin.id]
  firewall_ids = [hcloud_firewall.vocalonix.id]
  user_data    = local.cloud_init

  public_net {
    ipv4_enabled = true
    ipv6_enabled = false
  }

  network {
    network_id = hcloud_network.vocalonix.id
    ip         = "10.0.1.2"
  }

  depends_on = [hcloud_network_subnet.vocalonix]

  labels = {
    role = "vocalonix"
  }
}

resource "hcloud_server" "dograh" {
  name         = "dograh"
  server_type  = var.dograh_server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.devin.id]
  firewall_ids = [hcloud_firewall.vocalonix.id]
  user_data    = local.cloud_init

  public_net {
    ipv4_enabled = true
    ipv6_enabled = false
  }

  network {
    network_id = hcloud_network.vocalonix.id
    ip         = "10.0.1.3"
  }

  depends_on = [hcloud_network_subnet.vocalonix]

  labels = {
    role = "dograh"
  }
}
