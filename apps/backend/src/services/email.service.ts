/**
 * Email service — sends transactional emails via nodemailer (SMTP).
 * Configuration is read from the validated `env` object (see config/env.ts).
 * Falls back to a no-op console log when SMTP_HOST is not set.
 *
 * All templates use the shared renderEmail() layout for consistent branding.
 * Dynamic content inserted into HTML is always passed through escapeHtml()
 * to prevent HTML injection.
 */
import nodemailer from 'nodemailer';
import { env } from '@/config/env.js';
import { renderEmail, escapeHtml } from './emailLayout.js';

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

/**
 * Rich booking confirmation email data — used for the detailed confirmation
 * sent to tenant and the host-notification email on booking creation.
 */
export interface DetailedBookingEmailData {
  /** Recipient email address. */
  to: string;
  /** Recipient display name. */
  userName: string;

  // ── Property ─────────────────────────────────────────────────────────────
  propertyTitle: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyCountry?: string;
  /** Deep-link to the property listing. */
  propertyUrl?: string;

  // ── Stay details ──────────────────────────────────────────────────────────
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  nights: number;
  guestCount: number;

  // ── Price breakdown ───────────────────────────────────────────────────────
  baseNightlyRate: number;
  subtotal: number;
  platformFee: number;
  dynamicAdjustments?: number;
  totalPrice: number;

  // ── Policies ──────────────────────────────────────────────────────────────
  cancellationPolicy?: string;
  houseRules?: string[];

  // ── Escrow / blockchain reference ────────────────────────────────────────
  bookingId: string;
  escrowId?: string;
  onChainId?: number;

  // ── Host contact ──────────────────────────────────────────────────────────
  /** Public host contact note — what the host has shared about contact policy. */
  hostContactPolicy?: string;

  /** Signed per-recipient preference management URL. */
  preferencesUrl?: string;
}

export type PasswordResetEmailData = {
  to: string;
  token: string;
};

type VerificationEmailData = {
  to: string;
  token: string;
};

// ─── Transport ────────────────────────────────────────────────────────────────

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

async function send(to: string, subject: string, html: string, text?: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EmailService] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
}

