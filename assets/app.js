const form = document.querySelector('#vacationForm');
let steps = [...document.querySelectorAll('.step')];
const nextBtn = document.querySelector('#nextBtn');
const backBtn = document.querySelector('#backBtn');
const submitBtn = document.querySelector('#submitBtn');
const errorBox = document.querySelector('#formError');
const progressBar = document.querySelector('#progressBar');
const stepLabel = document.querySelector('#stepLabel');
const review = document.querySelector('#review');
const result = document.querySelector('#result');
const paymentStep = document.querySelector('[data-payment-step]');
const cardStatus = document.querySelector('#cardStatus');
const paymentCard = document.querySelector('#paymentCard');
let current = 0;
let stripe = null;
let cardElement = null;
let paymentReady = false;
let cardSecured = false;
let paymentConfigChecked = false;
const startedAt = Date.now();

function hidden(name, value) {
  let el = form.querySelector(`input[name="${name}"]`);
  if (!el) {
    el = document.createElement('input');
    el.type = 'hidden';
    el.name = name;
    form.appendChild(el);
  }
  el.value = value ?? '';
}

const params = new URLSearchParams(location.search);
const attributionKeys = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content'];
const cleanUrl = new URL(`${location.origin}${location.pathname}`);
attributionKeys.forEach((key) => {
  const item = params.get(key) || '';
  hidden(key, item);
  if (item) cleanUrl.searchParams.set(key, item.slice(0, 120));
});

const dateInput = form.elements.callback_date;
const tomorrow = new Date(Date.now() + 86400000);
if (dateInput) dateInput.min = tomorrow.toISOString().slice(0, 10);

function refreshSteps() {
  steps = [...document.querySelectorAll('.step')];
  current = Math.min(current, steps.length - 1);
}

function fieldsForStep() {
  return [...steps[current].querySelectorAll('input,select')]
    .filter((el) => el.type !== 'hidden' && el.name !== '_honey');
}

function setError(message = '') {
  errorBox.textContent = message;
}

function validateStep() {
  setError('');
  const fields = fieldsForStep();
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      setError('Please complete this step before continuing.');
      return false;
    }
  }
  return true;
}

function render() {
  refreshSteps();
  steps.forEach((step, index) => step.classList.toggle('active', index === current));
  progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
  stepLabel.textContent = `Step ${current + 1} of ${steps.length}`;
  backBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  nextBtn.classList.toggle('hidden', current === steps.length - 1);
  submitBtn.classList.toggle('hidden', current !== steps.length - 1);
  if (current === steps.length - 1) buildReview();
}

function value(name) {
  const item = form.elements[name];
  if (!item) return '';
  if (item instanceof RadioNodeList) return item.value;
  if (item.type === 'checkbox') return item.checked ? item.value || 'Yes' : '';
  return item.value;
}

function buildReview() {
  const paymentStatus = cardSecured
    ? 'Secure card saved with Stripe · $0 charged online'
    : 'Card not collected on website';
  review.innerHTML = [
    ['Offer', value('destination')],
    ['Travel window', value('travel_window')],
    ['Name', `${value('first_name')} ${value('last_name')}`],
    ['Phone', value('phone')],
    ['Callback', `${value('callback_date')} · ${value('callback_time')}`],
    ['Payment method', paymentStatus],
  ].map(([key, val]) => `<div><span>${key}</span><strong>${escapeHtml(val)}</strong></div>`).join('');
}

