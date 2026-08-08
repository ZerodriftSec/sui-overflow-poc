import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import prepareHandler from '../../../apps/docs/pages/api/sponsor/prepare';
import executeHandler from '../../../apps/docs/pages/api/sponsor/execute';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Setup mocks for GraphQL client
const mockListCoins = vi.fn();
const mockExecuteTransaction = vi.fn();

vi.mock('@mysten/sui/graphql', () => {
  return {
    SuiGraphQLClient: function () {
      return {
        listCoins: mockListCoins,
        executeTransaction: mockExecuteTransaction,
        getChainIdentifier: vi.fn().mockResolvedValue('2udHrxzeBniyA3F1wUTYhHs6f2JDwivJvAfqjJ2m63hg'),
        getRawReferenceGasPrice: vi.fn().mockResolvedValue(1000n),
      };
    },
  };
});

// Mock Transaction.from to avoid parsing issues with mock inputs
vi.mock('@mysten/sui/transactions', async (importOriginal) => {
  const actual = await importOriginal<any>();
  class MockTransaction extends actual.Transaction {
    static from = vi.fn().mockImplementation(() => {
      return new MockTransaction();
    });
  }
  return {
    ...actual,
    Transaction: MockTransaction,
  };
});

const VALID_USER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';
const VALID_SPONSOR_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000456';
const VALID_GAS_COIN_ID = '0x0000000000000000000000000000000000000000000000000000000000000789';
const VALID_DIGEST = '11111111111111111111111111111111';

const mockRequest = (method: string, body: any = {}) => {
  return {
    method,
    body,
  } as any;
};

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('Docs Sponsor API Endpoints', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPONSOR_PRIVATE_KEY = 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('prepare API', () => {
    it('should return 405 if method is not POST', async () => {
      const req = mockRequest('GET');
      const res = mockResponse();
      await prepareHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('should return 400 if transaction is missing', async () => {
      const req = mockRequest('POST', { userAddress: VALID_USER_ADDRESS });
      const res = mockResponse();
      await prepareHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing "transaction" field' });
    });

    it('should return 400 if userAddress is missing', async () => {
      const req = mockRequest('POST', { transaction: '{}' });
      const res = mockResponse();
      await prepareHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid "userAddress" field' });
    });

    it('should return 500 if SPONSOR_PRIVATE_KEY is not configured', async () => {
      delete process.env.SPONSOR_PRIVATE_KEY;
      delete process.env.E2E_PRIVATE_KEY;
      const req = mockRequest('POST', { transaction: '{}', userAddress: VALID_USER_ADDRESS });
      const res = mockResponse();
      await prepareHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'SPONSOR_PRIVATE_KEY environment variable is not configured' });
    });

    it('should return 400 if sponsor has no gas coins', async () => {
      process.env.SPONSOR_PRIVATE_KEY = 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep';
      mockListCoins.mockResolvedValueOnce({ objects: [] });

      const req = mockRequest('POST', { transaction: '{}', userAddress: VALID_USER_ADDRESS });
      const res = mockResponse();
      await prepareHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sponsor has no SUI coins for gas' });
    });

    it('should successfully prepare and build transaction', async () => {
      process.env.SPONSOR_PRIVATE_KEY = 'suiprivkey1qrhc5vekj8h344caqgj752ur72rq2d2w67kdq98qk36s66q4usuhx7q9sep';
      mockListCoins.mockResolvedValueOnce({
        objects: [
          {
            objectId: VALID_GAS_COIN_ID,
            digest: VALID_DIGEST,
            version: '1',
          },
        ],
      });

      const mockBuiltBytes = new Uint8Array([1, 2, 3, 4]);
      const mockBuild = vi.spyOn(Transaction.prototype, 'build').mockResolvedValueOnce(mockBuiltBytes);

      const req = mockRequest('POST', { transaction: '{}', userAddress: VALID_USER_ADDRESS });
      const res = mockResponse();
      await prepareHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        bytes: Buffer.from(mockBuiltBytes).toString('base64'),
      });
      mockBuild.mockRestore();
    });
  });

  describe('execute API', () => {
    it('should return 405 if method is not POST', async () => {
      const req = mockRequest('GET');
      const res = mockResponse();
      await executeHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });

    it('should return 400 if required fields are missing', async () => {
      const req = mockRequest('POST', { userSignature: 'user_sig', userAddress: VALID_USER_ADDRESS });
      const res = mockResponse();
      await executeHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 if SPONSOR_PRIVATE_KEY is not configured', async () => {
      delete process.env.SPONSOR_PRIVATE_KEY;
      const req = mockRequest('POST', {
        bytes: 'dGVzdF9ieXRlcw==',
        userSignature: 'user_sig',
        userAddress: VALID_USER_ADDRESS,
      });
      const res = mockResponse();
      await executeHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'SPONSOR_PRIVATE_KEY environment variable is not configured' });
    });

    it('should return 400 if transaction execution fails', async () => {
      const sponsorKeypair = Ed25519Keypair.generate();
      process.env.SPONSOR_PRIVATE_KEY = sponsorKeypair.getSecretKey();

      mockExecuteTransaction.mockResolvedValueOnce({
        $kind: 'FailedTransaction',
        FailedTransaction: {
          status: { error: 'Simulation failed' },
        },
      });

      const req = mockRequest('POST', {
        bytes: Buffer.from('test_bytes').toString('base64'),
        userSignature: 'user_sig',
        userAddress: VALID_USER_ADDRESS,
      });
      const res = mockResponse();
      await executeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '"Simulation failed"' });
    });

    it('should execute transaction successfully and return digest', async () => {
      const sponsorKeypair = Ed25519Keypair.generate();
      process.env.SPONSOR_PRIVATE_KEY = sponsorKeypair.getSecretKey();

      mockExecuteTransaction.mockResolvedValueOnce({
        $kind: 'Transaction',
        Transaction: {
          digest: 'MockDigest',
        },
      });

      const req = mockRequest('POST', {
        bytes: Buffer.from('test_bytes').toString('base64'),
        userSignature: 'user_sig',
        userAddress: VALID_USER_ADDRESS,
      });
      const res = mockResponse();
      await executeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ digest: 'MockDigest' });
    });
  });
});
