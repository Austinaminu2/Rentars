'use client';

import { CheckCircle } from 'lucide-react';

interface BookingConfirmationProps {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  checkInTime?: string;
  checkOutTime?: string;
}

export default function BookingConfirmation({
  bookingId,
  propertyTitle,
  checkIn,
  checkOut,
  totalPrice,
  checkInTime,
  checkOutTime,
}: BookingConfirmationProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-8 text-center space-y-4">
      <CheckCircle className="mx-auto text-green-600" size={48} />
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Booking Confirmed!</h2>
      <p className="text-gray-600 dark:text-gray-400">Your booking has been created and is pending confirmation.</p>

      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-left space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Booking ID:</span>
          <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{bookingId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Property:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{propertyTitle}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Check-in:</span>
          <span className="text-gray-900 dark:text-gray-100">
            {new Date(checkIn).toLocaleDateString()}{checkInTime ? ` at ${checkInTime}` : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Check-out:</span>
          <span className="text-gray-900 dark:text-gray-100">
            {new Date(checkOut).toLocaleDateString()}{checkOutTime ? ` at ${checkOutTime}` : ''}
          </span>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-semibold">
          <span className="text-gray-900 dark:text-gray-100">Total:</span>
          <span className="text-blue-600 dark:text-blue-400">{totalPrice} USDC</span>
        </div>
      </div>

      <a
        href="/dashboard/tenant-dashboard"
        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
      >
        View My Bookings
      </a>
    </div>
  );
}
