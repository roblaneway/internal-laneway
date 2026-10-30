import nodemailer from 'nodemailer'
import { HttpError } from './errors.ts'

// Outgoing email over SMTP. Defaults suit Gmail with an App password (free, ~500 emails a day):
// set SMTP_USER to the Gmail address and SMTP_PASS to the 16-character App password.
// Without SMTP settings, development prints emails to the console instead of sending them.

const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const port = Number(process.env.SMTP_PORT ?? 465)
const from = process.env.MAIL_FROM || (user ? `Laneway Education <${user}>` : 'Laneway Education <no-reply@localhost>')
const isProduction = process.env.NODE_ENV === 'production'

const transport =
  user && pass
    ? nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'smtp.gmail.com', port, secure: port === 465, auth: { user, pass } })
    : null

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export async function sendMail(mail: Mail) {
  if (!transport) {
    if (isProduction) throw new HttpError(503, "Email isn't set up yet. Add SMTP_USER and SMTP_PASS to the server's environment.")
    console.log(`\n--- Email (not sent: SMTP_USER/SMTP_PASS not set) ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n---\n`)
    return
  }
  try {
    await transport.sendMail({ from, ...mail })
  } catch (err) {
    console.error('sendMail failed', err)
    throw new HttpError(502, "The email couldn't be sent. Check the SMTP settings and try again.")
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** The invite a new (or re-invited) user receives, with their temporary password. */
export function inviteMail({
  to,
  name,
  role,
  password,
  loginUrl,
  expiresAt,
}: {
  to: string
  name: string
  role: string
  password: string
  loginUrl: string
  expiresAt: Date
}): Mail {
  const expires = expiresAt.toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long', year: 'numeric' })
  const first = name.split(/\s+/)[0] || name
  const text = [
    `Hi ${first},`,
    '',
    `You've been invited to the Laneway Education Staff & Student Portal as a ${role}.`,
    '',
    `Sign in at ${loginUrl}`,
    `Email: ${to}`,
    `Temporary password: ${password}`,
    '',
    `The temporary password works until ${expires}. When you first sign in you'll be asked to choose your own password.`,
    '',
    "If you weren't expecting this email, you can ignore it.",
    '',
    'Laneway Education',
  ].join('\n')
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <tr><td>
      <p style="margin:0 0 4px;font-size:20px;font-weight:bold;letter-spacing:3px">LANEWAY</p>
      <p style="margin:0 0 24px;font-size:11px;letter-spacing:4px;color:#1e3a8a">EDUCATION</p>
      <p>Hi ${escapeHtml(first)},</p>
      <p>You've been invited to the Laneway Education Staff &amp; Student Portal as a ${escapeHtml(role)}.</p>
      <table role="presentation" style="margin:16px 0;background:#f4f5f7;border-radius:6px;padding:12px 16px;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Email</td><td>${escapeHtml(to)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Temporary password</td><td style="font-family:monospace;font-size:15px">${escapeHtml(password)}</td></tr>
      </table>
      <p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px">Sign in to the portal</a></p>
      <p style="font-size:13px;color:#6b7280">The temporary password works until ${escapeHtml(expires)}. When you first sign in you'll be asked to choose your own password. If you weren't expecting this email, you can ignore it.</p>
    </td></tr>
  </table>
</body></html>`
  return { to, subject: 'Your Laneway Education portal account', text, html }
}
