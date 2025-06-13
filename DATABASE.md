# Database Management

This project uses **Prisma** as the single source of truth for database schema management. The old `init.sql` approach has been removed to eliminate conflicts and ensure consistency.

## Quick Start

### First Time Setup
```bash
# 1. Ensure .env.local file exists with DATABASE_URL
# 2. Generate Prisma client
npm run prisma:generate

# 3. Create and apply initial migration
npm run prisma:migrate:dev --name init

# 4. Seed database with initial data
npm run db:seed
```

### Development Workflow
```bash
# After making schema changes in prisma/schema.prisma:
npm run prisma:migrate:dev --name your_migration_name

# Deploy migrations to production:
npm run prisma:migrate:deploy

# Reset database (development only):
npm run db:reset
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run db:init` | Deploy migrations + generate client (production) |
| `npm run db:reset` | Reset database + apply migrations + generate client |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:check` | Verify database schema and field types |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate:dev` | Create and apply new migration |
| `npm run prisma:migrate:deploy` | Deploy pending migrations |
| `npm run prisma:studio` | Open Prisma Studio |

## Schema Changes

1. **Edit** `prisma/schema.prisma`
2. **Create migration**: `npm run prisma:migrate:dev --name descriptive_name`
3. **Commit** both schema and migration files

## Environment Configuration

All Prisma commands now use the `.env.local` file by default. Make sure your `.env.local` file contains:

```bash
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

## Key Benefits

- ✅ **Single source of truth**: Prisma schema defines everything
- ✅ **Type safety**: Generated TypeScript types
- ✅ **Migration history**: Trackable database changes
- ✅ **No conflicts**: No more bigint vs int issues
- ✅ **Rollback support**: Can revert migrations if needed
- ✅ **Environment consistency**: Uses .env.local for all operations

## Migration Files

Migrations are stored in `prisma/migrations/` and should be committed to version control. Each migration contains:
- `migration.sql` - The actual SQL changes
- Metadata about the migration

## Troubleshooting

### Database Connection Issues
```bash
# Check if database is running
npm run verify:blockchain

# Reset everything if corrupted
npm run db:reset
```

### Schema Drift
If your database schema doesn't match Prisma schema:
```bash
# Pull current database schema to Prisma
npm run prisma:pull

# Or reset to match Prisma schema
npm run db:reset
``` 