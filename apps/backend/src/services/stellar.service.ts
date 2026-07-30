/**
 * Stellar service — wraps Stellar Horizon interactions for payment transactions.
 *
 * Responsibilities:
 * - Submit signed XDR transactions to Stellar testnet/mainnet
 * - Poll Horizon for confirmation with timeout
 * - Retry logic with double-spend protection (check existing tx hash first)
 *
 * All blockchain calls are isolated here. Controllers/routes never call
 * Horizon directly.
 *
 * OAuth/passkey design note:
 * When OAuth or passkey support is added, authentication still produces a JWT
 * with { userId, role }. This service only operates on signed XDR from the
 * wallet layer and is fully independent of the auth mechanism.
 */

import { Horizon, Transaction } from '@stellar/stellar-sdk';
import { updatePaymentStatus, getPaymentStatus } from './payment.service.js';

const CONFIRMATION_TIMEOUT_MS = 60_000; // 60 seconds max wait
const POLL_INTERVAL_MS = 3_000;         // poll every 3 seconds

function getHorizonServer(): Horizon.Server {
  const network = process.env.STELLAR_NETWORK ?? 'testnet';
  const url =
    network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
  return new Horizon.Server(url);
}

export interface SubmitResult {
  txHash: string;
}

/**
 * Submit a signed transaction XDR to Stellar Horizon.
 * Returns the transaction hash on success. Throws on failure.
 */
export async function submitTransaction(signedXdr: string): Promise<SubmitResult> {
  const server = getHorizonServer();
  const passphrase =
    (process.env.STELLAR_NETWORK ?? 'testnet') === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';

  const tx = new Transaction(signedXdr, passphrase);
  const response = await server.submitTransaction(tx);
  return { txHash: response.hash };
}

/**
 * Poll Horizon until the transaction is confirmed or the 60s timeout is reached.
 * Updates the payment record in the database with the final status.
 *
 * @returns 'confirmed' | 'timed_out'
 */
export async function confirmTransaction(
  paymentId: string,
  txHash: string,
): Promise<'confirmed' | 'timed_out'> {
  const server = getHorizonServer();
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const tx = await server.transactions().transaction(txHash).call();
      if (tx.successful) {
        await updatePaymentStatus(paymentId, txHash, 'confirmed');
        return 'confirmed';
      }
      // On-chain but unsuccessful
      await updatePaymentStatus(paymentId, txHash, 'failed');
      return 'timed_out';
    } catch (err: unknown) {
      const isNotFound =
        err instanceof Error &&
        (err.message.includes('404') || err.message.includes('not found'));
      if (!isNotFound) {
        await updatePaymentStatus(paymentId, txHash, 'failed');
        throw err;
      }
      // 404 = not yet on ledger, keep polling
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  await updatePaymentStatus(paymentId, txHash, 'timed_out');
  return 'timed_out';
}

/**
 * Retry a failed or timed-out payment.
 * Double-spend protection: if a txHash already exists, re-polls it instead
 * of submitting a new transaction.
 */
export async function retryTransaction(
  paymentId: string,
  signedXdr?: string,
): Promise<{ txHash: string; status: 'confirmed' | 'timed_out' }> {
  const payment = await getPaymentStatus(paymentId);
  if (!payment) throw new Error('Payment not found');

  if (!['failed', 'timed_out'].includes(payment.status)) {
    throw new Error(`Cannot retry payment in status: ${payment.status}`);
  }

  let txHash: string;

  if (payment.stellar_tx_hash) {
    // Already submitted — re-poll to avoid double-spend
    txHash = payment.stellar_tx_hash;
  } else {
    if (!signedXdr) throw new Error('signedXdr required for payments that were never submitted');
    const result = await submitTransaction(signedXdr);
    txHash = result.txHash;
    await updatePaymentStatus(paymentId, txHash, 'submitted');
  }

  const status = await confirmTransaction(paymentId, txHash);
  return { txHash, status };
}
