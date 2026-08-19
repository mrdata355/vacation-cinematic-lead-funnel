const crypto = require('crypto');

const NOTIFY_EMAIL = process.env.LEAD_NOTIFY_TO || 'mrdata0501@gmail.com';
const CONSENT_VERSION = '2026-08-19-v5';
const CONTACT_TEXT = 'Manual live telephone call and email authorized for the requested promotional vacation opportunity. Callback may include a sales offer. Consent is not a condition of purchase. No online charge or reservation is created.';
const CALLBACK_TEXT = 'Customer selected a callback window and stated they expect to be available and intend to answer or return the call.';
const SALES_TEXT = 'Customer understands this is a promotional sales callback request. No travel is reserved, no online charge is created, and any purchase requires approval during the callback after full pricing, taxes, fees, eligibility rules, and offer terms are reviewed.';
const PAYMENT_TEXT = 'If secure card save is active, card details are tokenized by Stripe through a SetupIntent. Vacation Preview Access does not receive or store the full card number or CVC. No charge is created by website submission.';
const PRIVACY_TEXT = 'Customer reviewed the Privacy Policy and Terms before submitting.';
const FIELDS = [
  'destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time',
  'presentation_ack','contact_consent','callback_commitment','sales_ack','privacy_ack','payment_consent',
  'payment_processor','card_collection_status','stripe_customer_id','stripe_payment_method_id','stripe_setup_intent_id','payment_secured_at','card_brand','card_last4','card_expiration',
  'utm_source','utm_campaign','utm_medium','utm_content','browser_timezone','page_url','completed_in_ms','facebook_click_id_present','consent_recorded_at','compliance_notice'
];

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return Object.fromEntries(new URLSearchParams(req.body)); }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

async function stripeGet(path) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('Stripe secret key is not configured.');
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { authorization: `Bearer ${secretKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Stripe lookup failed.');
  return data;
}

async function enrichPaymentMetadata(lead) {
  if (lead.card_collection_status !== 'secured') return;
  if (!lead.stripe_payment_method_id || !lead.stripe_payment_method_id.startsWith('pm_')) {
    throw new Error('Saved card confirmation was missing. Please try again.');
  }

  const paymentMethod = await stripeGet(`/v1/payment_methods/${encodeURIComponent(lead.stripe_payment_method_id)}`);
  const card = paymentMethod.card || {};
  lead.card_brand = clean(card.brand, 40);
  lead.card_last4 = clean(card.last4, 8);
  lead.card_expiration = card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : '';
  lead.stripe_customer_id = clean(paymentMethod.customer || lead.stripe_customer_id, 120);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
  if (Number(req.headers['content-length'] || 0) > 40000) return reply(res, 413, { error: 'Request too large' });

  try {
    const body = await readBody(req);
    if (body.website || body._honey) return reply(res, 200, { ok: true });
    if (Number(body.completed_in_ms || 0) < 5000) return reply(res, 400, { error: 'Please complete the form before submitting.' });

    const required = ['destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time','presentation_ack','contact_consent','callback_commitment','sales_ack','privacy_ack'];
    for (const key of required) {
      if (!clean(body[key])) return reply(res, 400, { error: 'Please complete every required field.' });
    }
    if (body.age_18_plus !== 'Yes' || body.employment === 'Full-time student') {
      return reply(res, 400, { error: 'This promotion is not available for this eligibility route.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email, 180))) {
      return reply(res, 400, { error: 'Enter a valid email address.' });
    }
    if (clean(body.phone, 40).replace(/\D/g, '').length < 10) {
      return reply(res, 400, { error: 'Enter a valid mobile number.' });
    }

    const lead = {
      lead_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
      consent_version: CONSENT_VERSION,
      contact_consent_record: CONTACT_TEXT,
      callback_commitment_record: CALLBACK_TEXT,
      sales_disclosure_record: SALES_TEXT,
      payment_disclosure_record: PAYMENT_TEXT,
      privacy_record: PRIVACY_TEXT,
      user_agent: clean(req.headers['user-agent'], 500),
    };

    for (const key of FIELDS) lead[key] = clean(body[key], key === 'page_url' ? 900 : 500);

    lead.email = lead.email.toLowerCase();
    lead.ip_hash = crypto.createHash('sha256')
      .update(clean(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', 200) + (process.env.LEAD_HASH_SALT || 'vacation-preview'))
      .digest('hex')
      .slice(0, 24);

    if (lead.card_collection_status === 'secured') {
      if (!clean(body.payment_consent)) return reply(res, 400, { error: 'Please confirm the secure card-save disclosure.' });
      await enrichPaymentMetadata(lead);
    }

    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(lead)) form.set(key, value);
    form.set('_subject', `Vacation callback lead: ${lead.first_name} ${lead.last_name} · ${lead.destination}`);
    form.set('_template', 'table');
    form.set('_replyto', lead.email);
    form.set('_url', lead.page_url || 'https://vacation-cinematic-lead-funnel.vercel.app/');
    form.set('_captcha', 'false');

    const response = await fetch(`https://formsubmit.co/${NOTIFY_EMAIL}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html,application/json',
        origin: 'https://vacation-cinematic-lead-funnel.vercel.app',
        referer: lead.page_url || 'https://vacation-cinematic-lead-funnel.vercel.app/',
        'user-agent': 'Mozilla/5.0 VacationPreviewAccess/3.0',
      },
      body: form.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });

    if (response.status >= 200 && response.status < 400) return reply(res, 200, { ok: true, lead_id: lead.lead_id });
    const detail = clean(await response.text().catch(() => ''), 240);
    console.error('FormSubmit delivery rejected', response.status, detail);
    return reply(res, 502, { error: 'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.' });
  } catch (error) {
    console.error('Lead submission failed', error);
    return reply(res, 502, { error: error.message || 'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.' });
  }
};
