import { render, screen, fireEvent } from '@testing-library/react';
import BookingHistory from '@/components/dashboard/BookingHistory';
import { vi } from 'vitest';

const emptyBooking = {
  id: '1',
  propertyTitle: 'Beach House',
  location: 'Miami, FL',
  checkIn: new Date('2026-08-01'),
  checkOut: new Date('2026-08-05'),
  totalPrice: 400,
  status: 'confirmed' as const,
  escrowStatus: 'locked' as const,
};

const defaultProps = {
  bookings: [emptyBooking],
  statusFilter: null as null,
  sort: 'created' as const,
  order: 'desc' as const,
  onStatusChange: vi.fn(),
  onSortChange: vi.fn(),
  onOrderChange: vi.fn(),
};

describe('BookingHistory — filter/sort controls', () => {
  it('renders filter chips for all status options', () => {
    render(<BookingHistory {...defaultProps} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upcoming/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelled/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disputed/i })).toBeInTheDocument();
  });

  it('calls onStatusChange with the correct value when a filter chip is clicked', () => {
    const onStatusChange = vi.fn();
    render(<BookingHistory {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: /completed/i }));
    expect(onStatusChange).toHaveBeenCalledWith('completed');
  });

  it('calls onStatusChange with null when All chip is clicked', () => {
    const onStatusChange = vi.fn();
    render(<BookingHistory {...defaultProps} statusFilter="confirmed" onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it('calls onSortChange when sort select changes', () => {
    const onSortChange = vi.fn();
    render(<BookingHistory {...defaultProps} onSortChange={onSortChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'price' } });
    expect(onSortChange).toHaveBeenCalledWith('price');
  });

  it('calls onOrderChange when the order toggle button is clicked', () => {
    const onOrderChange = vi.fn();
    render(<BookingHistory {...defaultProps} onOrderChange={onOrderChange} />);
    fireEvent.click(screen.getByRole('button', { name: /asc|desc/i }));
    expect(onOrderChange).toHaveBeenCalledWith('asc');
  });

  it('shows filter-aware empty state when statusFilter is active and bookings are empty', () => {
    render(<BookingHistory {...defaultProps} bookings={[]} statusFilter="cancelled" />);
    expect(screen.getByText(/No cancelled bookings found/i)).toBeInTheDocument();
  });

  it('shows generic empty state when no filter is active', () => {
    render(<BookingHistory {...defaultProps} bookings={[]} statusFilter={null} />);
    expect(screen.getByText(/No bookings yet/i)).toBeInTheDocument();
  });
});
