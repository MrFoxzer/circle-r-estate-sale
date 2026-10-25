/*
 * Netlify Function: submission-created
 *
 * Netlify runs this (by file name) after every Netlify Forms submission it
 * stores. The site has one form, `property-inquiry` (index.html, #contact).
 *
 * Lead guard v2 (_lib/lead-guard.js, the shared copy from
 * homematch-realty-website; do not edit it here) runs first, on the form's
 * fields plus the hidden `human` token js/human-check.js fills in:
 *   drop     honeypot, adult/drug spam, bot spam without a valid token
 *   quiet    no token, fake phone, disposable email, pitch wording from a
 *            verified visitor, or NOT ENGLISH
 *   deliver  push to Jacob's phone
 * drop and quiet never push. Every submission, whatever the verdict, is still
 * in the Netlify Forms dashboard (Forms -> property-inquiry) for review.
 *
 * Non-English is 'quiet', never dropped: this is a real-estate inquiry form,
 * and turning buyers away over the language they write in is national-origin
 * discrimination under the Fair Housing Act.
 *
 * Push: ntfy JSON publish (same as revisions-unlimited-website notify.js).
 * Env: NTFY_TOPIC (Netlify site env var). Never hardcode or log it.
 */

const { triage } = require('./_lib/lead-guard.js');

const SITE = 'Circle R Estate';
const PUSH_TIMEOUT_MS = 6000;
const MESSAGE_MAX = 400;

// Not the visitor's own words, or passed to triage() by name.
const NOT_TEXT = new Set(['name', 'email', 'phone', 'message', 'human', 'bot-field', 'form-name',
  'ip', 'user_agent', 'referrer']);

const INTEREST = {
  'equestrian-estate': 'Private equestrian estate',
  'family-compound': 'Family compound / multi-gen',
  camp: 'Faith / scout / camp operator',
  retreat: 'Wellness / retreat center',
  venue: 'Wedding / event venue',
  hunting: 'Hunting / recreation',
  boarding: 'Horse boarding / training',
  1031: '1031 exchange replacement',
  'hobby-farm': 'Hobby farm / homestead',
  investor: 'Investor / developer',
  other: 'Other',
};

const STRICTNESS = { deliver: 0, quiet: 1, drop: 2 };

const str = (v) => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
// One line, no control characters, capped.
const clean = (v, max = 120) => str(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Two passes; the stricter verdict wins. The message alone decides the
// language (Latin select values must not dilute a non-Latin message below the
// guard's threshold, the All Pro bid-request lesson); the full pass still
// checks every free-text field for spam signals.
function leadGuard(data) {
  const text = Object.entries(data)
    .filter(([k, v]) => !NOT_TEXT.has(k) && typeof v === 'string')
    .map(([, v]) => v)
    .join('\n');
  const fields = { name: str(data.name), email: str(data.email), phone: str(data.phone), message: str(data.message) };
  const opts = { human: str(data.human), honeypot: str(data['bot-field']), nonEnglish: 'quiet' };
  const own = triage(fields, opts);
  const all = triage({ ...fields, text }, opts);
  return STRICTNESS[all.action] > STRICTNESS[own.action] ? all : own;
}

async function pushToPhone(data) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.error('NTFY_TOPIC is not set: push skipped (the lead is still in Netlify Forms)');
    return { ok: false, detail: 'no topic' };
  }
  const name = clean(data.name) || 'Someone';
  const phone = clean(data.phone, 40);
  const email = clean(data.email);
  const interest = INTEREST[clean(data.interest)] || clean(data.interest);
  let message = str(data.message).replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim();
  if (message.length > MESSAGE_MAX) message = message.slice(0, MESSAGE_MAX - 1).trimEnd() + '…';

  const lines = [
    `Name: ${name}`,
    `Phone: ${phone || 'not given'}`,
    `Email: ${email || 'not given'}`,
    `Wants: ${interest || 'not picked'} (100-acre estate, Long Prairie)`,
  ];
  if (message) lines.push('', message);

  const digits = phone.replace(/[^0-9+]/g, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PUSH_TIMEOUT_MS);
  try {
    const res = await fetch('https://ntfy.sh', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        title: `${SITE} — new lead`,
        message: lines.join('\n'),
        priority: 4,
        tags: ['house', 'telephone_receiver'],
        click: digits.length >= 7 ? `tel:${digits}` : undefined,
      }),
    });
    if (!res.ok) {
      console.error('ntfy push failed:', res.status);
      return { ok: false, detail: `ntfy ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('ntfy push failed:', (err && err.name) || 'error');
    return { ok: false, detail: (err && err.name) || 'error' };
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  let payload;
  try {
    ({ payload } = JSON.parse(event.body || '{}'));
  } catch (err) {
    console.error('submission-created: unreadable event body');
    return { statusCode: 400, body: 'bad body' };
  }
  const formName = (payload && payload.form_name) || '';
  const data = (payload && payload.data) || {};

  const guard = leadGuard(data);
  if (guard.action !== 'deliver') {
    // One line, no visitor details: the submission itself is in Netlify Forms.
    console.log(`lead guard: ${guard.action} (${guard.reason}), form ${formName}: no push`);
    return { statusCode: 200, body: `guard-${guard.action}` };
  }

  const sent = await pushToPhone(data);
  if (!sent.ok) return { statusCode: 502, body: `push failed: ${sent.detail}` };
  console.log(`lead delivered, form ${formName}: pushed`);
  return { statusCode: 200, body: 'pushed' };
};
