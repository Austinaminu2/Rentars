import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEscrowTransaction } from '../useEscrowTransaction';
import * as freighterUtils from '@/lib/freighter-utils';
import * as stellarTransactions from '@/lib/stellar-transactions';

vi.mock('@/lib/freighter-utils');
vi.mock('@/lib/stellar-transactions');
vi.mock('@stellar/stellar-sdk', () => ({
  default: {
    Transaction: {
      fromXDR: vi.fn(() => ({})),
    },
    Horizon: {
      Server: vi.fn(() => ({
        submitTransaction: vi.fn().mockResolvedValue({ hash: 'tx_hash_123' }),
      })),
    },
  },
}));

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as any;

describe('useEscrowTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signing timeout', () => {
    it('should timeout if signing takes too long', async () => {
      vi.mocked(stellarTransactions.buildEscrowFundingTransaction).mockReturnValue({
        xdr: 'xdr123',
      } as any);

      vi.mocked(freighterUtils.signWithFreighter).mockRejectedValue(
        new freighterUtils.FreighterError('Signing request timed out', 'TIMEOUT')
      );

      const { result } = renderHook(() => useEscrowTransaction('testnet'));

      await expect(
        result.current.submit({
          type: 'fund',
          escrowId: 'escrow_123',
          amount: 100,
          tenantPublicKey: 'GABC...',
          signingTimeout: 100,
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(result.current.status).toBe('timeout');
      });

      expect(result.current.error).toContain('timed out');
      expect(result.current.canRetry).toBe(true);
    });
  });

  describe('status tracking', () => {
    it('should track waiting_signature status', async () => {
      vi.mocked(stellarTransactions.buildEscrowFundingTransaction).mockReturnValue({
        xdr: 'xdr123',
      } as any);

      let resolveSign: any;
      vi.mocked(freighterUtils.signWithFreighter).mockReturnValue(
        new Promise(resolve => {
          resolveSign = resolve;
        })
      );

      const { result } = renderHook(() => useEscrowTransaction('testnet'));

      const promise = result.current.submit({
        type: 'fund',
        escrowId: 'escrow_123',
        amount: 100,
        tenantPublicKey: 'GABC...',
      });

      await waitFor(() => {
        expect(result.current.status).toBe('waiting_signature');
      });

      resolveSign('signed_xdr');
      await promise;
    });

    it('should allow retry after user rejection', async () => {
      vi.mocked(stellarTransactions.buildEscrowFundingTransaction).mockReturnValue({
        xdr: 'xdr123',
      } as any);

      vi.mocked(freighterUtils.signWithFreighter).mockRejectedValue(
        new freighterUtils.FreighterError('Transaction signing rejected by user', 'USER_REJECTED')
      );

      const { result } = renderHook(() => useEscrowTransaction('testnet'));

      await expect(
        result.current.submit({
          type: 'fund',
          escrowId: 'escrow_123',
          amount: 100,
          tenantPublicKey: 'GABC...',
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.canRetry).toBe(true);
      expect(result.current.error).toContain('rejected');
    });

    it('should not allow retry on network mismatch', async () => {
      vi.mocked(stellarTransactions.buildEscrowFundingTransaction).mockReturnValue({
        xdr: 'xdr123',
      } as any);

      vi.mocked(freighterUtils.signWithFreighter).mockRejectedValue(
        new freighterUtils.FreighterError(
          'Wallet is on mainnet but transaction requires testnet',
          'NETWORK_MISMATCH'
        )
      );

      const { result } = renderHook(() => useEscrowTransaction('testnet'));

      await expect(
        result.current.submit({
          type: 'fund',
          escrowId: 'escrow_123',
          amount: 100,
          tenantPublicKey: 'GABC...',
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      expect(result.current.canRetry).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset status and error', async () => {
      const { result } = renderHook(() => useEscrowTransaction('testnet'));

      result.current.reset();

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
      expect(result.current.canRetry).toBe(false);
    });
  });
});
