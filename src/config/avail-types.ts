// Avail-specific type definitions
// These types are specific to the Avail blockchain

// RPC method definitions for Avail
export const availRpcMethods = {
  kate: {
    blockLength: {
      description: 'Get the block length',
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
      description: 'Generate a proof for the given cells',
      params: [
        {
          name: 'cells',
          type: 'Vec<Cell>',
        },
        {
          name: 'at',
          type: 'Hash',
          isOptional: true,
        },
      ],
      type: 'Vec<u8>',
    },
    queryDataProof: {
      description: 'Generate a proof for the given data',
      params: [
        {
          name: 'data_index',
          type: 'u32',
        },
        {
          name: 'at',
          type: 'Hash',
          isOptional: true,
        },
      ],
      type: 'ProofResponse',
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

// Avail blockchain specific types
export interface AvailBlock {
  hash: string;
  number: number;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  timestamp: number;
  extrinsics: AvailExtrinsic[];
  events: AvailEvent[];
}

export interface AvailExtrinsic {
  hash: string;
  method: string;
  section: string;
  args: any[];
  signer?: string;
  nonce?: number;
  signature?: string;
  tip?: string;
  success: boolean;
}

export interface AvailEvent {
  method: string;
  section: string;
  data: any[];
  phase: {
    ApplyExtrinsic?: number;
    Finalization?: boolean;
    Initialization?: boolean;
  };
}

export interface AvailDataSubmission {
  submitter: string;
  data: Uint8Array;
  dataRoot: string;
  blockNumber: number;
  extrinsicIndex: number;
}

export default {
  rpc: availRpcMethods,
  types: availTypes,
  runtime: availRuntimeApi,
  config: availConfig,
}; 