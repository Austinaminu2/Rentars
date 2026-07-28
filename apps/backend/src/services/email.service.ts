/**
 * Email service — sends transactional emails via nodemailer (SMTP).
 * Configuration is read from the validated `env` object (see config/env.ts).
 * Falls back to a no-op console log when SMTP_HOST is not set.
 */
import nodemailer from 'nodemailer';
import { env } from '@/config/env.js';

// ─── Data shapes ──────────────────────────────────────────────────────────────

export type BookingEmailData = {
  to: string;
  userName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  checkInTime?: string;
  checkOutTime?: string;
  /** Signed per-recipient URL for preference management (optional). */
  preferencesUrl?: string;
};

export type PasswordResetEmailData = {
  to: string;
  token: string;
};

type VerificationEmailData = {
  to: string;
  token: string;
};

function createTransport() {
  if (!env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EmailService] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html });
}

// ─── Templates ────────────────────────────────────────────────────────────────

function bookingDetailsHtml(data: BookingEmailData): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:#F9FAFB;">
        <td style="padding:10px 16px;font-size:13px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E7EB;">
          BOOKING DETAILS
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Property</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${escapeHtml(data.propertyTitle)}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Check-in</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${escapeHtml(data.checkIn)}${data.checkInTime ? ` at ${escapeHtml(data.checkInTime)}` : ''}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Check-out</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${escapeHtml(data.checkOut)}${data.checkOutTime ? ` at ${escapeHtml(data.checkOutTime)}` : ''}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;">Total</td>
              <td style="font-size:16px;font-weight:700;color:#2563EB;text-align:right;">
                ${data.totalPrice.toLocaleString()} USDC
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const emailService = {
  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${data.token}`;
    await send(
      data.to,
      'Verify your Rentars email',
      `<p>Welcome to Rentars!</p>
       <p><a href="${verifyUrl}">Click here to verify your email address</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  },

  async sendBookingCreated(data: BookingEmailData): Promise<void> {
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;">
        Your booking for <strong>${escapeHtml(data.propertyTitle)}</strong> has been received
        and is pending confirmation from the host.
      </p>
      ${bookingDetailsHtml(data)}
      <p style="margin:16px 0 0;font-size:14px;color:#6B7280;">
        You'll receive another email once the host confirms your stay.
      </p>`;

    const { html, text } = renderEmail({
      title: 'Booking Received — Rentars',
      preheader: `Your booking at ${data.propertyTitle} is pending confirmation.`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.to, 'Booking Received — Rentars', html, text);
  },

  /**
   * Sent when the host confirms the booking (status → Confirmed).
   * Optional: preference link shown in footer.
   */
  async sendBookingConfirmed(data: BookingEmailData): Promise<void> {
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;">
        Great news — your booking for <strong>${escapeHtml(data.propertyTitle)}</strong>
        has been <strong style="color:#16A34A;">confirmed</strong> by the host!
      </p>
      ${bookingDetailsHtml(data)}
      <p style="margin:16px 0 0;font-size:14px;color:#6B7280;">
        Safe travels, and enjoy your stay.
      </p>`;

    const { html, text } = renderEmail({
      title: 'Booking Confirmed — Rentars',
      preheader: `Your stay at ${data.propertyTitle} is confirmed!`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.to, 'Booking Confirmed by Host — Rentars', html, text);
  },

  /**
   * Sent when a booking is cancelled by either party.
   * Optional: preference link shown in footer.
   */
  async sendBookingCancelled(data: BookingEmailData): Promise<void> {
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;">
        Your booking for <strong>${escapeHtml(data.propertyTitle)}</strong> has been cancelled.
      </p>
      ${bookingDetailsHtml(data)}
      <p style="margin:16px 0 0;font-size:14px;color:#6B7280;">
        If you did not request this cancellation or have questions, please
        <a href="${process.env.FRONTEND_URL ?? 'https://rentars.app'}/support"
           style="color:#2563EB;">contact support</a>.
      </p>`;

    const { html, text } = renderEmail({
      title: 'Booking Cancelled — Rentars',
      preheader: `Your booking at ${data.propertyTitle} has been cancelled.`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.to, 'Booking Cancelled — Rentars', html, text);
  },

  /**
   * Password reset — essential / security email, no preference link.
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${data.token}`;
    await send(
      data.to,
      'Reset your Rentars password',
      `<p>Someone requested a password reset for your Rentars account.</p>
       <p><a href="${resetUrl}">Click here to reset your password</a></p>
       <p>This link expires in 60 minutes. If you did not request a reset, you can ignore this email.</p>`,
    );
  },
};
