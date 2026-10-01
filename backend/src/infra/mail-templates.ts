/** Branded transactional emails. Every value is escaped; links are built server-side from PUBLIC_WEB_URL. */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#fe5003;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>
       <p style="color:#64748b;font-size:12px">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${esc(cta.url)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:32px">
      <div style="font-weight:700;font-size:18px;margin-bottom:24px">nbills</div>
      <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
      ${body}${button}
    </td></tr></table>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">nbills &middot; A Navedhana Product</p>
  </td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="line-height:1.6;margin:0 0 12px">${text}</p>`;

export type MailTemplate =
  | { template: 'invitation'; data: { inviter: string; company: string; url: string; expiresAt: string } }
  | { template: 'password-reset'; data: { name: string; url: string; minutes: number } }
  | { template: 'password-changed'; data: { name: string } }
  | { template: 'welcome'; data: { name: string; company: string; url: string; trialEndsAt?: string } }
  | { template: 'notification'; data: { title: string; body: string; url?: string; company: string } }
  | { template: 'invoice'; data: { brand: string; documentLabel: string; number: string; customer: string; amount: string; dueDate?: string; message?: string } };

export function renderMail(m: MailTemplate): { subject: string; html: string; text: string } {
  switch (m.template) {
    case 'invitation': {
      const d = m.data;
      return {
        subject: `${d.inviter} invited you to ${d.company} on nbills`,
        html: layout(`Join ${d.company}`, p(`${esc(d.inviter)} has invited you to join <b>${esc(d.company)}</b> on nbills.`) + p(`This invitation expires on ${esc(d.expiresAt)} and can be used once.`), { label: 'Accept invitation', url: d.url }),
        text: `${d.inviter} invited you to join ${d.company} on nbills.\nAccept: ${d.url}\nExpires: ${d.expiresAt}`,
      };
    }
    case 'password-reset': {
      const d = m.data;
      return {
        subject: 'Reset your nbills password',
        html: layout('Reset your password', p(`Hi ${esc(d.name)}, we received a request to reset your password.`) + p(`The link works once and expires in ${d.minutes} minutes. If you didn't ask for this, you can ignore this email.`), { label: 'Choose a new password', url: d.url }),
        text: `Reset your password (expires in ${d.minutes} minutes): ${d.url}`,
      };
    }
    case 'password-changed':
      return {
        subject: 'Your nbills password was changed',
        html: layout('Password changed', p(`Hi ${esc(m.data.name)}, your password was just changed and other sessions were signed out.`) + p("If this wasn't you, reset your password right away and contact your administrator.")),
        text: 'Your nbills password was changed. If this was not you, reset it immediately.',
      };
    case 'welcome': {
      const d = m.data;
      const trial = d.trialEndsAt ? p(`Your free trial runs until ${esc(d.trialEndsAt)}.`) : '';
      return {
        subject: `Welcome to nbills, ${d.name}`,
        html: layout(`${d.company} is ready`, p('Your workspace is set up. Add customers, create your first invoice and invite your team.') + trial, { label: 'Open your workspace', url: d.url }),
        text: `Your workspace for ${d.company} is ready: ${d.url}`,
      };
    }
    case 'notification': {
      const d = m.data;
      return {
        subject: `${d.title} · ${d.company}`,
        html: layout(d.title, p(esc(d.body)), d.url ? { label: 'View details', url: d.url } : undefined),
        text: `${d.title}\n${d.body}${d.url ? `\n${d.url}` : ''}`,
      };
    }
    case 'invoice': {
      const d = m.data;
      const due = d.dueDate ? ` due on <b>${esc(d.dueDate)}</b>` : '';
      const note = d.message ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#f1f5f9;border-radius:8px;white-space:pre-line">${esc(d.message)}</blockquote>` : '';
      return {
        subject: `${d.documentLabel} ${d.number} from ${d.brand}`,
        html: layout(`${d.documentLabel} ${d.number}`, p(`Dear ${esc(d.customer)},`) + note + p(`Please find attached ${esc(d.documentLabel.toLowerCase())} <b>${esc(d.number)}</b> from ${esc(d.brand)} for <b>${esc(d.amount)}</b>${due}.`) + p('Reply to this email if you have any questions.')),
        text: `Dear ${d.customer},\n\n${d.message ? `${d.message}\n\n` : ''}Please find attached ${d.documentLabel.toLowerCase()} ${d.number} from ${d.brand} for ${d.amount}${d.dueDate ? ` due on ${d.dueDate}` : ''}.`,
      };
    }
  }
}
