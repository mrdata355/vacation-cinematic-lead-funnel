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

The current production API relays leads to FormSubmit by default. You can override the notification email with:

```text
LEAD_NOTIFY_TO=<lead-recipient-email>
PUBLIC_SITE_URL=https://your-production-domain
LEAD_HASH_SALT=<long-random-string>
```

## Secure card save through Stripe

The app supports saving a card for callback confirmation without charging it online. It uses Stripe.js in the browser and a Stripe SetupIntent in `/api/create-setup-intent`.

Add these Vercel environment variables in Production, Preview, and Development as needed:

```text
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

Behavior:

1. If both Stripe keys are present, the secure card step appears.
2. Card details are entered only in Stripe-hosted fields.
3. Vacation Preview Access receives only Stripe IDs and limited card metadata such as brand, last 4, and expiration.
4. The website creates no charge and no reservation.
5. A representative must review pricing, taxes, fees, restrictions, eligibility, and terms with the customer before any later charge.

When Stripe keys are missing, the card step is hidden and the callback funnel continues without collecting card data.

## Ad readiness checks

1. Confirm the phone number is correct.
2. Submit a test lead from the production domain.
3. Confirm the lead reaches the configured email inbox.
4. Add Stripe test keys and verify the secure card save before using live keys.
5. Test privacy and terms links.
6. Verify every advertised price and eligibility rule with the authorized provider.
7. Add approved analytics and pixels only after privacy and consent review.

Do not add ordinary HTML inputs for card numbers or CVC. Card data must stay inside Stripe-hosted fields.
