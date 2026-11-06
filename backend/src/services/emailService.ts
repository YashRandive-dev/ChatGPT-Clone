import nodemailer, { type Transporter } from 'nodemailer';
import { env, primaryFrontendUrl } from '../config/env';
import { logger } from '../utils/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    // No SMTP configured: render the email as JSON and log it (development convenience).
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}
/** Captures outgoing mail in tests. */
export const outbox: SentMail[] = [];

async function send(to: string, subject: string, text: string, html: string) {
  if (env.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  const info = await getTransporter().sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
  if (!env.SMTP_HOST) logger.info(`[email:dev] To: ${to} | ${subject}\n${text}`);
  else logger.debug(`Email sent to ${to}: ${info.messageId}`);
}

function otpLayout(title: string, intro: string, code: string, minutes: number, ctaLabel: string, ctaUrl: string) {
  const digits = code
    .split('')
    .map((d) => `<span style="display:inline-block;width:40px;height:52px;line-height:52px;margin:0 3px;border-radius:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:26px;font-weight:700;color:#0f172a;font-family:SFMono-Regular,Menlo,monospace">${d}</span>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
  <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:20px;font-weight:700;color:#0f172a">✦ Kairo</td></tr>
  <tr><td style="padding-top:16px;font-size:18px;font-weight:600;color:#0f172a">${title}</td></tr>
  <tr><td style="padding-top:8px;font-size:15px;line-height:1.6;color:#334155">${intro}</td></tr>
  <tr><td align="center" style="padding:24px 0 8px">${digits}</td></tr>
  <tr><td align="center" style="font-size:13px;color:#64748b">This code expires in ${minutes} minutes. Never share it with anyone.</td></tr>
  <tr><td style="padding-top:24px"><a href="${ctaUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${ctaLabel}</a></td></tr>
  <tr><td style="padding-top:24px;font-size:12px;color:#94a3b8">If you didn't request this, you can safely ignore this email.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendVerificationOtpEmail(to: string, name: string, code: string, minutes: number) {
  const url = `${primaryFrontendUrl}/verify-email`;
  await send(
    to,
    `${code} is your Kairo verification code`,
    `Hi ${name},\n\nYour Kairo email verification code is: ${code}\n\nIt expires in ${minutes} minutes. Enter it at ${url}\n`,
    otpLayout('Verify your email', `Hi ${escapeHtml(name)}, enter this code in Kairo to verify your email address.`, code, minutes, 'Open Kairo', url),
  );
}

export async function sendPasswordResetOtpEmail(to: string, name: string, code: string, minutes: number) {
  const url = `${primaryFrontendUrl}/forgot-password`;
  await send(
    to,
    `${code} is your Kairo password reset code`,
    `Hi ${name},\n\nYour Kairo password reset code is: ${code}\n\nIt expires in ${minutes} minutes. If you did not request this, ignore this email.\n`,
    otpLayout('Reset your password', `Hi ${escapeHtml(name)}, we received a request to reset your password. Enter this code to continue.`, code, minutes, 'Reset password', url),
  );
}

function noticeLayout(title: string, bodyHtml: string, ctaLabel: string, ctaUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
  <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:20px;font-weight:700;color:#0f172a">✦ Kairo</td></tr>
  <tr><td style="padding-top:16px;font-size:18px;font-weight:600;color:#0f172a">${title}</td></tr>
  <tr><td style="padding-top:8px;font-size:15px;line-height:1.6;color:#334155">${bodyHtml}</td></tr>
  <tr><td style="padding-top:24px"><a href="${ctaUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${ctaLabel}</a></td></tr>
  <tr><td style="padding-top:24px;font-size:12px;color:#94a3b8">You can turn these alerts off in Settings → Notifications.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendLoginOtpEmail(to: string, name: string, code: string, minutes: number) {
  const url = `${primaryFrontendUrl}/login`;
  await send(
    to,
    `${code} is your Kairo sign-in code`,
    `Hi ${name},\n\nYour Kairo sign-in code is: ${code}\n\nIt expires in ${minutes} minutes. If you didn't try to sign in, change your password now.\n`,
    otpLayout('Your sign-in code', `Hi ${escapeHtml(name)}, someone (hopefully you) is signing in to Kairo. Enter this code to finish.`, code, minutes, 'Open Kairo', url),
  );
}

export async function sendNewSignInEmail(to: string, name: string, device: string, ip: string | null, when: Date) {
  const url = `${primaryFrontendUrl}/settings`;
  const whenStr = when.toUTCString();
  await send(
    to,
    'New sign-in to your Kairo account',
    `Hi ${name},\n\nYour account was just signed in to from ${device}${ip ? ` (IP ${ip})` : ''} at ${whenStr}.\nIf this wasn't you, change your password and sign out other sessions: ${url}\n`,
    noticeLayout(
      'New sign-in detected',
      `Hi ${escapeHtml(name)}, your account was just signed in to from <strong>${escapeHtml(device)}</strong>${ip ? ` (IP ${escapeHtml(ip)})` : ''} on ${escapeHtml(whenStr)}.<br><br>If this wasn't you, change your password and sign out other sessions right away.`,
      'Review security',
      url,
    ),
  );
}

export async function sendPasswordChangedEmail(to: string, name: string, when: Date) {
  const url = `${primaryFrontendUrl}/forgot-password`;
  await send(
    to,
    'Your Kairo password was changed',
    `Hi ${name},\n\nYour Kairo password was changed on ${when.toUTCString()}. All other sessions were signed out.\nIf you didn't do this, reset your password immediately: ${url}\n`,
    noticeLayout(
      'Password changed',
      `Hi ${escapeHtml(name)}, your password was changed on ${escapeHtml(when.toUTCString())} and all other sessions were signed out.<br><br>If you didn't do this, reset your password immediately.`,
      'Reset password',
      url,
    ),
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
