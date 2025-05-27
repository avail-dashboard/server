# SQLite to PostgreSQL Migration

## Overview

This document describes the migration from SQLite to PostgreSQL for the Avail Explorer backend. The migration was performed to standardize on PostgreSQL for all environments (development, testing, and production).

## Changes Made

1. **Configuration Changes**
   - Removed SQLite options from config validation
   - Updated database configuration to use PostgreSQL exclusively
   - Modified environment variables to require DATABASE_URL

2. **Database Service Changes**
   - Removed SQLite-specific code from database.ts
   - Removed placeholder conversion functions
   - Simplified transaction handling to use PostgreSQL only
   - Updated table creation SQL to use PostgreSQL types

3. **Dependency Changes**
   - Removed SQLite packages from package.json:
     - better-sqlite3
     - @types/better-sqlite3
     - sqlite3
     - @types/sqlite3

4. **Environment Configuration**
   - Updated env.example to include PostgreSQL configuration examples
   - Added both local and production connection strings:
     - Local: `postgresql://avail_user:<REDACTED>@pg.avail.naxatar.com:5432/avail_explorer_qa`
     - Production: `postgresql://avail_user:<REDACTED>@pg.avail.naxatar.com:5432/avail_explorer`

5. **CI/CD Updates**
   - Updated GitHub workflow files (test.yml and performance.yml)
   - Added PostgreSQL service containers for testing
   - Replaced SQLite configuration with PostgreSQL

## Connection Details

### Local Development
```
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://avail_user:<REDACTED>@pg.avail.naxatar.com:5432/avail_explorer_qa
```

### Production
```
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://avail_user:<REDACTED>@pg.avail.naxatar.com:5432/avail_explorer
```

## Benefits of PostgreSQL

1. **Consistency**: Same database engine across all environments
2. **Advanced Features**: Complex queries, joins, and transactions
3. **Scalability**: Better performance for larger datasets
4. **Concurrent Access**: Improved handling of multiple connections
5. **Data Integrity**: Stronger constraints and referential integrity

## Migration Notes

The migration primarily involved code changes rather than data migration since we're using fresh database instances. If you need to migrate existing SQLite data to PostgreSQL, consider using a tool like pgloader or a custom script to handle the data transfer.

## Troubleshooting

If you encounter connection issues:

1. Verify the DATABASE_URL is correctly formatted
2. Ensure network connectivity to the database server
3. Check that the database user has appropriate permissions
4. For local development, consider using a connection pooler for better performance 