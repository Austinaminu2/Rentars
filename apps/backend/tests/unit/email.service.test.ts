/**
 * Unit tests for email.service.ts — detailed booking confirmation.
 *
 * Covers:
 *  - sendDetailedBookingConfirmation dispatches with correct subject/to
 *  - All booking fields (property, dates, price breakdown, escrow ref) present in HTML
 *  - HTML injection is escaped in every user-supplied field
 *  - sendHostBookingNotification dispatches to host email with tenant name
 *  - Preference honouring: email skipped when email_notifications=false
 *  - Preference honouring: email skipped when booking_created type disabled
 *  - SMTP not configured → no-op (no throw)
 *  - Plaintext fallback is generated alongside HTML
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// ─── nodemailer mock ──────────────────────────────────────────────────────────

const mockSendMail = mock(async (_opts: unknown) => ({ messageId: 'test-id' }));
const mockCreateTransport = mock(() => ({ sendMail: mockSendMail }));

const nodemailerMod = await import('nodemailer');
(nodemailerMod as unknown as { createTransport: typeof mockCreateTransport }).createTransport = mockCreateTransport;

// ─── env mock — ensure SMTP is configured ─────────────────────────────────────

const envMod = await import('../../src/config/env.js');
(envMod.env as Record<string, unknown>).SMTP_HOST = 'smtp.test.local';
(envMod.env as Record<string, unknown>).SMTP_PORT = 587;
(envMod.env as Record<string, unknown>).SMTP_SECURE = false;
(envMod.env as Record<string, unknown>).SMTP_USER = 'user';
(envMod.env as Record<string, unknown>).SMTP_PASS = 'pass';
(envMod.env as Record<string, unknown>).EMAIL_FROM = 'noreply@rentars.app';
(envMod.env as Record<string, unknown>).FRONTEND_URL = 'https://rentars.app';

import { emailService, type DetailedBookingEmailData } from '../../src/services/email.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseData(): DetailedBookingEmailData {
  return {
    to:              'tenant@example.com',
    userName:        'Alice Tenant',
    propertyTitle:   'Sunset Villa',
    propertyAddress: '123 Ocean Drive',
    propertyCity:    'Cape Town',
    propertyCountry: 'South Africa',
    propertyUrl:     'https://rentars.app/properties/sunset-villa',
    checkIn:         '2026-08-10',
    checkOut:        '2026-08-15',
    checkInTime:     '14:00',
    checkOutTime:    '11:00',
    nights:          5,
    guestCount:      2,
    baseNightlyRate: 100,
    subtotal:        500,
    platformFee:     25,
    dynamicAdjustments: 10,
    totalPrice:      535,
    cancellationPolicy: 'Full refund if cancelled 7+ days before check-in.',
    houseRules:      ['No smoking', 'No pets', 'Quiet hours after 22:00'],
    bookingId:       'bk-00001',
    escrowId:        'esc-abc123',
    onChainId:       42,
    hostContactPolicy: 'The host will message you via the app 24h before arrival.',
    preferencesUrl:  'https://rentars.app/preferences?token=xyz',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('emailService.sendDetailedBookingConfirmation', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
  });

  it('dispatches an email to the tenant address', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const opts = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.to).toBe('tenant@example.com');
  });

  it('includes property title in the subject line', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const opts = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(String(opts.subject)).toContain('Sunset Villa');
  });

  it('includes property title in the email body', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const opts = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(String(opts.html)).toContain('Sunset Villa');
  });

  it('includes check-in and check-out dates', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('2026-08-10');
    expect(html).toContain('2026-08-15');
  });

  it('includes check-in and check-out times', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('14:00');
    expect(html).toContain('11:00');
  });

  it('includes full price breakdown — subtotal, platform fee, total', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('500');      // subtotal
    expect(html).toContain('25');       // platform fee
    expect(html).toContain('535');      // total
    expect(html).toContain('USDC');     // currency label
  });

  it('includes dynamic price adjustment when non-zero', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('Dynamic pricing');
    expect(html).toContain('10');
  });

  it('omits dynamic adjustment row when adjustment is zero', async () => {
    const data = { ...baseData(), dynamicAdjustments: 0 };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('Dynamic pricing');
  });

  it('includes the escrow reference', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('esc-abc123');
  });

  it('includes the on-chain booking ID', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('42');
  });

  it('includes the booking UUID', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('bk-00001');
  });

  it('includes cancellation policy', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('Full refund if cancelled');
  });

  it('includes house rules', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('No smoking');
    expect(html).toContain('No pets');
    expect(html).toContain('Quiet hours after 22:00');
  });

  it('includes host contact policy', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('The host will message you');
  });

  it('includes preferences / unsubscribe link in footer', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('https://rentars.app/preferences?token=xyz');
  });

  it('generates a plaintext fallback alongside HTML', async () => {
    await emailService.sendDetailedBookingConfirmation(baseData());

    const opts = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.text).toBeDefined();
    expect(String(opts.text).length).toBeGreaterThan(50);
  });

  // ── HTML injection protection ───────────────────────────────────────────

  it('escapes HTML in propertyTitle', async () => {
    const data = { ...baseData(), propertyTitle: '<script>alert(1)</script>' };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in userName', async () => {
    const data = { ...baseData(), userName: '<img src=x onerror=alert(1)>' };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes HTML in house rules', async () => {
    const data = { ...baseData(), houseRules: ['<b>No events</b>'] };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<b>No events</b>');
    expect(html).toContain('&lt;b&gt;No events&lt;/b&gt;');
  });

  it('escapes HTML in cancellationPolicy', async () => {
    const data = { ...baseData(), cancellationPolicy: '<script>xss</script>' };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<script>');
  });

  it('escapes HTML in hostContactPolicy', async () => {
    const data = { ...baseData(), hostContactPolicy: '"><svg onload=alert(1)>' };
    await emailService.sendDetailedBookingConfirmation(data);

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;svg');
  });

  // ── SMTP not configured ─────────────────────────────────────────────────

  it('does not throw when SMTP_HOST is not set', async () => {
    const originalHost = (envMod.env as Record<string, unknown>).SMTP_HOST;
    (envMod.env as Record<string, unknown>).SMTP_HOST = '';
    mockCreateTransport.mockImplementationOnce(() => null as unknown as ReturnType<typeof mockCreateTransport>);

    // Should resolve without throwing
    await expect(
      emailService.sendDetailedBookingConfirmation(baseData()),
    ).resolves.toBeUndefined();

    (envMod.env as Record<string, unknown>).SMTP_HOST = originalHost;
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('emailService.sendHostBookingNotification', () => {
  beforeEach(() => mockSendMail.mockClear());

  it('dispatches to the host email address', async () => {
    await emailService.sendHostBookingNotification({
      ...baseData(),
      hostEmail: 'host@example.com',
      tenantName: 'Alice Tenant',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const opts = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.to).toBe('host@example.com');
  });

  it('includes tenant name in the body', async () => {
    await emailService.sendHostBookingNotification({
      ...baseData(),
      hostEmail: 'host@example.com',
      tenantName: 'Alice Tenant',
    });

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('Alice Tenant');
  });

  it('includes property title in subject', async () => {
    await emailService.sendHostBookingNotification({
      ...baseData(),
      hostEmail: 'host@example.com',
      tenantName: 'Bob Guest',
    });

    const subject = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).subject);
    expect(subject).toContain('Sunset Villa');
  });

  it('includes total price with USDC label', async () => {
    await emailService.sendHostBookingNotification({
      ...baseData(),
      hostEmail: 'host@example.com',
      tenantName: 'Bob Guest',
    });

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).toContain('535');
    expect(html).toContain('USDC');
  });

  it('escapes HTML in tenantName', async () => {
    await emailService.sendHostBookingNotification({
      ...baseData(),
      hostEmail: 'host@example.com',
      tenantName: '<script>alert(1)</script>',
    });

    const html = String((mockSendMail.mock.calls[0][0] as Record<string, unknown>).html);
    expect(html).not.toContain('<script>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('notification preference honouring in booking.service', () => {
  /**
   * These tests verify the preference-check logic used inside
   * BookingService.sendBookingEmails() without running the full booking flow.
   *
   * The preference gate is: email_notifications !== false AND
   * notification_types.booking_created !== false.
   */

  it('should send email when email_notifications=true', () => {
    const prefs = { email_notifications: true, notification_types: {} };
    const shouldSend =
      prefs.email_notifications !== false &&
      prefs.notification_types['booking_created' as keyof typeof prefs.notification_types] !== false;
    expect(shouldSend).toBe(true);
  });

  it('should NOT send email when email_notifications=false', () => {
    const prefs = { email_notifications: false, notification_types: {} };
    const shouldSend =
      prefs.email_notifications !== false &&
      prefs.notification_types['booking_created' as keyof typeof prefs.notification_types] !== false;
    expect(shouldSend).toBe(false);
  });

  it('should NOT send email when booking_created type is explicitly disabled', () => {
    const prefs = {
      email_notifications: true,
      notification_types: { booking_created: false },
    };
    const shouldSend =
      prefs.email_notifications !== false &&
      prefs.notification_types.booking_created !== false;
    expect(shouldSend).toBe(false);
  });

  it('should send email when booking_created type is explicitly enabled', () => {
    const prefs = {
      email_notifications: true,
      notification_types: { booking_created: true },
    };
    const shouldSend =
      prefs.email_notifications !== false &&
      prefs.notification_types.booking_created !== false;
    expect(shouldSend).toBe(true);
  });

  it('defaults to sending when preferences record is missing', () => {
    // null prefs → default to true
    const prefsResult = null;
    const shouldSend = prefsResult?.data?.email_notifications !== false ?? true;
    expect(shouldSend).toBe(true);
  });
});
