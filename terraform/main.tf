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
    write_files:
      # Hetzner hands out private-network addresses over DHCP on the second NIC
      # and runs that network at a 1450-byte MTU. Nothing in the stock image
      # configures it, so the interface comes up with no address: the app box
      # cannot reach the engine at 10.0.1.3, /api/dograh/health times out, and
      # Caddy returns a 502 that looks like the engine is down when it is
      # healthy and simply unreachable. Written here so a rebuilt box
      # configures itself instead of needing a hand.
      - path: /etc/netplan/60-hetzner-private.yaml
        permissions: "0600"
        content: |
          network:
            version: 2
            ethernets:
              enp7s0:
                dhcp4: true
                mtu: 1450
    runcmd:
      - netplan apply
      - install -m 0755 -d /etc/apt/keyrings
      - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
      - apt-get update
      - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      - mkdir -p /opt/vocalonix/repo
      # Trailing `|| true` because this image has no `ubuntu` user. Without it
      # the command fails, cloud-init aborts the rest of runcmd, and the box
      # arrives with no Docker and no private network — which is exactly how
      # the first rebuild went.
      - usermod -aG docker ubuntu || true
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

  lifecycle {
    # Hetzner injects `ssh_keys` through cloud-init at first boot and offers no
    # API to attach a key to a running server, so this list describes how the
    # box was built, not who can log into it today. Reconciling it against a
    # live server is at best a no-op and at worst a replacement — which here
    # means destroying a production box and its Postgres volume to change a
    # line in a text file. Grant access by appending to
    # /root/.ssh/authorized_keys instead.
    #
    # user_data is ForceNew in this provider and, like ssh_keys, is only ever
    # read at first boot. Reconciling it would destroy a running production box
    # and its Postgres volume to change a text file that the live server has
    # already finished acting on. Edits here therefore describe how the *next*
    # box gets built; apply them to a running one by hand, or by deliberately
    # tainting that server when a rebuild is what you actually want.
    ignore_changes = [ssh_keys, user_data]
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

  lifecycle {
    # See the note on hcloud_server.vocalonix: ssh_keys is creation-only, and
    # reconciling it against this running server risks replacing it.
    #
    # user_data is ForceNew in this provider and, like ssh_keys, is only ever
    # read at first boot. Reconciling it would destroy a running production box
    # and its Postgres volume to change a text file that the live server has
    # already finished acting on. Edits here therefore describe how the *next*
    # box gets built; apply them to a running one by hand, or by deliberately
    # tainting that server when a rebuild is what you actually want.
    ignore_changes = [ssh_keys, user_data]
  }
}
