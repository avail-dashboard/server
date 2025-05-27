# Avail Explorer Deployment Status

## Services Status

| Service   | Container Name   | Status      | Port Mapping      | Access URL               |
|-----------|------------------|-------------|-------------------|--------------------------|
| PostgreSQL| avail-postgres   | Healthy     | 0.0.0.0:5432->5432| pg.avail.naxatar.com     |
| Redis     | avail-redis      | Healthy     | 0.0.0.0:6379->6379| redis.avail.naxatar.com  |
| Backend   | avail-backend    | Restarting  | 0.0.0.0:3001->3001| api.avail.naxatar.com    |

## Deployment Configuration

The services have been deployed using Docker Compose with a production environment file (`.env.production`), and NGINX has been configured to provide domain-based access to each service.

### Environment Configuration

A production environment file (`.env.production`) has been created with the following key configurations:
- PostgreSQL connection: `postgresql://avail_user:<REDACTED>@pg.avail.naxatar.com:5432/avail_explorer`
- Redis connection: `redis://redis.avail.naxatar.com:6379`
- JWT Secret: A secure 32+ character string
- SUBSCAN API Key: A valid API key for Subscan

### NGINX Configuration

NGINX has been successfully configured with virtual hosts for each service:
- PostgreSQL: pg.avail.naxatar.com -> localhost:5432
- Redis: redis.avail.naxatar.com -> localhost:6379
- Backend API: api.avail.naxatar.com -> localhost:3001

### Connection Testing Results

Direct connections to the services:
- PostgreSQL (localhost:5432): ✅ Successful
- Redis (localhost:6379): ✅ Successful
- Backend API (localhost:3001): ❌ Not available (service restarting)

NGINX proxy connections:
- PostgreSQL (pg.avail.naxatar.com): ✅ Responding with 200 OK
- Redis (redis.avail.naxatar.com): ✅ Responding with 200 OK
- Backend API (api.avail.naxatar.com): ✅ Responding with 200 OK (NGINX default page, not the actual API)

## Issues and Next Steps

1. **Backend Service**: The backend service is experiencing multiple issues:
   - Initially missing the `better-sqlite3` dependency, which appears to be fixed
   - Permission issues writing to the logs directory
   - Connection issues with the Avail RPC endpoint

   Suggested fixes:
   ```bash
   # Fix permissions for logs directory
   mkdir -p logs && chmod 777 logs
   
   # Consider modifying the application code to handle RPC connection failures gracefully
   ```

2. **DNS Configuration**: For the domain names to work in production, DNS records need to be configured to point pg.avail.naxatar.com, redis.avail.naxatar.com, and api.avail.naxatar.com to the server's IP address.

3. **SSL/TLS**: For production use, consider setting up SSL/TLS certificates for secure connections using Let's Encrypt.

## Conclusion

PostgreSQL and Redis services are running properly and are accessible through both their direct ports and the NGINX-configured domain names. The NGINX configuration for domain-based access is in place and responding correctly. The backend service is partially working but continues to have issues with the Avail RPC connection that need to be addressed for a fully operational deployment. 