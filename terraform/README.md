# Vocalonix Hetzner OpenTofu deployment

This folder deploys the Hetzner Cloud infrastructure for Vocalonix and Dograh.

## What it creates

- `vocalonix-app` server (default `cx23`) in Helsinki (`hel1`)
- `dograh` server (default `cx33`) in Helsinki (`hel1`)
- A private `vocalonix` network (`10.0.0.0/16`) with a `/24` subnet
- A firewall allowing SSH, HTTP/S, and TURN voice ports
- A generated SSH key at `terraform/.ssh/id_ed25519`

The `cx23` (2 vCPU / 4 GB) is the default for Vocalonix because it only runs the web/API/worker/Postgres stack; the heavier voice pipeline runs on the `cx33` Dograh server. If the load is higher than expected, change `var.vocalonix_server_type` to `cx33`.

## Requirements

- [OpenTofu](https://opentofu.org/) (`tofu`)
- Hetzner Cloud API token exported as `HCLOUD_TOKEN` or passed with `TF_VAR_hcloud_token`
- SSH public key at `terraform/.ssh/id_ed25519.pub` (generated automatically, or set `var.ssh_public_key`)

## Usage

```bash
cd terraform

# 1. Set the Hetzner token (do not commit this)
export HCLOUD_TOKEN="..."

# 2. Generate SSH key if it does not exist
mkdir -p .ssh
[ -f .ssh/id_ed25519 ] || ssh-keygen -t ed25519 -f .ssh/id_ed25519 -N ""

# 3. Initialize and apply
tofu init
tofu plan
tofu apply
```

After `tofu apply`, the public IPs are shown. Docker is installed on both servers via cloud-init, and the servers are on a private network (`10.0.1.2` and `10.0.1.3`).

## Connecting

```bash
ssh -i terraform/.ssh/id_ed25519 ubuntu@<ip>
```

## Next step

Install the application stack with Docker Compose on each server. The Dograh server runs the voice services (`api`, `ui`, `postgres`, `redis`, `minio`, `coturn`). The Vocalonix server runs `vocalonix-db`, `vocalonix-api`, `vocalonix-worker`, and `vocalonix-web`, connecting to Dograh over the private network.
