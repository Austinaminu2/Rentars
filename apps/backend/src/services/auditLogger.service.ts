/**
 * Audit logging service.
 *
 * Writes structured JSON audit log entries to stdout for log aggregation
 * (Datadog, CloudWatch, etc.) and persists them to the audit_logs table in
 * Supabase for operational review.
 *
 * Every sensitive action — login, logout, registration, property changes,
 * bookings, admin operations — should call auditLogger.log().
 *
 * Entry shape:
 * {
 *   timestamp:    ISO 8601
 *   actor_id:     user ID performing the action (undefined for unauthenticated)
 *   action:       verb describing what happened (e.g. "property.create")
 *   resource_type: "user" | "property" | "booking" | "dispute" | "auth" | ...
 *   resource_id:  ID of the affected resource (if applicable)
 *   ip:           client IP address
 *   meta:         additional context (no secrets, no PII beyond IDs)
 * }
 */

import { supabase } from '@/config/supabase.js';

export type AuditAction =
  // Auth
  | 'auth.register'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.token_refresh'
  | 'auth.password_reset_request'
  | 'auth.password_reset_confirm'
  | 'auth.unauthorized_access'
  // Properties
  | 'property.create'
  | 'property.update'
  | 'property.delete'
  | 'property.suspend'
  | 'property.activate'
  // Bookings
  | 'booking.create'
  | 'booking.cancel'
  | 'booking.confirm'
  | 'booking.delete'
  // Payments
  | 'payment.submit'
  | 'payment.confirmed'
  | 'payment.failed'
  | 'payment.retry'
  // Disputes
  | 'dispute.open'
  | 'dispute.resolve'
  // Admin
  | 'admin.user_suspend'
  | 'admin.user_activate'
  | 'admin.property_suspend'
  | 'admin.property_activate'
  | 'admin.featured_set'
  | 'admin.featured_clear';

export type ResourceType =
  | 'user'
  | 'property'
  | 'booking'
  | 'payment'
  | 'dispute'
  | 'auth'
  | 'admin';

export interface AuditLogEntry {
  actorId?: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}

class AuditLogger {
  async log(entry: AuditLogEntry): Promise<void> {
    const record = {
      timestamp: new Date().toISOString(),
      actor_id: entry.actorId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta ?? null,
    };

    // Always emit to stdout as structured JSON for log aggregation
    console.log(JSON.stringify({ audit: true, ...record }));

    // Persist to Supabase (best-effort — never throws)
    try {
      await supabase.from('audit_logs').insert(record);
    } catch (err) {
      console.error('[AuditLogger] Failed to persist audit log entry:', err);
    }
  }
}

export const auditLogger = new AuditLogger();
