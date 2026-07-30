import { useState, useCallback, useEffect } from 'react';
import {
  connectFreighterWallet,
  getWalletStatus,
  isValidStellarAddress,
  FreighterError,
  WalletState,
  checkNetworkMatch,
} from '@/lib/freighter-utils';
import { getExpectedNetwork } from '@/lib/network-utils';

export interface UseWalletReturn {
  state: WalletState & { isLoading: boolean };
  connect: () => Promise<void>;
  disconnect: () => void;
  checkStatus: () => Promise<void>;
}

const WALLET_STORAGE_KEY = 'freighter_wallet_connected';
const WALLET_ADDRESS_KEY = 'freighter_wallet_address';

/**
 * Hook for managing Freighter wallet connection and status
 */
export function useWallet(): UseWalletReturn {
  const expectedNetwork = getExpectedNetwork();
  
  const [state, setState] = useState<WalletState & { isLoading: boolean }>({
    isConnected: false,
    address: null,
    network: expectedNetwork,
    networkMismatch: false,
    isLoading: true,
    error: null,
  });

  // Check for existing connection on mount and attempt auto-reconnect
  useEffect(() => {
    const attemptReconnect = async () => {
      const wasConnected = localStorage.getItem(WALLET_STORAGE_KEY) === 'true';
      const savedAddress = localStorage.getItem(WALLET_ADDRESS_KEY);
      
      if (wasConnected && savedAddress) {
        // Try silent reconnect
        try {
          await checkStatus();
        } catch (error) {
          // If reconnect fails, clear the connection state
          localStorage.removeItem(WALLET_STORAGE_KEY);
          localStorage.removeItem(WALLET_ADDRESS_KEY);
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    attemptReconnect();

    // Listen for network changes (Freighter fires storage events)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'freighter-network') {
        checkStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const checkStatus = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const status = await getWalletStatus(expectedNetwork);
    setState({
      ...status,
      isLoading: false,
    });
  }, [expectedNetwork]);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const address = await connectFreighterWallet(expectedNetwork);
      
      // Persist connection state
      localStorage.setItem(WALLET_STORAGE_KEY, 'true');
      localStorage.setItem(WALLET_ADDRESS_KEY, address);

      setState({
        isConnected: true,
        address,
        network: expectedNetwork,
        networkMismatch: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      let errorMessage = 'Failed to connect wallet';

      if (error instanceof FreighterError) {
        switch (error.code) {
          case 'NOT_INSTALLED':
            errorMessage =
              'Freighter wallet is not installed. Please install it from https://www.freighter.app';
            break;
          case 'NOT_CONNECTED':
            errorMessage =
              'Wallet is not connected in Freighter. Please open Freighter and connect your account.';
            break;
          case 'USER_REJECTED':
            errorMessage = 'You rejected the connection request. Please try again.';
            break;
          case 'NETWORK_MISMATCH':
            errorMessage = error.message;
            break;
          default:
            errorMessage = error.message;
        }
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      throw error;
    }
  }, [expectedNetwork]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.removeItem(WALLET_ADDRESS_KEY);
    setState({
      isConnected: false,
      address: null,
      network: expectedNetwork,
      networkMismatch: false,
      isLoading: false,
      error: null,
    });
  }, [expectedNetwork]);

  return {
    state,
    connect,
    disconnect,
    checkStatus,
  };
}
