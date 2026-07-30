import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within, waitFor } from '@storybook/test';
import { useState, useCallback } from 'react';
import { ConnectionStatusIndicator } from '@/components/shared/ConnectionStatusIndicator';
import type { ConnectionStatus, RealtimeOptions } from '@/hooks/useRealTimeUpdates';

// ── Controlled demo component ─────────────────────────────────────────────────
//
// Stories for a custom hook are best shown through a thin wrapper component
// that makes the hook's state visible and lets Storybook interactions drive it.
// We avoid actually connecting to Supabase by accepting the connection status
// and notification callbacks as props — identical to how a page component would
// use the real hook.

interface DemoProps extends RealtimeOptions {
  /** Pre-set connection status for static/decorator-driven stories. */
  initialStatus?: ConnectionStatus;
}

function RealTimeDemoUI({ initialStatus = 'disconnected', onMissedNotifications }: DemoProps) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 20));

  // Expose simulate buttons so interaction tests (and manual exploration) can
  // drive state transitions without a real Supabase connection.
  const simulateConnect = () => {
    setStatus('connected');
    addLog('Channel SUBSCRIBED — connected.');
  };

  const simulateDisconnect = () => {
    setStatus('reconnecting');
    addLog('Channel CHANNEL_ERROR — reconnecting…');
  };

  const simulateMissedMessages = useCallback(() => {
    const missed = [
      { id: 'missed-1', type: 'booking_created', created_at: new Date().toISOString() },
      { id: 'missed-2', type: 'payment_received', created_at: new Date().toISOString() },
    ];
    onMissedNotifications?.(missed);
    addLog(`Catch-up fetched ${missed.length} missed notification(s).`);
  }, [onMissedNotifications]);

  const simulateReconnect = () => {
    setStatus('connected');
    addLog('Reconnected after backoff.');
    simulateMissedMessages();
  };

  return (
    <div className="p-6 max-w-md space-y-4 font-sans">
      {/* Status pill */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Real-time status:
        </span>
        <ConnectionStatusIndicator status={status} showLabel />
      </div>

      {/* Simulation controls */}
      <div className="flex flex-wrap gap-2">
        <button
          data-testid="btn-connect"
          onClick={simulateConnect}
          className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Simulate connect
        </button>
        <button
          data-testid="btn-disconnect"
          onClick={simulateDisconnect}
          className="px-3 py-1.5 text-xs rounded-md bg-amber-500 text-white hover:bg-amber-600"
        >
          Simulate disconnect
        </button>
        <button
          data-testid="btn-reconnect"
          onClick={simulateReconnect}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Simulate reconnect + catch-up
        </button>
      </div>

      {/* Event log */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 h-40 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
          Event log
        </p>
        {log.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No events yet — use the buttons above.</p>
        ) : (
          log.map((entry, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {entry}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof RealTimeDemoUI> = {
  title: 'Realtime/RealTimeUpdates',
  component: RealTimeDemoUI,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Interactive demo for the `useRealTimeUpdates` hook. ' +
          'Use the simulation buttons to walk through **disconnect → reconnecting → reconnect** ' +
          'and observe the connection-status indicator and the catch-up log.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof RealTimeDemoUI>;

// ── Static state stories ──────────────────────────────────────────────────────

export const InitiallyConnected: Story = {
  args: { initialStatus: 'connected' },
};

export const InitiallyReconnecting: Story = {
  args: { initialStatus: 'reconnecting' },
};

export const InitiallyDisconnected: Story = {
  args: { initialStatus: 'disconnected' },
};

// ── Interaction stories ───────────────────────────────────────────────────────

/**
 * Walks through: idle → connect → disconnect → reconnect + catch-up.
 * The `play` function drives the interaction so it can be run in CI via
 * `@storybook/test-runner`.
 */
export const DisconnectReconnectCatchUp: Story = {
  args: {
    initialStatus: 'disconnected',
    onMissedNotifications: (items) => {
      console.log('[story] missed notifications:', items);
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 1. Start disconnected
    await expect(canvas.getByText('Offline')).toBeInTheDocument();

    // 2. Simulate connect
    await userEvent.click(canvas.getByTestId('btn-connect'));
    await waitFor(() => expect(canvas.getByText('Live')).toBeInTheDocument());

    // 3. Simulate disconnect
    await userEvent.click(canvas.getByTestId('btn-disconnect'));
    await waitFor(() => expect(canvas.getByText('Reconnecting…')).toBeInTheDocument());

    // 4. Simulate reconnect + catch-up
    await userEvent.click(canvas.getByTestId('btn-reconnect'));
    await waitFor(() => expect(canvas.getByText('Live')).toBeInTheDocument());

    // Catch-up log entry should appear
    await waitFor(() =>
      expect(canvas.getByText(/Catch-up fetched 2 missed/i)).toBeInTheDocument(),
    );
  },
};

/**
 * Verifies the indicator correctly cycles between all three states.
 */
export const StatusCycle: Story = {
  args: { initialStatus: 'disconnected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('btn-connect'));
    await waitFor(() => expect(canvas.getByText('Live')).toBeInTheDocument());

    await userEvent.click(canvas.getByTestId('btn-disconnect'));
    await waitFor(() => expect(canvas.getByText('Reconnecting…')).toBeInTheDocument());

    await userEvent.click(canvas.getByTestId('btn-connect'));
    await waitFor(() => expect(canvas.getByText('Live')).toBeInTheDocument());
  },
};
