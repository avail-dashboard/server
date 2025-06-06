#!/bin/bash
set -e

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root"
    exit 1
fi

# Create backup directory for original configs
BACKUP_DIR="/etc/nginx/sites-available/backup-$(date +%Y%m%d%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup original configs if they exist
if [ -f /etc/nginx/sites-available/default ]; then
    cp /etc/nginx/sites-available/default $BACKUP_DIR/
fi

# Create NGINX configurations
cat > /etc/nginx/sites-available/pg-avail << 'EOL'
server {
    listen 80;
    server_name pg.avail.naxatar.com;

    location / {
        proxy_pass http://localhost:5432;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOL

cat > /etc/nginx/sites-available/redis-avail << 'EOL'
server {
    listen 80;
    server_name redis.avail.naxatar.com;

    location / {
        proxy_pass http://localhost:6379;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOL

cat > /etc/nginx/sites-available/api-avail << 'EOL'
server {
    listen 80;
    server_name api.avail.naxatar.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
    }
}
EOL

# Enable the new configurations
ln -sf /etc/nginx/sites-available/pg-avail /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/redis-avail /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/api-avail /etc/nginx/sites-enabled/

# Test NGINX configuration
nginx -t

# Reload NGINX to apply changes
systemctl reload nginx

echo "NGINX configuration completed. The following services are now accessible:"
echo "- PostgreSQL: pg.avail.naxatar.com"
echo "- Redis: redis.avail.naxatar.com"
echo "- API: api.avail.naxatar.com" 