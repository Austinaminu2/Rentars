/**
 * Tests for new auth, dashboard, and wishlist translation namespaces.
 * Verifies all 4 locales have the new keys and they are non-empty.
 */

import { describe, it, expect } from 'vitest';
import en from '@/lib/i18n/locales/en';
import es from '@/lib/i18n/locales/es';
import fr from '@/lib/i18n/locales/fr';
import pt from '@/lib/i18n/locales/pt';

const locales = { en, es, fr, pt };

describe('auth translations', () => {
  it('en has all required auth keys', () => {
    expect(en.auth.emailLabel).toBeTruthy();
    expect(en.auth.passwordLabel).toBeTruthy();
    expect(en.auth.fullNameLabel).toBeTruthy();
    expect(en.auth.confirmPasswordLabel).toBeTruthy();
    expect(en.auth.signIn).toBeTruthy();
    expect(en.auth.createAccount).toBeTruthy();
    expect(en.auth.captchaRequired).toBeTruthy();
  });

  it('all locales have the same auth keys as en', () => {
    const enKeys = Object.keys(en.auth).sort();
    for (const [loc, msgs] of Object.entries(locales)) {
      expect(Object.keys(msgs.auth).sort(), `${loc}.auth keys`).toEqual(enKeys);
    }
  });

  it('all auth strings are non-empty in every locale', () => {
    for (const [loc, msgs] of Object.entries(locales)) {
      for (const [key, val] of Object.entries(msgs.auth)) {
        expect(typeof val, `${loc}.auth.${key}`).toBe('string');
        expect((val as string).length, `${loc}.auth.${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('non-English locales have translated (different) key auth strings', () => {
    expect(es.auth.signIn).not.toBe(en.auth.signIn);
    expect(fr.auth.signIn).not.toBe(en.auth.signIn);
    expect(pt.auth.signIn).not.toBe(en.auth.signIn);
  });
});

describe('dashboard translations', () => {
  it('all locales have the same dashboard keys as en', () => {
    const enKeys = Object.keys(en.dashboard).sort();
    for (const [loc, msgs] of Object.entries(locales)) {
      expect(Object.keys(msgs.dashboard).sort(), `${loc}.dashboard keys`).toEqual(enKeys);
    }
  });

  it('all dashboard strings are non-empty in every locale', () => {
    for (const [loc, msgs] of Object.entries(locales)) {
      for (const [key, val] of Object.entries(msgs.dashboard)) {
        expect((val as string).length, `${loc}.dashboard.${key} empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('wishlist translations', () => {
  it('all locales have wishlist keys', () => {
    const enKeys = Object.keys(en.wishlist).sort();
    for (const [loc, msgs] of Object.entries(locales)) {
      expect(Object.keys(msgs.wishlist).sort(), `${loc}.wishlist keys`).toEqual(enKeys);
    }
  });
});

describe('property wishlist keys', () => {
  it('all locales have addToWishlist / removeFromWishlist in property namespace', () => {
    for (const [loc, msgs] of Object.entries(locales)) {
      expect(msgs.property.addToWishlist, `${loc}.property.addToWishlist`).toBeTruthy();
      expect(msgs.property.removeFromWishlist, `${loc}.property.removeFromWishlist`).toBeTruthy();
    }
  });
});

describe('full schema shape — all locale keys match en', () => {
  const topLevelKeys = Object.keys(en).sort();
  for (const [loc, msgs] of Object.entries(locales)) {
    if (loc === 'en') continue;
    it(`${loc} top-level keys match en`, () => {
      expect(Object.keys(msgs).sort()).toEqual(topLevelKeys);
    });
  }
});
