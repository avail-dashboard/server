# Blockchain Data Analysis: Available Fields and Database Mapping

## Overview
This document analyzes the available blockchain data from the AvailBlockchainService and how it maps to the database schema. The goal is to understand which fields are available from the blockchain and which need to be calculated or derived.

## Available Blockchain Data (from AvailBlockchainService.getBlock())

### BlockData Structure
```typescript
interface BlockData {
  hash: string;                    // ✅ Available from blockchain
  number: number;                  // ✅ Available from blockchain
  parentHash: string;              // ✅ Available from blockchain
  stateRoot: string;               // ✅ Available from blockchain
  extrinsicsRoot: string;          // ✅ Available from blockchain
  timestamp: number;               // ⚠️ Currently hardcoded to Date.now()
  validator?: string;              // ✅ Available from blockchain (block author)
  extrinsics: ExtrinsicData[];     // ✅ Available from blockchain
  events: EventData[];             // ✅ Available from blockchain
}
```

### ExtrinsicData Structure
```typescript
interface ExtrinsicData {
  hash: string;                    // ✅ Available from blockchain
  index: number;                   // ✅ Available from blockchain
  isSigned: boolean;               // ✅ Available from blockchain
  method: {                        // ✅ Available from blockchain
    section: string;
    method: string;
    args: Record<string, any>;
  };
  signer?: string;                 // ✅ Available from blockchain
  nonce?: number;                  // ✅ Available from blockchain
  tip?: string;                    // ✅ Available from blockchain
  fee?: string;                    // ❌ Not available directly
  success: boolean;                // ⚠️ Set to true, needs event processing
  actualFee?: string;              // ❌ Requires event processing
  transferCount?: number;          // ✅ Calculated from method
  length?: number;                 // ✅ Available from blockchain
  paysFee?: boolean;               // ✅ Calculated from method
  lifetime?: {                     // ✅ Available from blockchain
    birth?: number;
    death?: number;
    immortal?: boolean;
  };
  signature?: {                    // ✅ Available from blockchain
    signature: string;
    signedExtensions: Record<string, any>;
  };
}
```

### EventData Structure
```typescript
interface EventData {
  index: number;                   // ✅ Available from blockchain
  section: string;                 // ✅ Available from blockchain
  method: string;                  // ✅ Available from blockchain
  data: any[];                     // ✅ Available from blockchain
  phase: {                         // ✅ Available from blockchain
    applyExtrinsic?: number;
    finalization?: boolean;
    initialization?: boolean;
  };
}
```

## Database Schema Requirements

### Block Table (from schema.prisma)
```sql
model Block {
  number               Int              @id
  hash                 String           @unique
  parentHash           String?          -- ✅ Available
  stateRoot            String?          -- ✅ Available
  extrinsicsRoot       String?          -- ✅ Available
  timestamp            DateTime         -- ⚠️ Needs proper extraction
  extrinsicsCount      Int              -- ✅ Available (array length)
  eventsCount          Int              -- ✅ Available (array length)
  
  // Validator info
  validatorAddress     String?          -- ✅ Available as validator
  validatorName        String?          -- ❌ Requires separate lookup
  
  // Block metadata
  specVersion          Int?             -- ✅ Available from ChainInfo
  totalFees            Decimal?         -- ❌ Requires calculation from events
  transferCount        Int?             -- ❌ Requires calculation from extrinsics
  dataSubmissionsSize  Int?             -- ❌ Requires calculation from extrinsics
  createdAt            DateTime         -- ✅ Application generated
}
```

## Issues and Solutions

### 1. **Timestamp Extraction** ⚠️
**Issue**: Currently hardcoded to `Date.now()` in the blockchain service.
**Solution**: Extract from timestamp extrinsic (usually first extrinsic in block).

