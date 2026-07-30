import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWallet } from '../useWallet';
import * as freighterUtils from '@/lib/freighter-utils';

vi.mock('@/lib/freighter-utils');
vi.mock('@/lib/network-utils', () => ({
  getExpectedNetwork: () => 'testnet',
}));

describe('useWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('auto-reconnect', () => {
    it('should attempt reconnect on mount if previously connected', async () => {
      localStorage.setItem('freighter_wallet_connected', 'true');
      localStorage.setItem('freighter_wallet_address', 'GABC123...');

      vi.mocked(freighterUtils.getWalletStatus).mockResolvedValue({
        isConnected: true,
        address: 'GABC123...',
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: null,
      });

      const { result } = renderHook(() => useWallet());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.isConnected).toBe(true);
      expect(result.current.state.address).toBe('GABC123...');
    });

    it('should clear persisted state if reconnect fails', async () => {
      localStorage.setItem('freighter_wallet_connected', 'true');
      localStorage.setItem('freighter_wallet_address', 'GABC123...');

      vi.mocked(freighterUtils.getWalletStatus).mockResolvedValue({
        isConnected: false,
        address: null,
        network: 'testnet',
        networkMismatch: false,
        isLoading: false,
        error: 'Wallet locked',
      });

      const { result } = renderHook(() => useWallet());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(localStorage.getItem('freighter_wallet_connected')).toBeNull();
      expect(localStorage.getItem('freighter_wallet_address')).toBeNull();
    });
  });

  describe('network mismatch detection', () => {
    it('should detect network mismatch on connect', async () => {
      vi.mocked(freighterUtils.connectFreighterWallet).mockRejectedValue(
        new freighterUtils.FreighterError(
          'Wallet is on mainnet but app expects testnet',
          'NETWORK_MISMATCH'
        )
      );

      const { result } = renderHook(() => useWallet());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await expect(result.current.connect()).rejects.toThrow();

      expect(result.current.state.error).toContain('mainnet');
      expect(result.current.state.error).toContain('testnet');
    });

    it('should show network mismatch in status', async () => {
      vi.mocked(freighterUtils.getWalletStatus).mockResolvedValue({
        isConnected: true,
        address: 'GABC123...',
        network: 'mainnet',
        networkMismatch: true,
        isLoading: false,
        error: 'Wallet is on mainnet but app expects testnet',
      });

      const { result } = renderHook(() => useWallet());

      await result.current.checkStatus();

      await waitFor(() => {
        expect(result.current.state.networkMismatch).toBe(true);
      });

      expect(result.current.state.error).toBeTruthy();
    });
  });

  describe('disconnect', () => {
    it('should clear persisted state on disconnect', async () => {
      localStorage.setItem('freighter_wallet_connected', 'true');
      localStorage.setItem('freighter_wallet_address', 'GABC123...');

      const { result } = renderHook(() => useWallet());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      result.current.disconnect();

      expect(localStorage.getItem('freighter_wallet_connected')).toBeNull();
      expect(localStorage.getItem('freighter_wallet_address')).toBeNull();
      expect(result.current.state.isConnected).toBe(false);
      expect(result.current.state.address).toBeNull();
    });
  });
});