// ─── Shared template fragments ────────────────────────────────────────────────

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
                ${data.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Renders the full price breakdown table for detailed confirmation emails.
 * All values are USDC-denominated.
 */
function priceBreakdownHtml(data: DetailedBookingEmailData): string {
  const rowStyle = 'font-size:14px;padding:6px 0;border-bottom:1px solid #F3F4F6;';
  const labelStyle = `${rowStyle}color:#6B7280;`;
  const valueStyle = `${rowStyle}font-weight:600;color:#111827;text-align:right;`;

  const adjustmentRow =
    data.dynamicAdjustments && data.dynamicAdjustments !== 0
      ? `<tr>
           <td style="${labelStyle}">Dynamic pricing</td>
           <td style="${valueStyle}">${data.dynamicAdjustments > 0 ? '+' : ''}${data.dynamicAdjustments.toFixed(2)} USDC</td>
         </tr>`
      : '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:#F9FAFB;">
        <td colspan="2" style="padding:10px 16px;font-size:13px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E7EB;">
          PRICE BREAKDOWN (charged in USDC)
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:12px 16px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="${labelStyle}">
                ${escapeHtml(String(data.baseNightlyRate))} USDC &times; ${escapeHtml(String(data.nights))} night${data.nights !== 1 ? 's' : ''}
              </td>
              <td style="${valueStyle}">${data.subtotal.toFixed(2)} USDC</td>
            </tr>
            ${adjustmentRow}
            <tr>
              <td style="${labelStyle}">Platform fee</td>
              <td style="${valueStyle}">${data.platformFee.toFixed(2)} USDC</td>
            </tr>
            <tr>
              <td style="font-size:15px;font-weight:700;color:#111827;padding-top:8px;">Total</td>
              <td style="font-size:16px;font-weight:700;color:#2563EB;text-align:right;padding-top:8px;">
                ${data.totalPrice.toFixed(2)} USDC
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr style="background-color:#EFF6FF;">
        <td colspan="2" style="padding:8px 16px;font-size:12px;color:#3B82F6;font-style:italic;">
          Charges are denominated in USDC on the Stellar network.
          Local-currency figures shown in the app are estimates only and non-binding.
        </td>
      </tr>
    </table>`;
}

/**
 * Renders a stay info table (property, location, dates, guests).
 */
function stayInfoHtml(data: DetailedBookingEmailData): string {
  const location = [data.propertyAddress, data.propertyCity, data.propertyCountry]
    .filter(Boolean)
    .map(escapeHtml)
    .join(', ');

  const propertyLink = data.propertyUrl
    ? `<a href="${escapeHtml(data.propertyUrl)}" style="color:#2563EB;">${escapeHtml(data.propertyTitle)}</a>`
    : escapeHtml(data.propertyTitle);

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:#F9FAFB;">
        <td colspan="2" style="padding:10px 16px;font-size:13px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E7EB;">
          YOUR STAY
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:12px 16px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;width:40%;">Property</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${propertyLink}
              </td>
            </tr>
            ${location ? `<tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Location</td>
              <td style="font-size:14px;color:#374151;padding-bottom:8px;text-align:right;">${location}</td>
            </tr>` : ''}
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Check-in</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${escapeHtml(data.checkIn)}${data.checkInTime ? ` at <strong>${escapeHtml(data.checkInTime)}</strong>` : ''}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Check-out</td>
              <td style="font-size:14px;font-weight:600;color:#111827;padding-bottom:8px;text-align:right;">
                ${escapeHtml(data.checkOut)}${data.checkOutTime ? ` at <strong>${escapeHtml(data.checkOutTime)}</strong>` : ''}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;padding-bottom:8px;">Duration</td>
              <td style="font-size:14px;color:#374151;padding-bottom:8px;text-align:right;">
                ${data.nights} night${data.nights !== 1 ? 's' : ''}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#6B7280;">Guests</td>
              <td style="font-size:14px;color:#374151;text-align:right;">${data.guestCount}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Renders reference IDs (booking ID, escrow ID, on-chain ID) as a compact table.
 */
function referenceBlockHtml(data: DetailedBookingEmailData): string {
  const rows: string[] = [
    `<tr>
      <td style="font-size:13px;color:#6B7280;padding-bottom:4px;width:50%;">Booking&nbsp;ID</td>
      <td style="font-size:12px;font-family:monospace;color:#374151;padding-bottom:4px;word-break:break-all;">
        ${escapeHtml(data.bookingId)}
      </td>
    </tr>`,
  ];

  if (data.escrowId) {
    rows.push(`<tr>
      <td style="font-size:13px;color:#6B7280;padding-bottom:4px;">Escrow&nbsp;Reference</td>
      <td style="font-size:12px;font-family:monospace;color:#374151;padding-bottom:4px;word-break:break-all;">
        ${escapeHtml(data.escrowId)}
      </td>
    </tr>`);
  }

  if (data.onChainId !== undefined && data.onChainId !== null) {
    rows.push(`<tr>
      <td style="font-size:13px;color:#6B7280;">On-chain&nbsp;ID</td>
      <td style="font-size:12px;font-family:monospace;color:#374151;">${escapeHtml(String(data.onChainId))}</td>
    </tr>`);
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:#F9FAFB;">
        <td colspan="2" style="padding:10px 16px;font-size:13px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E7EB;">
          REFERENCES
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:12px 16px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            ${rows.join('')}
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Renders cancellation policy and house rules if provided.
 */
function policiesHtml(data: DetailedBookingEmailData): string {
  const sections: string[] = [];

  if (data.cancellationPolicy) {
    sections.push(`
      <div style="margin:0 0 12px;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">Cancellation Policy</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(data.cancellationPolicy)}</p>
      </div>`);
  }

  if (data.houseRules && data.houseRules.length > 0) {
    const ruleItems = data.houseRules
      .map((r) => `<li style="font-size:14px;color:#374151;margin-bottom:4px;">${escapeHtml(r)}</li>`)
      .join('');
    sections.push(`
      <div>
        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#111827;">House Rules</p>
        <ul style="margin:0;padding-left:20px;">${ruleItems}</ul>
      </div>`);
  }

  if (sections.length === 0) return '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:#F9FAFB;">
        <td style="padding:10px 16px;font-size:13px;color:#6B7280;font-weight:600;border-bottom:1px solid #E5E7EB;">
          POLICIES
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;">${sections.join('<hr style="border:none;border-top:1px solid #F3F4F6;margin:12px 0;"/>')}</td>
      </tr>
    </table>`;
}

// ─── Public service ───────────────────────────────────────────────────────────