```typescript
// In AvailBlockchainService.getBlock()
// Find timestamp extrinsic
const timestampExtrinsic = block.block.extrinsics.find(ext => 
  ext.method?.section === 'timestamp' && ext.method?.method === 'set'
);
if (timestampExtrinsic && timestampExtrinsic.method?.args) {
  // Extract timestamp from args
  const timestampArg = timestampExtrinsic.method.args[0] || timestampExtrinsic.method.args.now;
  timestamp = new Date(Number(timestampArg)).getTime();
}
```

### 2. **Spec Version** ✅
**Solution**: Available from `getChainInfo()` but needs to be passed to block processing.

### 3. **Total Fees** ❌
**Issue**: Requires processing events to calculate fees from `balances.Withdraw` events.
**Solution**: Process events to extract fee information.

```typescript
// Calculate total fees from events
const feeEvents = events.filter(event => 
  event.section === 'balances' && event.method === 'Withdraw'
);
const totalFees = feeEvents.reduce((sum, event) => {
  // Extract fee amount from event data
  const feeAmount = event.data[1]; // Usually second parameter
  return sum + BigInt(feeAmount);
}, BigInt(0));
```

### 4. **Transfer Count** ❌
**Issue**: Needs to be calculated from all extrinsics in the block.
**Solution**: Already partially implemented in `countTransfersInExtrinsic()`.

### 5. **Data Submissions Size** ❌
**Issue**: Requires calculating total size of all data submissions in the block.
**Solution**: Process `dataAvailability.submitData` extrinsics.

### 6. **Validator Name** ❌
**Issue**: Requires identity lookup for the validator address.
**Solution**: Separate identity resolution process.

### 7. **Extrinsic Success Status** ⚠️
**Issue**: Currently hardcoded to `true`, needs event processing.
**Solution**: Check for `system.ExtrinsicSuccess` or `system.ExtrinsicFailed` events.

## Implementation Priority

### High Priority (Block Processing)
1. **Fix timestamp extraction** - Critical for proper block data
2. **Add spec version** - Easy to implement, already available
3. **Calculate total fees** - Important for analytics
4. **Calculate transfer count** - Important for statistics
5. **Calculate data submissions size** - Core feature for Avail

### Medium Priority (Enhanced Features)
1. **Validator name resolution** - Nice to have for UI
2. **Extrinsic success status** - Important for accuracy
3. **Actual fee calculation** - Important for detailed analytics

### Low Priority (Optimization)
1. **Performance optimization** - Can be done after basic functionality works
2. **Caching improvements** - Already implemented for old blocks

## Code Changes Required

### 1. Update AvailBlockchainService.getBlock()
- Fix timestamp extraction from timestamp extrinsic
- Add spec version from chain info
- Calculate block-level statistics

### 2. Create BlockProcessor helper
- Extract fees from events
- Calculate transfer counts
- Calculate data submission sizes
- Determine extrinsic success status

### 3. Update BlockMapper
- Map additional fields to database schema
- Handle validator name resolution
- Format calculated values properly

## Available Helper Methods

The blockchain service already provides several helper methods:
- `countTransfersInExtrinsic()` - Counts transfers in individual extrinsics
- `determineIfPaysFee()` - Determines if extrinsic pays fees
- `extractEventsData()` - Extracts event information
- `extractExtrinsicsData()` - Extracts extrinsic information
- `getChainInfo()` - Gets runtime metadata including spec version

## Summary

**Available from Blockchain**: Most core block data (hash, number, parent hash, state root, extrinsics root, validator address, extrinsics, events)

**Needs Calculation**: Timestamp (from extrinsics), total fees (from events), transfer count (from extrinsics), data submissions size (from extrinsics), validator name (from identity), extrinsic success status (from events)

**Already Implemented**: Basic block structure, extrinsic extraction, event extraction, caching, connection management

**Next Steps**: 
1. Fix timestamp extraction as the highest priority
2. Add spec version from chain info
3. Implement fee calculation from events
4. Calculate block-level statistics
5. Create comprehensive block processor