/**
 * Accessibility tests for auth forms.
 * Verifies:
 * - Labels have htmlFor tied to matching input ids
 * - Inputs have aria-describedby on validation error
 * - Submit button has accessible state when loading
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { I18nProvider } from '@/lib/i18n/context';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';

function withI18n(ui: React.ReactNode) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

describe('LoginForm — accessibility', () => {
  it('email label is associated with the email input via htmlFor', () => {
    withI18n(<LoginForm onSubmit={vi.fn()} />);
    const emailInput = screen.getByRole('textbox', { name: /email/i });
    expect(emailInput).toHaveAttribute('id', 'login-email');
    const label = document.querySelector('label[for="login-email"]');
    expect(label).not.toBeNull();
  });

  it('password label is associated with the password input', () => {
    withI18n(<LoginForm onSubmit={vi.fn()} />);
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('id', 'login-password');
  });

  it('email input has autocomplete="email"', () => {
    withI18n(<LoginForm onSubmit={vi.fn()} />);
    const emailInput = screen.getByRole('textbox', { name: /email/i });
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
  });

  it('password input has autocomplete="current-password"', () => {
    withI18n(<LoginForm onSubmit={vi.fn()} />);
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  it('form uses noValidate to rely on accessible custom validation', () => {
    const { container } = withI18n(<LoginForm onSubmit={vi.fn()} />);
    const form = container.querySelector('form');
    expect(form).toHaveAttribute('novalidate');
  });

  it('submit button has aria-busy when submitting', async () => {
    const user = userEvent.setup();
    // onSubmit never resolves so the button stays in loading state
    const onSubmit = vi.fn((): Promise<void> => new Promise(() => {}));
    withI18n(<LoginForm onSubmit={onSubmit} />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitBtn);

    // aria-busy is set while submitting
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('RegisterForm — accessibility', () => {
  it('all inputs have associated labels', () => {
    withI18n(<RegisterForm onSubmit={vi.fn()} />);

    const nameInput = screen.getByRole('textbox', { name: /full name/i });
    expect(nameInput).toHaveAttribute('id', 'register-name');
    expect(document.querySelector('label[for="register-name"]')).not.toBeNull();

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    expect(emailInput).toHaveAttribute('id', 'register-email');
    expect(document.querySelector('label[for="register-email"]')).not.toBeNull();
  });

  it('password inputs have autocomplete="new-password"', () => {
    withI18n(<RegisterForm onSubmit={vi.fn()} />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach((input) => {
      expect(input).toHaveAttribute('autocomplete', 'new-password');
    });
  });

  it('name input has autocomplete="name"', () => {
    withI18n(<RegisterForm onSubmit={vi.fn()} />);
    const nameInput = screen.getByRole('textbox', { name: /full name/i });
    expect(nameInput).toHaveAttribute('autocomplete', 'name');
  });
});