export const emailService = {
  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(data.token)}`;
    const { html, text } = renderEmail({
      title: 'Verify your Rentars email',
      preheader: 'Confirm your email address to activate your Rentars account.',
      isEssential: true,
      body: `
        <p style="margin:0 0 16px;font-size:16px;">Welcome to Rentars!</p>
        <p style="margin:0 0 20px;">Please verify your email address to activate your account.</p>
        <p style="margin:0 0 20px;text-align:center;">
          <a href="${verifyUrl}"
             style="display:inline-block;background-color:#2563EB;color:#FFFFFF;
                    text-decoration:none;padding:12px 28px;border-radius:6px;
                    font-weight:600;font-size:15px;">
            Verify Email Address
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">
          This link expires in 24 hours. If you did not create a Rentars account, you can safely ignore this email.
        </p>`,
    });
    await send(data.to, 'Verify your Rentars email', html, text);
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

  async sendBookingConfirmed(data: BookingEmailData): Promise<void> {
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;">
        Great news — your booking for <strong>${escapeHtml(data.propertyTitle)}</strong>
        has been <strong style="color:#16A34A;">confirmed</strong> by the host!
      </p>
      ${bookingDetailsHtml(data)}
      <p style="margin:16px 0 0;font-size:14px;color:#6B7280;">Safe travels, and enjoy your stay.</p>`;

    const { html, text } = renderEmail({
      title: 'Booking Confirmed — Rentars',
      preheader: `Your stay at ${data.propertyTitle} is confirmed!`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.to, 'Booking Confirmed by Host — Rentars', html, text);
  },

  async sendBookingCancelled(data: BookingEmailData): Promise<void> {
    const supportUrl = `${env.FRONTEND_URL}/support`;
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;">
        Your booking for <strong>${escapeHtml(data.propertyTitle)}</strong> has been cancelled.
      </p>
      ${bookingDetailsHtml(data)}
      <p style="margin:16px 0 0;font-size:14px;color:#6B7280;">
        If you did not request this cancellation or have questions, please
        <a href="${escapeHtml(supportUrl)}" style="color:#2563EB;">contact support</a>.
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
   * Send a detailed booking confirmation email to the tenant.
   *
   * Includes:
   *  - Full property details and location
   *  - Check-in/out times
   *  - Complete price breakdown (subtotal, dynamic adjustment, platform fee, total)
   *  - Disclaimer that charges are in USDC and local-currency estimates are non-binding
   *  - Cancellation policy and house rules
   *  - Escrow reference and on-chain booking ID
   *  - Host contact policy
   *
   * All user-supplied strings are HTML-escaped before insertion.
   */
  async sendDetailedBookingConfirmation(data: DetailedBookingEmailData): Promise<void> {
    const hostContactSection = data.hostContactPolicy
      ? `<div style="margin:16px 0;padding:14px 16px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
           <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#15803D;">Host Contact</p>
           <p style="margin:0;font-size:14px;color:#166534;line-height:1.6;">${escapeHtml(data.hostContactPolicy)}</p>
         </div>`
      : '';

    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 20px;font-size:15px;">
        Your booking for <strong>${escapeHtml(data.propertyTitle)}</strong> is confirmed!
        Here is everything you need for your stay.
      </p>

      ${stayInfoHtml(data)}
      ${priceBreakdownHtml(data)}
      ${referenceBlockHtml(data)}
      ${hostContactSection}
      ${policiesHtml(data)}

      <div style="margin:20px 0 0;padding:14px 16px;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;">
        <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.6;">
          <strong>Important:</strong> Your payment is held securely in escrow on the Stellar network
          (reference: <code style="font-size:12px;">${escapeHtml(data.escrowId ?? data.bookingId)}</code>)
          and will be released to the host at the end of your stay.
          If you have any issues, contact support before the escrow is released.
        </p>
      </div>`;

    const { html, text } = renderEmail({
      title: 'Booking Confirmed — Rentars',
      preheader: `Your stay at ${data.propertyTitle} is confirmed. Check-in: ${data.checkIn}.`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.to, `Booking Confirmed: ${data.propertyTitle} — Rentars`, html, text);
  },

  /**
   * Send a new-booking notification email to the host.
   *
   * Includes the same key details as the tenant confirmation so the host
   * can prepare for the guest's arrival.
   */
  async sendHostBookingNotification(data: DetailedBookingEmailData & { hostEmail: string; tenantName: string }): Promise<void> {
    const body = `
      <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(data.userName)},</p>
      <p style="margin:0 0 16px;font-size:15px;">
        You have a new booking for <strong>${escapeHtml(data.propertyTitle)}</strong>
        from <strong>${escapeHtml(data.tenantName)}</strong>.
      </p>

      ${stayInfoHtml(data)}
      ${priceBreakdownHtml(data)}
      ${referenceBlockHtml(data)}

      <div style="margin:16px 0 0;padding:12px 16px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
        <p style="margin:0;font-size:13px;color:#15803D;line-height:1.6;">
          The tenant's payment of <strong>${data.totalPrice.toFixed(2)} USDC</strong>
          is held in escrow and will be released to you after the stay is completed.
        </p>
      </div>`;

    const { html, text } = renderEmail({
      title: 'New Booking — Rentars',
      preheader: `New booking from ${data.tenantName} for ${data.propertyTitle}.`,
      body,
      preferencesUrl: data.preferencesUrl,
    });

    await send(data.hostEmail, `New Booking: ${data.propertyTitle} — Rentars`, html, text);
  },

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(data.token)}`;
    const { html, text } = renderEmail({
      title: 'Reset your Rentars password',
      preheader: 'Someone requested a password reset for your Rentars account.',
      isEssential: true,
      body: `
        <p style="margin:0 0 16px;font-size:15px;">Someone requested a password reset for your Rentars account.</p>
        <p style="margin:0 0 20px;text-align:center;">
          <a href="${resetUrl}"
             style="display:inline-block;background-color:#2563EB;color:#FFFFFF;
                    text-decoration:none;padding:12px 28px;border-radius:6px;
                    font-weight:600;font-size:15px;">
            Reset Password
          </a>
        </p>
        <p style="margin:0;font-size:13px;color:#6B7280;">
          This link expires in 60 minutes. If you did not request a reset, you can safely ignore this email.
        </p>`,
    });
    await send(data.to, 'Reset your Rentars password', html, text);
  },
};
