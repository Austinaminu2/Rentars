'use client';

import { useCallback, useState } from 'react';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getNetworkPassphrase, STELLAR_NETWORKS, getExplorerUrl } from '@/lib/network-utils';
import { signWithFreighter, FreighterError } from '@/lib/freighter-utils';
import {
  buildEscrowFundingTransaction,
  buildEscrowReleaseTransaction,
} from '@/lib/stellar-transactions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DEFAULT_SIGNING_TIMEOUT = 60000; // 60 seconds

export type EscrowTxType = 'fund' | 'release';
export type EscrowTxStatus = 'idle' | 'waiting_signature' | 'submitting' | 'success' | 'error' | 'timeout';

export interface EscrowTransactionResult {
  txHash: string;
  explorerUrl: string;
}

async function submitXdrToHorizon(xdr: string, network: 'testnet' | 'mainnet') {
  const passphrase = getNetworkPassphrase(network);
  const tx = StellarSdk.Transaction.fromXDR(xdr, passphrase);
  const client = new StellarSdk.Horizon.Server(
    network === 'mainnet'
      ? STELLAR_NETWORKS.mainnet.horizonUrl
      : STELLAR_NETWORKS.testnet.horizonUrl,
  );

  const result = await client.submitTransaction(tx);
  return result.hash;
}

export function useEscrowTransaction(network: 'testnet' | 'mainnet' = 'testnet') {
  const [status, setStatus] = useState<EscrowTxStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const submit = useCallback(
    async (params: {
      type: EscrowTxType;
      escrowId: string;
      amount?: string | number;
      tenantPublicKey?: string;
      ownerPublicKey?: string;
      signingTimeout?: number;
    }): Promise<EscrowTransactionResult> => {
      const {
        type,
        escrowId,
        amount,
        tenantPublicKey,
        ownerPublicKey,
        signingTimeout = DEFAULT_SIGNING_TIMEOUT,
      } = params;

      setStatus('idle');
      setError(null);
      setCanRetry(false);

      try {
        const { xdr } =
          type === 'fund'
            ? buildEscrowFundingTransaction(
                escrowId,
                amount ?? '0',
                tenantPublicKey ?? '',
                network,
              )
            : buildEscrowReleaseTransaction(
                escrowId,
                ownerPublicKey ?? '',
                network,
              );

        // Sign via Freighter with timeout
        setStatus('waiting_signature');
        const signedXdr = await signWithFreighter(xdr, network, { timeout: signingTimeout });

        // Submit to Stellar network
        setStatus('submitting');
        const txHash = await submitXdrToHorizon(signedXdr, network);

        // Notify backend
        if (type === 'fund') {
          await fetch(`${API_URL}/api/v1/bookings/escrow/${escrowId}/fund`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: String(amount ?? '0'),
              txHash,
            }),
          });
        } else {
          await fetch(`${API_URL}/api/v1/bookings/escrow/${escrowId}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reason: 'Release signed by owner',
              txHash,
            }),
          });
        }

        setStatus('success');
        return {
          txHash,
          explorerUrl: getExplorerUrl(txHash, network),
        };
      } catch (err) {
        const isFreighterError = err instanceof FreighterError;
        
        if (isFreighterError && err.code === 'TIMEOUT') {
          setStatus('timeout');
          setError('Signing request timed out. Please check your wallet and try again.');
          setCanRetry(true);
        } else if (isFreighterError && err.code === 'USER_REJECTED') {
          setStatus('error');
          setError('Transaction was rejected. You can try again when ready.');
          setCanRetry(true);
        } else if (isFreighterError && err.code === 'NETWORK_MISMATCH') {
          setStatus('error');
          setError(err.message);
          setCanRetry(false);
        } else {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to submit transaction');
          setCanRetry(true);
        }

        throw err;
      }
    },
    [network],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setCanRetry(false);
  }, []);

  return { 
    submit, 
    status, 
    error, 
    canRetry,
    reset,
    isSubmitting: status === 'waiting_signature' || status === 'submitting',
  };
}

