const crypto = require('crypto');

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

async function stripeForm(path, body) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('Stripe secret key is not configured.');

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, value);
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || 'Stripe request failed.';
    throw new Error(message);
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
  if (!process.env.STRIPE_PUBLISHABLE_KEY || !process.env.STRIPE_SECRET_KEY) {
    return reply(res, 503, { error: 'Secure card collection is not active yet. Add Stripe keys in Vercel.' });
  }

  try {
    const body = await readBody(req);
    const firstName = clean(body.first_name, 120);
    const lastName = clean(body.last_name, 120);
    const email = clean(body.email, 180).toLowerCase();
    const phone = clean(body.phone, 40);
    const destination = clean(body.destination, 180);
    const callbackDate = clean(body.callback_date, 40);
    const callbackTime = clean(body.callback_time, 40);

    if (!firstName || !lastName || !email || !phone) {
      return reply(res, 400, { error: 'Name, email, and phone are required before saving a card.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(res, 400, { error: 'Enter a valid email address before saving a card.' });
    }

    const metadata = {
      lead_session_id: crypto.randomUUID(),
      destination,
      callback_date: callbackDate,
      callback_time: callbackTime,
      charge_policy: 'No online charge. Charge only after live callback approval.',
      source_site: 'vacation-cinematic-lead-funnel.vercel.app',
    };

    const customer = await stripeForm('/v1/customers', {
      name: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      'metadata[destination]': destination,
      'metadata[callback_date]': callbackDate,
      'metadata[callback_time]': callbackTime,
      'metadata[source_site]': metadata.source_site,
    });

    const setupIntent = await stripeForm('/v1/setup_intents', {
      customer: customer.id,
      usage: 'off_session',
      description: 'Vacation Preview Access callback payment method save. No charge at website submission.',
      'payment_method_types[]': 'card',
      'metadata[lead_session_id]': metadata.lead_session_id,
      'metadata[destination]': metadata.destination,
      'metadata[callback_date]': metadata.callback_date,
      'metadata[callback_time]': metadata.callback_time,
      'metadata[charge_policy]': metadata.charge_policy,
      'metadata[source_site]': metadata.source_site,
    });

    return reply(res, 200, {
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.error('Stripe SetupIntent failed', error);
    return reply(res, 502, { error: error.message || 'Unable to start secure card setup.' });
  }
};
