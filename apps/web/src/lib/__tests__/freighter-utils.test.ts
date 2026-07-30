import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as freighterApi from '@stellar/freighter-api';
import {
  getWalletNetwork,
  checkNetworkMatch,
  connectFreighterWallet,
  signWithFreighter,
  FreighterError,
} from '../freighter-utils';

vi.mock('@stellar/freighter-api');

describe('freighter-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWalletNetwork', () => {
    it('should return mainnet when wallet is on PUBLIC network', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      } as any);

      const network = await getWalletNetwork();
      expect(network).toBe('mainnet');
    });

    it('should return testnet when wallet is on TESTNET network', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      } as any);

      const network = await getWalletNetwork();
      expect(network).toBe('testnet');
    });

    it('should default to testnet on error', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        error: { message: 'Failed' },
      } as any);

      const network = await getWalletNetwork();
      expect(network).toBe('testnet');
    });
  });

  describe('checkNetworkMatch', () => {
    it('should return true when networks match', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'TESTNET',
      } as any);

      const matches = await checkNetworkMatch('testnet');
      expect(matches).toBe(true);
    });

    it('should return false when networks mismatch', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'PUBLIC',
      } as any);

      const matches = await checkNetworkMatch('testnet');
      expect(matches).toBe(false);
    });
  });

  describe('connectFreighterWallet', () => {
    it('should throw NETWORK_MISMATCH error when networks mismatch', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true } as any);
      vi.mocked(freighterApi.getAddress).mockResolvedValue({
        address: 'GABC123...',
      } as any);
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'PUBLIC',
      } as any);

      await expect(connectFreighterWallet('testnet')).rejects.toThrow(FreighterError);
      await expect(connectFreighterWallet('testnet')).rejects.toThrow(/mainnet.*testnet/);
    });

    it('should succeed when networks match', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true } as any);
      vi.mocked(freighterApi.getAddress).mockResolvedValue({
        address: 'GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12',
      } as any);
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'TESTNET',
      } as any);

      const address = await connectFreighterWallet('testnet');
      expect(address).toBe('GABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC123ABC12');
    });
  });

  describe('signWithFreighter', () => {
    it('should check network before signing', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'PUBLIC',
      } as any);

      await expect(signWithFreighter('xdr123', 'testnet')).rejects.toThrow(FreighterError);
      await expect(signWithFreighter('xdr123', 'testnet')).rejects.toThrow(/mainnet.*testnet/);
    });

    it('should timeout after specified duration', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'TESTNET',
      } as any);

      vi.mocked(freighterApi.signTransaction).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );

      await expect(
        signWithFreighter('xdr123', 'testnet', { timeout: 100 })
      ).rejects.toThrow(FreighterError);
      
      await expect(
        signWithFreighter('xdr123', 'testnet', { timeout: 100 })
      ).rejects.toThrow(/timed out/i);
    }, 10000);

    it('should succeed when network matches and signing completes', async () => {
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: 'TESTNET',
      } as any);
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({
        signedTxXdr: 'signed_xdr_123',
      } as any);

      const signedXdr = await signWithFreighter('xdr123', 'testnet');
      expect(signedXdr).toBe('signed_xdr_123');
    });
  });
});
