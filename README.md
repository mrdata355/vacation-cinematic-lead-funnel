# Vacation Preview Access

Cinematic, mobile-first promotional vacation lead funnel for Vercel.

## Offers

- Orlando: 4 days / 3 nights from $199
- Las Vegas: 4 days / 3 nights from $199
- Myrtle Beach: 4 days / 3 nights from $199
- Bahamas vacation + cruise preview opportunity from $299

All offers remain subject to eligibility, availability, taxes, fees, restrictions, complete terms, and any required vacation-preview presentation.

## Final production funnel

The form is optimized for fast customer signup and Zeely traffic.

The contact step collects:

- Name
- Email
- Mobile number
- Card brand: Visa, Mastercard, American Express, or Discover
- Last 4 card digits
- Expiration month/year

This project does not use Stripe or any payment processor. It does not collect full card numbers or CVC codes, and it does not create online authorizations, holds, charges, deposits, or reservations.

## Lead delivery

The production API relays leads to FormSubmit by default. You can override the notification email with:

```text
LEAD_NOTIFY_TO=<lead-recipient-email>
PUBLIC_SITE_URL=https://your-production-domain
LEAD_HASH_SALT=<long-random-string>
```

## Deploy on Vercel

Import this repository into Vercel and use the default framework setting (`Other`). No build command or package installation is required.

## Visual direction

The landing page includes tasteful lifestyle imagery for both calm vacation moods and high-energy vacation moments. Images load from the configured Unsplash image CDN allowlist in `vercel.json`.

## Ad readiness checks

1. Confirm the phone number is correct.
2. Submit a test lead from the production domain.
3. Confirm the lead reaches the configured email inbox.
4. Test privacy and terms links.
5. Verify every advertised price and eligibility rule with the authorized provider.
6. Add approved analytics and pixels only after privacy and consent review.
7. Do not add ordinary HTML inputs for full card numbers or CVC codes unless a PCI-compliant payment provider and legal/payment review are completed first.
