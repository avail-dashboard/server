# Nginx Configuration Files

This directory contains all nginx-related configuration files for the Avail Explorer Backend.

## Files Overview

### Main Configuration
- **`nginx.conf`** - Complete nginx configuration with all virtual hosts
  - Includes main nginx settings (worker processes, gzip, SSL, etc.)
  - Contains all three server blocks for API, PostgreSQL, and Redis

### Individual Service Configurations
- **`api-avail.conf`** - API server configuration (api.avail.naxatar.com → localhost:3001)
- **`pg-avail.conf`** - PostgreSQL proxy configuration (pg.avail.naxatar.com → localhost:5432)
- **`redis-avail.conf`** - Redis proxy configuration (redis.avail.naxatar.com → localhost:6379)

### Alternative Configuration
- **`avail-nginx.conf`** - Alternative nginx config (http block only, no global settings)

### Setup Script
- **`setup-nginx.sh`** - Automated setup script that:
  - Creates backup of existing configs
  - Installs nginx configurations to `/etc/nginx/sites-available/`
  - Enables the sites in `/etc/nginx/sites-enabled/`
  - Tests and reloads nginx configuration

## Domain Mappings

| Domain | Target | Purpose |
|--------|--------|---------|
| api.avail.naxatar.com | localhost:3001 | Avail Explorer API |
| pg.avail.naxatar.com | localhost:5432 | PostgreSQL Database |
| redis.avail.naxatar.com | localhost:6379 | Redis Cache |

## Usage

### Manual Setup
```bash
# Copy individual configs to nginx
sudo cp api-avail.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/api-avail /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Automated Setup
```bash
# Run the setup script (requires root)
sudo bash setup-nginx.sh
```

### Using the Complete Configuration
```bash
# Replace main nginx config
sudo cp nginx.conf /etc/nginx/nginx.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Notes

- All configurations include WebSocket support for the API server
- SSL/TLS termination should be configured separately (not included in these configs)
- The setup script creates automatic backups before making changes
- Configurations assume services are running on localhost with default ports 