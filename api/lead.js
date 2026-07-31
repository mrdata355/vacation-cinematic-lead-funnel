const crypto = require('crypto');

const NOTIFY_EMAIL = Buffer.from('bXJkYXRhMDUwMUBnbWFpbC5jb20=', 'base64').toString('utf8');
const CONSENT_VERSION = '2026-07-31-v2';
const CONTACT_CONSENT_TEXT = 'I authorize Vacation Preview Access to contact me by a manual live telephone call and email about my requested promotional vacation opportunity. I understand the callback may include a sales offer. Consent is not a condition of purchase, and submitting this form does not create a charge or reservation.';
const CALLBACK_COMMITMENT_TEXT = 'I selected a callback window when I expect to be available and intend to answer or return the call.';
const SALES_ACK_TEXT = 'I understand this is a promotional sales callback request, no travel is reserved, and no payment card is requested, stored, authorized, or charged through this website.';
const PRIVACY_ACK_TEXT = 'I reviewed the Privacy Policy and Terms before submitting.';

const ALLOWED_FIELDS = [
  'destination', 'travel_window', 'age_18_plus', 'employment', 'relationship',
  'first_name', 'last_name', 'email', 'phone', 'callback_date', 'callback_time',
  'presentation_ack', 'contact_consent', 'callback_commitment', 'sales_ack',
  'privacy_ack', 'utm_source', 'utm_campaign', 'utm_medium', 'browser_timezone',
  'page_url', 'completed_in_ms'
];

function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function deliverToFormSubmit(lead) {
  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(NOTIFY_EMAIL)}`;
  const payload = {
    ...lead,
    _subject: `Vacation callback lead: ${lead.first_name} ${lead.last_name} · ${lead.destination}`,
    _template: 'table',
    _captcha: 'false',
    _replyto: lead.email,
    _url: lead.page_url,
    compliance_notice: 'Manual live callback requested. No card data collected. No charge or reservation created.'
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'VacationPreviewAccess/2.0',
      referer: lead.page_url || 'https://vacation-cinematic-lead-funnel.vercel.app/'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('FormSubmit rejected lead');
  const body = await response.json().catch(() => ({}));
  if (body.success === false) throw new Error('FormSubmit could not queue lead');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const length = Number(req.headers['content-length'] || 0);
  if (length > 25000) return json(res, 413, { error: 'Request too large' });

  const origin = clean(req.headers.origin, 500);
  const allowedOrigin = clean(process.env.PUBLIC_SITE_URL, 500);
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return json(res, 403, { error: 'Origin not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.website) return json(res, 200, { ok: true });
  if (Number(body.completed_in_ms || 0) < 5000) {
    return json(res, 400, { error: 'Please complete the form before submitting.' });
  }

  const required = [
    'destination', 'travel_window', 'age_18_plus', 'employment', 'relationship',
    'first_name', 'last_name', 'email', 'phone', 'callback_date', 'callback_time',
    'presentation_ack', 'contact_consent', 'callback_commitment', 'sales_ack', 'privacy_ack'
  ];
  for (const key of required) {
    if (!clean(body[key])) return json(res, 400, { error: 'Please complete every required field.' });
  }

  if (body.age_18_plus !== 'Yes' || body.employment === 'Full-time student') {
    return json(res, 400, { error: 'This promotion is not available for this eligibility route.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email, 180))) {
    return json(res, 400, { error: 'Enter a valid email address.' });
  }
  if (clean(body.phone, 40).replace(/\D/g, '').length < 10) {
    return json(res, 400, { error: 'Enter a valid mobile number.' });
  }

  const lead = {
    id: crypto.randomUUID(),
    submitted_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
    contact_consent_text: CONTACT_CONSENT_TEXT,
    callback_commitment_text: CALLBACK_COMMITMENT_TEXT,
    sales_ack_text: SALES_ACK_TEXT,
    privacy_ack_text: PRIVACY_ACK_TEXT,
    user_agent: clean(req.headers['user-agent'], 500)
  };
  for (const key of ALLOWED_FIELDS) {
    lead[key] = clean(body[key], key === 'page_url' ? 800 : 300);
  }
  lead.ip_hash = crypto
    .createHash('sha256')
    .update(clean(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', 200) + (process.env.LEAD_HASH_SALT || 'vacation-preview'))
    .digest('hex')
    .slice(0, 24);

  const deliveries = [deliverToFormSubmit(lead)];
  const webhook = process.env.LEAD_WEBHOOK_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.LEAD_NOTIFY_TO;
  const notifyFrom = process.env.LEAD_NOTIFY_FROM;

  if (webhook) {
    deliveries.push(
      fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'VacationPreviewAccess/2.0' },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(8000)
      }).then((response) => {
        if (!response.ok) throw new Error('Webhook rejected lead');
      })
    );
  }

  if (resendKey && notifyTo && notifyFrom) {
    const text = Object.entries(lead).map(([key, value]) => `${key}: ${value}`).join('\n');
    deliveries.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: notifyFrom,
          to: [notifyTo],
          reply_to: lead.email,
          subject: `Vacation callback lead: ${lead.first_name} ${lead.last_name} · ${lead.destination}`,
          text
        }),
        signal: AbortSignal.timeout(8000)
      }).then((response) => {
        if (!response.ok) throw new Error('Email delivery failed');
      })
    );
  }

  try {
    await Promise.any(deliveries);
    return json(res, 200, { ok: true, lead_id: lead.id });
  } catch {
    return json(res, 502, {
      error: 'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.'
    });
  }
};