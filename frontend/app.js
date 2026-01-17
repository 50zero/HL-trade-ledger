const DEFAULT_BASE_URL = 'http://localhost:3000';
const BASE_URL_KEY = 'hl_trade_ledger_base_url';

const baseUrlInput = document.getElementById('base-url-input');
const baseUrlForm = document.getElementById('base-url-form');
const baseUrlReset = document.getElementById('base-url-reset');
const baseUrlCurrent = document.getElementById('base-url-current');

const tradesForm = document.getElementById('trades-form');
const positionsForm = document.getElementById('positions-form');
const pnlForm = document.getElementById('pnl-form');
const leaderboardForm = document.getElementById('leaderboard-form');
const usersListForm = document.getElementById('users-list-form');
const usersRegisterForm = document.getElementById('users-register-form');
const usersDeleteForm = document.getElementById('users-delete-form');
const statusIndicator = document.getElementById('status-indicator');
const statusRefresh = document.getElementById('status-refresh');
const tradesMeta = document.getElementById('trades-meta');

const resultEls = {
  trades: document.getElementById('trades-result'),
  positions: document.getElementById('positions-result'),
  pnl: document.getElementById('pnl-result'),
  leaderboard: document.getElementById('leaderboard-result'),
  users: document.getElementById('users-result'),
};

const rangeButtons = document.querySelectorAll('.range-button');
const addressButtons = document.querySelectorAll('.address-button');
const expandButtons = document.querySelectorAll('.expand-button');

function getBaseUrl() {
  return localStorage.getItem(BASE_URL_KEY) || DEFAULT_BASE_URL;
}

function setBaseUrl(value) {
  const normalized = value.replace(/\/+$/, '');
  localStorage.setItem(BASE_URL_KEY, normalized);
  baseUrlCurrent.textContent = normalized;
  baseUrlInput.value = normalized;
}

function setResultState(el, state) {
  el.classList.remove('success', 'error', 'loading');
  if (state) {
    el.classList.add(state);
  }
}

function renderResult(el, payload, status) {
  const timestamp = new Date().toLocaleTimeString();
  el.textContent = JSON.stringify({ status, timestamp, data: payload }, null, 2);
}

async function requestJson(path, options = {}) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.message || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return payload;
}

function applyRangeToForm(form, hours) {
  const fromInput = form.querySelector('input[name="fromMs"]');
  const toInput = form.querySelector('input[name="toMs"]');
  if (!fromInput || !toInput) return;

  const nowMs = Date.now();
  const fromMs = nowMs - hours * 60 * 60 * 1000;
  fromInput.value = Math.floor(fromMs);
  toInput.value = Math.floor(nowMs);
}

function buildQuery(form) {
  const data = new FormData(form);
  const params = new URLSearchParams();

  for (const [key, rawValue] of data.entries()) {
    if (rawValue === '' || rawValue === null) continue;

    if (rawValue === 'on') {
      params.set(key, 'true');
      continue;
    }

    if (['fromMs', 'toMs', 'maxStartCapital', 'limit'].includes(key)) {
      const numberValue = Number(rawValue);
      if (!Number.isNaN(numberValue)) {
        params.set(key, String(numberValue));
      }
      continue;
    }

    params.set(key, String(rawValue).trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

async function handleFormRequest({
  form,
  resultEl,
  path,
  options = {},
}) {
  setResultState(resultEl, 'loading');
  resultEl.textContent = '';

  try {
    const query = form ? buildQuery(form) : '';
    const payload = await requestJson(`${path}${query}`, options);
    setResultState(resultEl, 'success');
    renderResult(resultEl, payload, 'ok');
    return payload;
  } catch (error) {
    setResultState(resultEl, 'error');
    renderResult(resultEl, { error: error.message }, 'error');
    return null;
  }
}

baseUrlForm.addEventListener('submit', event => {
  event.preventDefault();
  setBaseUrl(baseUrlInput.value || DEFAULT_BASE_URL);
});

baseUrlReset.addEventListener('click', () => {
  setBaseUrl(DEFAULT_BASE_URL);
});

rangeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const hours = Number(button.dataset.hours || 0);
    if (!hours) return;
    const form = button.closest('form');
    if (!form) return;
    applyRangeToForm(form, hours);
  });
});

addressButtons.forEach(button => {
  button.addEventListener('click', () => {
    const address = button.dataset.address;
    if (!address) return;
    document.querySelectorAll('input[name="user"]').forEach(input => {
      input.value = address;
    });
  });
});

tradesForm.addEventListener('submit', event => {
  event.preventDefault();
  handleFormRequest({
    form: tradesForm,
    resultEl: resultEls.trades,
    path: '/v1/trades',
  }).then(payload => {
    const count = payload?.trades?.length ?? 0;
    if (tradesMeta) {
      tradesMeta.textContent = `Trades: ${count}`;
    }
  });
});

positionsForm.addEventListener('submit', event => {
  event.preventDefault();
  handleFormRequest({
    form: positionsForm,
    resultEl: resultEls.positions,
    path: '/v1/positions/history',
  });
});

pnlForm.addEventListener('submit', event => {
  event.preventDefault();
  handleFormRequest({
    form: pnlForm,
    resultEl: resultEls.pnl,
    path: '/v1/pnl',
  });
});

leaderboardForm.addEventListener('submit', event => {
  event.preventDefault();
  handleFormRequest({
    form: leaderboardForm,
    resultEl: resultEls.leaderboard,
    path: '/v1/leaderboard',
  });
});

usersListForm.addEventListener('submit', event => {
  event.preventDefault();
  handleFormRequest({
    form: null,
    resultEl: resultEls.users,
    path: '/v1/users',
  });
});

usersRegisterForm.addEventListener('submit', event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(usersRegisterForm));

  handleFormRequest({
    form: null,
    resultEl: resultEls.users,
    path: '/v1/users',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  });
});

usersDeleteForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(usersDeleteForm);
  const user = formData.get('user');
  if (!user) {
    setResultState(resultEls.users, 'error');
    renderResult(resultEls.users, { error: 'User address is required.' }, 'error');
    return;
  }

  handleFormRequest({
    form: null,
    resultEl: resultEls.users,
    path: `/v1/users/${user}`,
    options: {
      method: 'DELETE',
    },
  });
});

expandButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.target;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    const isExpanded = target.classList.toggle('expanded');
    button.textContent = isExpanded ? 'Collapse' : 'Expand';
  });
});

async function pingHealth() {
  if (!statusIndicator) return;
  statusIndicator.textContent = 'checking';
  statusIndicator.classList.remove('idle', 'ok', 'error');
  statusIndicator.classList.add('idle');
  try {
    const payload = await requestJson('/health');
    statusIndicator.textContent = payload?.status || 'healthy';
    statusIndicator.classList.remove('idle');
    statusIndicator.classList.add('ok');
  } catch (error) {
    statusIndicator.textContent = 'offline';
    statusIndicator.classList.remove('idle');
    statusIndicator.classList.add('error');
  }
}

statusRefresh.addEventListener('click', () => {
  pingHealth();
});

setBaseUrl(getBaseUrl());
pingHealth();
