# Vacation Preview Access

Cinematic, mobile-first promotional vacation lead funnel for Vercel.

## Offers

- Orlando: 4 days / 3 nights from $199
- Las Vegas: 4 days / 3 nights from $99
- Myrtle Beach: 4 days / 3 nights from $199
- Bahamas vacation + cruise preview opportunity from $299

All offers remain subject to eligibility, availability, taxes, fees, restrictions, complete terms, and any required vacation-preview presentation.

## Deploy on Vercel

Import this repository into Vercel and use the default framework setting (`Other`). No build command or package installation is required.

## Required lead delivery

Configure at least one delivery method before paid ads:

### Webhook

```text
LEAD_WEBHOOK_URL=https://your-secure-webhook
PUBLIC_SITE_URL=https://your-production-domain
LEAD_HASH_SALT=<long-random-string>
```

### Resend email

```text
RESEND_API_KEY=<secret>
LEAD_NOTIFY_TO=<lead-recipient-email>
LEAD_NOTIFY_FROM=<verified-sender-address>
PUBLIC_SITE_URL=https://your-production-domain
LEAD_HASH_SALT=<long-random-string>
```

When no delivery destination is configured, the site fails visibly and directs the visitor to call rather than claiming the lead was saved.

## Ad readiness checks

1. Confirm the phone number is correct.
2. Submit a test lead from the production domain.
3. Confirm the lead reaches the configured webhook or email inbox.
4. Test privacy and terms links.
5. Verify every advertised price and eligibility rule with the authorized provider.
6. Add approved analytics and pixels only after privacy and consent review.

This site does not collect payment-card, bank, government-ID, password, or loyalty-account data.