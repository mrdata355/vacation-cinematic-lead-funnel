function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' });

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return reply(res, 200, {
    publishableKey,
    cardCollectionEnabled: Boolean(publishableKey && secretKeyConfigured),
  });
};
