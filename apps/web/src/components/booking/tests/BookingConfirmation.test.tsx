import { render, screen } from '@testing-library/react';
import BookingConfirmation from '../BookingConfirmation';

describe('BookingConfirmation', () => {
  const defaultProps = {
    bookingId: 'booking-123',
    propertyTitle: 'Beautiful Beach House',
    checkIn: '2024-01-01',
    checkOut: '2024-01-03',
    totalPrice: 200,
  };

  it('renders booking confirmation message', () => {
    render(<BookingConfirmation {...defaultProps} />);
    
    expect(screen.getByText(/booking confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/your booking has been created and is pending confirmation/i)).toBeInTheDocument();
  });

  it('displays booking details correctly', () => {
    render(<BookingConfirmation {...defaultProps} />);
    
    expect(screen.getByText('booking-123')).toBeInTheDocument();
    expect(screen.getByText('Beautiful Beach House')).toBeInTheDocument();
    expect(screen.getByText('1/1/2024')).toBeInTheDocument();
    expect(screen.getByText('1/3/2024')).toBeInTheDocument();
    expect(screen.getByText('200 USDC')).toBeInTheDocument();
  });

  it('renders view bookings link', () => {
    render(<BookingConfirmation {...defaultProps} />);
    
    const link = screen.getByRole('link', { name: /view my bookings/i });
    expect(link).toHaveAttribute('href', '/dashboard/tenant-dashboard');
  });

  it('displays success icon', () => {
    render(<BookingConfirmation {...defaultProps} />);
    
    // Check for the CheckCircle icon by looking for its container
    const successIcon = screen.getByText(/booking confirmed/i).parentElement?.querySelector('svg');
    expect(successIcon).toBeInTheDocument();
  });

  it('formats dates correctly', () => {
    const props = {
      ...defaultProps,
      checkIn: '2024-12-25',
      checkOut: '2024-12-31',
    };

    render(<BookingConfirmation {...props} />);

    expect(screen.getByText('12/25/2024')).toBeInTheDocument();
    expect(screen.getByText('12/31/2024')).toBeInTheDocument();
  });

  it('displays check-in and check-out times when provided', () => {
    render(
      <BookingConfirmation
        {...defaultProps}
        checkInTime="15:00"
        checkOutTime="11:00"
      />,
    );

    expect(screen.getByText(/at 15:00/)).toBeInTheDocument();
    expect(screen.getByText(/at 11:00/)).toBeInTheDocument();
  });

  it('omits time suffix when checkInTime/checkOutTime are not provided', () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.queryByText(/at \d{2}:\d{2}/)).not.toBeInTheDocument();
  });
});