function escapeHtml(input = '') {
  return String(input).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function setBusy(isBusy, label = 'Continue') {
  nextBtn.disabled = isBusy;
  backBtn.disabled = isBusy;
  submitBtn.disabled = isBusy;
  if (!submitBtn.classList.contains('hidden')) submitBtn.textContent = isBusy ? 'Sending…' : 'Reserve Priority Callback';
  if (!nextBtn.classList.contains('hidden')) nextBtn.textContent = isBusy ? label : 'Continue';
}

async function configurePaymentStep() {
  hidden('card_collection_status', 'not_configured');
  if (!paymentStep) return;

  try {
    const response = await fetch('/api/stripe-config', { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.cardCollectionEnabled || !config.publishableKey || !window.Stripe) {
      throw new Error('Stripe is not configured yet.');
    }

    stripe = window.Stripe(config.publishableKey);
    const elements = stripe.elements({
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Inter' }],
    });
    cardElement = elements.create('card', {
      hidePostalCode: false,
      style: {
        base: {
          color: '#f8fbff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '16px',
          '::placeholder': { color: '#a7b8c7' },
        },
        invalid: { color: '#ff9fb0' },
      },
    });
    cardElement.mount('#stripeCardElement');
    cardElement.on('change', (event) => {
      if (event.error) {
        cardStatus.textContent = event.error.message;
        paymentCard.classList.remove('secured');
      } else {
        cardStatus.textContent = event.complete ? 'Card details ready to save securely.' : 'Enter card number, expiration, CVC, and ZIP.';
      }
    });
    paymentReady = true;
    paymentConfigChecked = true;
    hidden('card_collection_status', 'pending');
    cardStatus.textContent = 'Enter card number, expiration, CVC, and ZIP.';
  } catch (error) {
    paymentConfigChecked = true;
    paymentReady = false;
    if (paymentStep) paymentStep.remove();
    hidden('payment_processor', 'stripe_not_configured');
    hidden('card_collection_status', 'not_configured');
    refreshSteps();
    render();
  }
}

async function securePaymentMethod() {
  if (cardSecured) return true;
  if (!paymentReady || !stripe || !cardElement) {
    setError('Secure card collection is not active yet. Add the Stripe keys in Vercel, then redeploy.');
    return false;
  }

  setBusy(true, 'Securing card…');
  setError('');
  cardStatus.textContent = 'Creating secure card setup…';

  try {
    const response = await fetch('/api/create-setup-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: value('first_name'),
        last_name: value('last_name'),
        email: value('email'),
        phone: value('phone'),
        destination: value('destination'),
        callback_date: value('callback_date'),
        callback_time: value('callback_time'),
        page_url: cleanUrl.toString(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.clientSecret) throw new Error(data.error || 'Unable to start secure card setup.');

    const billingName = `${value('first_name')} ${value('last_name')}`.trim();
    const { setupIntent, error } = await stripe.confirmCardSetup(data.clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: billingName,
          email: value('email'),
          phone: value('phone'),
        },
      },
    });

    if (error) throw new Error(error.message || 'Card could not be saved.');
    if (!setupIntent || setupIntent.status !== 'succeeded') throw new Error('Card was not saved. Please check the card details.');

    cardSecured = true;
    hidden('stripe_customer_id', data.customerId || '');
    hidden('stripe_setup_intent_id', setupIntent.id || '');
    hidden('stripe_payment_method_id', setupIntent.payment_method || '');
    hidden('payment_secured_at', new Date().toISOString());
    hidden('card_collection_status', 'secured');
    hidden('payment_processor', 'stripe_setup_intent');
    cardStatus.textContent = 'Card securely saved with Stripe. $0 charged online.';
    paymentCard.classList.add('secured');
    return true;
  } catch (error) {
    setError(error.message || 'Unable to save card securely.');
    cardStatus.textContent = 'Card not saved. Please fix the card details or try again.';
    hidden('card_collection_status', 'failed');
    return false;
  } finally {
    setBusy(false);
  }
}

nextBtn.addEventListener('click', async () => {
  if (!validateStep()) return;

  const age = value('age_18_plus');
  const employment = value('employment');
  if ((current === 2 && age === 'No') || (current === 3 && employment === 'Full-time student')) {
    form.classList.add('hidden');
    result.classList.remove('hidden');
    result.innerHTML = '<h3>Thanks for checking.</h3><p>This specific promotion is not the right match at this time. No sales callback has been requested.</p>';
    return;
  }

  if (steps[current]?.dataset.paymentStep !== undefined) {
    const saved = await securePaymentMethod();
    if (!saved) return;
  }

  current = Math.min(current + 1, steps.length - 1);
  render();
});

backBtn.addEventListener('click', () => {
  setError('');
  current = Math.max(0, current - 1);
  render();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateStep()) return;

  setBusy(true, 'Sending…');
  setError('');

  hidden('submission_id', globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  hidden('browser_timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  hidden('page_url', cleanUrl.toString());
  hidden('facebook_click_id_present', params.has('fbclid') ? 'yes' : 'no');
  hidden('completed_in_ms', String(Date.now() - startedAt));
  hidden('consent_recorded_at', new Date().toISOString());
  hidden('consent_version', '2026-08-19-v5');
  hidden('compliance_notice', cardSecured ? 'Manual live promotional sales callback requested. Stripe payment method saved by SetupIntent. No charge or reservation created online.' : 'Manual live promotional sales callback requested. No card collected on website. No charge or reservation created online.');

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'We could not submit your request.');
    location.href = '/thanks.html';
  } catch (error) {
    setError(error.message || 'We could not submit your request. Please call (813) 524-8915.');
    setBusy(false);
  }
});

configurePaymentStep();
render();
