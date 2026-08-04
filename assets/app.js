const form = document.querySelector('#vacationForm');
const steps = [...document.querySelectorAll('.step')];
const nextBtn = document.querySelector('#nextBtn');
const backBtn = document.querySelector('#backBtn');
const submitBtn = document.querySelector('#submitBtn');
const errorBox = document.querySelector('#formError');
const progressBar = document.querySelector('#progressBar');
const stepLabel = document.querySelector('#stepLabel');
const review = document.querySelector('#review');
const result = document.querySelector('#result');
let current = 0;
const startedAt = Date.now();

function hidden(name, value) {
  let el = form.querySelector(`input[name="${name}"]`);
  if (!el) {
    el = document.createElement('input');
    el.type = 'hidden';
    el.name = name;
    form.appendChild(el);
  }
  el.value = value;
}

const params = new URLSearchParams(location.search);
const attributionKeys = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content'];
const cleanUrl = new URL(`${location.origin}${location.pathname}`);
attributionKeys.forEach((key) => {
  const value = params.get(key) || '';
  hidden(key, value);
  if (value) cleanUrl.searchParams.set(key, value.slice(0, 120));
});

const dateInput = form.elements.callback_date;
const tomorrow = new Date(Date.now() + 86400000);
dateInput.min = tomorrow.toISOString().slice(0, 10);

function fieldsForStep() {
  return [...steps[current].querySelectorAll('input,select')]
    .filter((el) => el.type !== 'hidden' && el.name !== '_honey');
}

function validateStep() {
  errorBox.textContent = '';
  const fields = fieldsForStep();
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      errorBox.textContent = 'Please complete this step before continuing.';
      return false;
    }
  }
  return true;
}

function render() {
  steps.forEach((step, index) => step.classList.toggle('active', index === current));
  progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
  stepLabel.textContent = `Step ${current + 1} of ${steps.length}`;
  backBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  nextBtn.classList.toggle('hidden', current === steps.length - 1);
  submitBtn.classList.toggle('hidden', current !== steps.length - 1);
  if (current === steps.length - 1) buildReview();
  steps[current].querySelector('legend')?.focus?.();
}

function value(name) {
  const item = form.elements[name];
  if (!item) return '';
  if (item instanceof RadioNodeList) return item.value;
  return item.value;
}

function buildReview() {
  review.innerHTML = [
    ['Offer', value('destination')],
    ['Travel window', value('travel_window')],
    ['Name', `${value('first_name')} ${value('last_name')}`],
    ['Phone', value('phone')],
    ['Callback', `${value('callback_date')} · ${value('callback_time')}`],
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

nextBtn.addEventListener('click', () => {
  if (!validateStep()) return;
  const age = value('age_18_plus');
  const employment = value('employment');
  if ((current === 2 && age === 'No') || (current === 3 && employment === 'Full-time student')) {
    form.classList.add('hidden');
    result.classList.remove('hidden');
    result.innerHTML = '<h3>Thanks for checking.</h3><p>This specific promotion is not the right match at this time. No sales callback has been requested.</p>';
    return;
  }
  current = Math.min(current + 1, steps.length - 1);
  render();
});

backBtn.addEventListener('click', () => {
  errorBox.textContent = '';
  current = Math.max(0, current - 1);
  render();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateStep()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  errorBox.textContent = '';

  hidden('_subject', `Vacation callback lead: ${value('first_name')} ${value('last_name')} · ${value('destination')}`);
  hidden('_replyto', value('email'));
  hidden('submission_id', globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  hidden('browser_timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  hidden('page_url', cleanUrl.toString());
  hidden('facebook_click_id_present', params.has('fbclid') ? 'yes' : 'no');
  hidden('completed_in_ms', String(Date.now() - startedAt));
  hidden('consent_recorded_at', new Date().toISOString());
  hidden('consent_version', '2026-08-04-v4');
  hidden('compliance_notice', 'Manual live promotional sales callback requested. No payment card collected and no charge or reservation created.');

  form.submit();
});

render();
