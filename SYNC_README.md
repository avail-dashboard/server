# Avail Blockchain Data Sync

This document explains how to use the blockchain data sync functionality to synchronize Avail blockchain data to your local database.

## 🚀 Quick Start

### 1. Test the Sync (Recommended First Step)
```bash
# Test with a small block range to verify everything works
npm run sync:e2e
```

### 2. Initial Full Sync
```bash
# Sync all blocks from genesis (this will take a while!)
npm run sync:full

# Or sync from a specific block
npm run sync:full -- --from 1000000
```

### 3. Incremental Sync
```bash
# Continue syncing from the last synced block
npm run sync:incremental
```

### 4. Live Sync
```bash
# Continuously sync new blocks as they arrive
npm run sync:live
```

## 📖 Sync Modes

### Full Sync
Syncs all blocks from genesis (or specified start block) to the latest block.
```bash
npm run sync:full                    # From genesis
npm run sync:full -- --from 500000  # From block 500000
npm run sync:full -- --from 0 --to 1000000  # Specific range
```

### Incremental Sync  
Continues syncing from where the last sync left off.
```bash
npm run sync:incremental
```

### Range Sync
Syncs a specific block range.
```bash
npm run sync:range -- --from 1000000 --to 1005000
```

### Live Sync
Continuously monitors for new blocks and syncs them automatically.
```bash
npm run sync:live
```

## ⚙️ Configuration Options

### Command Line Arguments
- `--mode <mode>` - Sync mode: full, incremental, range, live
- `--from <block>` - Starting block number
- `--to <block>` - Ending block number  
- `--batch-size <size>` - Number of blocks to process per batch (default: 50)
- `--delay <ms>` - Delay between batches in milliseconds (default: 100)

### Examples
```bash
# Sync with custom batch size and delay
npm run sync:range -- --from 1000 --to 2000 --batch-size 10 --delay 500

# Test sync with small range
npm run sync:test  # Pre-configured test range
```

## 📊 Monitoring

### Progress Tracking
The sync script provides real-time progress information:
- Current block being processed
- Progress percentage
- Processing rate (blocks/second)
- Estimated time remaining
- Error count

### Database Verification
After syncing, you can verify the data:
```sql
-- Check total blocks synced
SELECT COUNT(*) FROM blocks;

-- Check latest synced block
SELECT MAX(number) FROM blocks;

-- Check sync state
SELECT * FROM sync_state ORDER BY id DESC LIMIT 1;

-- Check extrinsics and events
SELECT COUNT(*) FROM extrinsics;
SELECT COUNT(*) FROM events;
```

## 🛠️ Troubleshooting

### Common Issues

**Connection Errors**
- Ensure your `.env.local` file has correct DATABASE_URL
- Verify Avail RPC endpoints are accessible
- Check network connectivity

**Memory Issues**
- Reduce batch size: `--batch-size 10`
- Increase delay between batches: `--delay 1000`

**Rate Limiting**
- The script automatically handles rate limiting
- Increase delays if you hit RPC limits

### Graceful Shutdown
The sync script handles graceful shutdown:
- Press `Ctrl+C` to stop
- Current batch will complete before stopping
- Progress is saved to database

### Recovery
If sync is interrupted:
```bash
# Check where sync stopped
npm run sync:incremental  # Will continue from last synced block
```

## 🏗️ Architecture

### Components
1. **BlockIndexerService** - Fetches blocks from Avail RPC
2. **DataProcessorService** - Processes and stores blockchain data
3. **SyncService** - Orchestrates the sync process and tracks state

### Data Flow
```
Avail RPC → BlockIndexer → DataProcessor → PostgreSQL Database
                ↓
            Progress Tracking in sync_state table
```

### Database Tables
- `blocks` - Block headers and metadata
- `extrinsics` - Transaction/extrinsic data
- `events` - Blockchain events
- `accounts` - Account information
- `sync_state` - Sync progress and status

## 🚨 Important Notes

### First Time Setup
1. Ensure your database is running and accessible
2. Run database migrations if needed
3. Test with `npm run sync:e2e` first
4. Start with a small range before doing full sync

### Performance Considerations
- Full sync from genesis can take hours/days depending on chain size
- Use appropriate batch sizes for your hardware
- Monitor database disk space
- Consider running during off-peak hours

### Backup Recommendations
- Backup your database before large sync operations
- Monitor disk space during sync
- Consider incremental backups during long syncs

## 📞 Support

If you encounter issues:
1. Check the logs for error details
2. Verify your environment configuration
3. Test with the e2e script first
4. Try reducing batch sizes for stability 