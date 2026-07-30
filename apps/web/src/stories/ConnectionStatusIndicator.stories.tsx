import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionStatusIndicator } from '@/components/shared/ConnectionStatusIndicator';

const meta: Meta<typeof ConnectionStatusIndicator> = {
  title: 'Realtime/ConnectionStatusIndicator',
  component: ConnectionStatusIndicator,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Subtle pill that reflects the current real-time channel state: ' +
          '**connected** (pulsing green dot), **reconnecting** (spinning amber icon), ' +
          'or **disconnected** (static grey dot). Drop it next to any UI that ' +
          'depends on a live connection.',
      },
    },
  },
  argTypes: {
    status: {
      control: 'radio',
      options: ['connected', 'reconnecting', 'disconnected'],
    },
    showLabel: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof ConnectionStatusIndicator>;

export const Connected: Story = {
  args: { status: 'connected', showLabel: true },
};

export const Reconnecting: Story = {
  args: { status: 'reconnecting', showLabel: true },
};

export const Disconnected: Story = {
  args: { status: 'disconnected', showLabel: true },
};

/** Icon-only variant — suitable for tight toolbars. */
export const IconOnly: Story = {
  args: { status: 'connected', showLabel: false },
};

/** All three states side-by-side for a quick visual comparison. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      {(['connected', 'reconnecting', 'disconnected'] as const).map((status) => (
        <div key={status} className="flex items-center gap-4">
          <span className="w-28 text-sm text-gray-500 capitalize">{status}</span>
          <ConnectionStatusIndicator status={status} showLabel />
          <ConnectionStatusIndicator status={status} showLabel={false} />
        </div>
      ))}
    </div>
  ),
};
