import { DefinitionRpc, DefinitionRpcSub } from '@polkadot/types/types';

// Avail-specific RPC definitions
export const availRpc: Record<string, Record<string, DefinitionRpc | DefinitionRpcSub>> = {
  kate: {
    blockLength: {
      description: 'Get block length',
      params: [
        {
          name: 'at',
          type: 'Hash',
          isOptional: true,
        },
      ],
      type: 'BlockLength',
    },
    queryProof: {
      description: 'Generate proof for block data',
      params: [
        {
          name: 'blockHash',
          type: 'Hash',
        },
        {
          name: 'cells',
          type: 'Vec<Cell>',
        },
      ],
      type: 'Vec<GProof>',
    },
    queryDataProof: {
      description: 'Generate proof for application data',
      params: [
        {
          name: 'blockHash',
          type: 'Hash',
        },
        {
          name: 'appId',
          type: 'u32',
        },
      ],
      type: 'ProofResponse',
    },
    queryRows: {
      description: 'Query rows for block',
      params: [
        {
          name: 'rows',
          type: 'Vec<u32>',
        },
        {
          name: 'at',
          type: 'Hash',
          isOptional: true,
        },
      ],
      type: 'Vec<GRow>',
    },
  },
};

// Avail-specific type definitions
export const availTypes = {
  AppId: 'u32',
  DataLookup: {
    size: 'u32',
    index: 'Vec<(u32, u32)>',
  },
  KateCommitment: '[u8; 48]',
  V3HeaderExtension: {
    appLookup: 'DataLookup',
    commitment: 'KateCommitment',
  },
  HeaderExtension: 'V3HeaderExtension',
  DaHeader: {
    parentHash: 'Hash',
    number: 'Compact<BlockNumber>',
    stateRoot: 'Hash',
    extrinsicsRoot: 'Hash',
    digest: 'Digest',
    extension: 'HeaderExtension',
  },
  Header: 'DaHeader',
  CheckAppIdExtra: {
    appId: 'AppId',
  },
  CheckAppIdTypes: {},
  BlockLength: {
    max: 'PerDispatchClass',
    cols: 'u32',
    rows: 'u32',
    chunkSize: 'u32',
  },
  PerDispatchClass: {
    normal: 'u32',
    operational: 'u32',
    mandatory: 'u32',
  },
  DataProof: {
    root: 'H256',
    proof: 'Vec<H256>',
    numberOfLeaves: 'Compact<u32>',
    leafIndex: 'Compact<u32>',
    leaf: 'H256',
  },
  Cell: {
    row: 'u32',
    col: 'u32',
  },
  GProof: 'Vec<u8>',
  GRow: 'Vec<u8>',
  ProofResponse: {
    dataProof: 'DataProof',
    message: 'Option<AddressedMessage>',
  },
  AddressedMessage: {
    message: 'Message',
    from: 'H256',
    to: 'H256',
    originDomain: 'u32',
    destinationDomain: 'u32',
    data: 'Vec<u8>',
    id: 'u64',
  },
  Message: {
    data: 'Vec<u8>',
  },
};

// Runtime API definitions for Avail
export const availRuntimeApi = {
  DataAvailApi: [
    {
      methods: {
        query_proof: {
          description: 'Generate proof for given cells',
          params: [
            {
              name: 'cells',
              type: 'Vec<Cell>',
            },
          ],
          type: 'Vec<GProof>',
        },
        query_data_proof: {
          description: 'Generate proof for application data',
          params: [
            {
              name: 'app_id',
              type: 'u32',
            },
          ],
          type: 'ProofResponse',
        },
      },
      version: 1,
    },
  ],
};

// Configuration for handling unknown call indices gracefully
export const availConfig = {
  // Skip unknown call indices instead of throwing errors
  skipUnknownCalls: true,
  
  // Fallback behavior for failed extrinsic decoding
  fallbackBehavior: 'skip',
  
  // Custom error handling for runtime compatibility
  handleRuntimeErrors: true,
  
  // Enable verbose logging for debugging
  verboseLogging: process.env.NODE_ENV === 'development',
};

export default {
  rpc: availRpc,
  types: availTypes,
  runtime: availRuntimeApi,
  config: availConfig,
}; 