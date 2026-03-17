const moduleConfig = {
  owners: {
    id: 'owner_id',
    fields: ['owner_name', 'contact'],
  },
  animals: {
    id: 'animal_id',
    fields: [
      'name',
      'species',
      'breed',
      'age',
      'gender',
      'owner_id',
      'owner_contact',
      'vaccination_status',
      'medical_alerts',
      'registration_date',
      'status',
    ],
  },
  appointments: {
    id: 'appointment_id',
    fields: [
      'animal_id',
      'owner_id',
      'appointment_datetime',
      'veterinarian',
      'visit_type',
      'visit_status',
      'notes',
    ],
  },
  examinations: {
    id: 'exam_id',
    fields: [
      'animal_id',
      'symptoms',
      'temperature',
      'pulse',
      'respiration',
      'weight',
      'physical_findings',
      'diagnosis',
      'clinical_notes',
    ],
  },
  treatments: {
    id: 'treatment_id',
    fields: [
      'animal_id',
      'medication_name',
      'dosage',
      'frequency',
      'treatment_procedures',
      'start_date',
      'end_date',
      'prescribing_veterinarian',
    ],
  },
  vaccinations: {
    id: 'vaccination_id',
    fields: [
      'animal_id',
      'vaccine_name',
      'preventive_treatment',
      'administered_date',
      'next_due_date',
    ],
  },
  lab_tests: {
    id: 'lab_test_id',
    fields: [
      'animal_id',
      'test_request_details',
      'laboratory_results',
      'reference_values',
      'test_status',
    ],
  },
  invoices: {
    id: 'invoice_id',
    fields: [
      'animal_id',
      'service_charges',
      'medication_charges',
      'lab_charges',
      'total_amount',
      'payment_method',
      'payment_status',
    ],
  },
};

const moduleSelect = document.getElementById('moduleSelect');
const recordForm = document.getElementById('recordForm');
const recordsTable = document.getElementById('recordsTable');
const createBtn = document.getElementById('createBtn');
const updateBtn = document.getElementById('updateBtn');
const clearBtn = document.getElementById('clearBtn');
const summaryCards = document.getElementById('summaryCards');
const reportView = document.getElementById('reportView');
const invoiceView = document.getElementById('invoiceView');

const ownerSession = JSON.parse(localStorage.getItem('ownerSession') || 'null');
const sessionOwnerId = ownerSession?.owner_id ?? ownerSession?.ownerId ?? null;
const sessionOwnerContact = ownerSession?.contact ?? ownerSession?.owner_contact ?? '';
const sessionOwnerName = ownerSession?.owner_name ?? ownerSession?.ownerName ?? 'Owner';

if (!ownerSession || !sessionOwnerId) {
  window.location.href = '/login.html';
}

let selectedRecordId = null;
let animalsCache = [];
let dashboardRefreshTimer = null;
const DASHBOARD_REFRESH_MS = 10000;
const modulesWithAnimalRef = new Set([
  'appointments',
  'examinations',
  'treatments',
  'vaccinations',
  'lab_tests',
  'invoices',
]);

function toLabel(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function isDateField(name) {
  return name.includes('date') || name.includes('time') || name.includes('datetime');
}

function getTemporalInputType(fieldName) {
  if (fieldName.includes('datetime')) {
    return 'datetime-local';
  }
  if (fieldName.includes('date')) {
    return 'date';
  }
  if (fieldName.includes('time')) {
    return 'time';
  }
  return 'text';
}

async function loadAnimalsCache() {
  animalsCache = await api('/api/animals');
}

function getAnimalNameById(animalId) {
  const animal = animalsCache.find((item) => Number(item.animal_id) === Number(animalId));
  return animal ? animal.name : '';
}

function setFormMode(isCreateMode) {
  createBtn.hidden = !isCreateMode;
  updateBtn.hidden = isCreateMode;
}

function computeInvoiceTotalFromForm() {
  const service = Number(document.getElementById('field_service_charges')?.value || 0);
  const meds = Number(document.getElementById('field_medication_charges')?.value || 0);
  const lab = Number(document.getElementById('field_lab_charges')?.value || 0);
  const totalField = document.getElementById('field_total_amount');

  if (totalField) {
    totalField.value = (service + meds + lab).toFixed(2);
  }
}

function addSelectOptions(selectElement, options, placeholder) {
  selectElement.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = placeholder;
  selectElement.appendChild(emptyOption);

  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    selectElement.appendChild(option);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showEmptyReport(message) {
  reportView.innerHTML = `<p class="empty-note">${escapeHtml(message)}</p>`;
}

function renderBars(items, labelKey, valueKey) {
  if (!items || items.length === 0) {
    return '<p class="empty-note">No data available.</p>';
  }

  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  return items
    .map((item) => {
      const value = Number(item[valueKey] || 0);
      const width = Math.max((value / maxValue) * 100, 2);
      return `
        <div class="bar-row">
          <div class="bar-label">
            <span>${escapeHtml(item[labelKey] || 'Unknown')}</span>
            <span>${escapeHtml(value)}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join('');
}

function renderReportVisualization(type, data) {
  if (type === 'patient-statistics') {
    reportView.innerHTML = `
      <div class="viz-grid">
        <section class="viz-card">
          <h3>Patients by Species</h3>
          ${renderBars(data.bySpecies || [], 'species', 'count')}
        </section>
        <section class="viz-card">
          <h3>Patients by Status</h3>
          ${renderBars(data.byStatus || [], 'status', 'count')}
        </section>
      </div>
    `;
    return;
  }

  if (type === 'disease-trends') {
    reportView.innerHTML = `
      <section class="viz-card">
        <h3>Disease Trend Count</h3>
        ${renderBars(data || [], 'diagnosis', 'count')}
      </section>
    `;
    return;
  }

  if (type === 'vaccination-coverage') {
    const coverage = Number(data.coverage_percentage || 0);
    reportView.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><strong>Total Animals</strong><span>${escapeHtml(data.total_animals || 0)}</span></div>
        <div class="kpi"><strong>Vaccinated</strong><span>${escapeHtml(data.vaccinated_animals || 0)}</span></div>
        <div class="kpi"><strong>Coverage</strong><span>${coverage.toFixed(2)}%</span></div>
      </div>
      <section class="viz-card">
        <h3>Coverage Progress</h3>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(Math.max(coverage, 0), 100)}%"></div></div>
      </section>
    `;
    return;
  }

  if (type === 'revenue') {
    reportView.innerHTML = `
      <div class="viz-grid">
        <section class="viz-card">
          <h3>Revenue by Month</h3>
          ${renderBars(data.byMonth || [], 'month', 'revenue')}
        </section>
        <section class="viz-card">
          <h3>Revenue by Payment Status</h3>
          ${renderBars(data.byPaymentStatus || [], 'payment_status', 'amount')}
        </section>
      </div>
    `;
    return;
  }

  if (type === 'staff-activity') {
    reportView.innerHTML = `
      <div class="viz-grid">
        <section class="viz-card">
          <h3>Appointments Handled</h3>
          ${renderBars(data.appointments || [], 'staff', 'appointments_handled')}
        </section>
        <section class="viz-card">
          <h3>Treatments Prescribed</h3>
          ${renderBars(data.treatments || [], 'staff', 'treatments_prescribed')}
        </section>
      </div>
    `;
    return;
  }

  showEmptyReport('Unsupported report type.');
}

function populateInvoiceAnimalDropdown() {
  const invoiceAnimalSelect = document.getElementById('invoiceAnimalSelect');
  if (!invoiceAnimalSelect) {
    return;
  }

  invoiceAnimalSelect.innerHTML = '';
  addSelectOptions(
    invoiceAnimalSelect,
    animalsCache
      .slice()
      .reverse()
      .map((animal) => `${animal.animal_id}|${animal.name}`),
    'Select Animal Name'
  );

  Array.from(invoiceAnimalSelect.options).forEach((option) => {
    if (option.value.includes('|')) {
      const [id, name] = option.value.split('|');
      option.value = id;
      option.textContent = `${name} (#${id})`;
    }
  });
}

async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionOwnerId) {
    headers['x-owner-id'] = String(sessionOwnerId);
  }
  if (sessionOwnerContact) {
    headers['x-owner-contact'] = sessionOwnerContact;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const body = await response.json();
      details = body.error || details;
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(details);
  }

  return response.json();
}

function renderModuleOptions() {
  Object.keys(moduleConfig).forEach((moduleName) => {
    const opt = document.createElement('option');
    opt.value = moduleName;
    opt.textContent = toLabel(moduleName);
    moduleSelect.appendChild(opt);
  });
}

function buildForm(moduleName) {
  recordForm.innerHTML = '';
  selectedRecordId = null;
  setFormMode(true);

  const cfg = moduleConfig[moduleName];
  cfg.fields.forEach((fieldName) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.textContent = toLabel(fieldName);
    label.htmlFor = `field_${fieldName}`;

    let input;
    if (fieldName.includes('notes') || fieldName.includes('findings') || fieldName.includes('alerts') || fieldName.includes('details') || fieldName.includes('results') || fieldName.includes('reference') || fieldName.includes('procedures') || fieldName.includes('symptoms') || fieldName.includes('diagnosis')) {
      input = document.createElement('textarea');
    } else if (modulesWithAnimalRef.has(moduleName) && fieldName === 'animal_id') {
      input = document.createElement('select');
      addSelectOptions(
        input,
        animalsCache
          .slice()
          .reverse()
          .map((animal) => `${animal.animal_id}|${animal.name}`),
        'Select Animal Name'
      );
      Array.from(input.options).forEach((option) => {
        if (option.value.includes('|')) {
          const [id, name] = option.value.split('|');
          option.value = id;
          option.textContent = `${name} (#${id})`;
        }
      });
    } else if (moduleName === 'animals' && fieldName === 'gender') {
      input = document.createElement('select');
      addSelectOptions(input, ['male', 'female'], 'Select Gender');
    } else if (moduleName === 'animals' && fieldName === 'vaccination_status') {
      input = document.createElement('select');
      addSelectOptions(input, ['up-to-date', 'expired'], 'Select Vaccination Status');
    } else if (moduleName === 'animals' && fieldName === 'status') {
      input = document.createElement('select');
      addSelectOptions(input, ['active', 'inactive'], 'Select Status');
    } else if (moduleName === 'lab_tests' && fieldName === 'test_status') {
      input = document.createElement('select');
      addSelectOptions(input, ['on-process', 'completed'], 'Select Test Status');
    } else if (moduleName === 'invoices' && fieldName === 'payment_method') {
      input = document.createElement('select');
      addSelectOptions(input, ['Cash', 'Card', 'UPI', 'Bank Transfer'], 'Select Payment Method');
    } else if (moduleName === 'invoices' && fieldName === 'payment_status') {
      input = document.createElement('select');
      addSelectOptions(input, ['pending', 'received'], 'Select Payment Status');
    } else {
      input = document.createElement('input');
      if (moduleName === 'appointments' && fieldName === 'appointment_datetime') {
        input.type = 'date';
      } else {
        input.type = isDateField(fieldName) ? getTemporalInputType(fieldName) : 'text';
      }
      if (fieldName.includes('id') || fieldName.includes('age') || fieldName.includes('pulse') || fieldName.includes('respiration') || fieldName.includes('weight') || fieldName.includes('charges') || fieldName.includes('amount')) {
        input.type = 'number';
        input.step = 'any';
      }
    }

    input.id = `field_${fieldName}`;
    input.name = fieldName;

    if ((moduleName === 'animals' || moduleName === 'appointments') && fieldName === 'owner_id') {
      input.value = sessionOwnerId ?? '';
      input.readOnly = true;
    }

    if (moduleName === 'animals' && fieldName === 'owner_contact') {
      input.value = sessionOwnerContact;
      input.readOnly = true;
    }

    if (moduleName === 'invoices' && fieldName === 'total_amount') {
      input.readOnly = true;
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    recordForm.appendChild(wrapper);
  });

  if (moduleName === 'invoices') {
    ['service_charges', 'medication_charges', 'lab_charges'].forEach((fieldName) => {
      const chargeField = document.getElementById(`field_${fieldName}`);
      if (chargeField) {
        chargeField.addEventListener('input', computeInvoiceTotalFromForm);
      }
    });
    computeInvoiceTotalFromForm();
  }
}

function getFormData(moduleName) {
  const cfg = moduleConfig[moduleName];
  const payload = {};

  cfg.fields.forEach((field) => {
    const element = document.getElementById(`field_${field}`);
    if (!element) {
      return;
    }

    if (element.value !== '') {
      payload[field] = element.value;
    }
  });

  if ((moduleName === 'animals' || moduleName === 'appointments') && sessionOwnerId) {
    payload.owner_id = sessionOwnerId;
  }

  if (moduleName === 'animals' && sessionOwnerContact) {
    payload.owner_contact = sessionOwnerContact;
  }

  return payload;
}

function fillForm(moduleName, row) {
  const cfg = moduleConfig[moduleName];
  cfg.fields.forEach((field) => {
    const element = document.getElementById(`field_${field}`);
    if (element) {
      if (
        moduleName === 'animals' &&
        (field === 'gender' || field === 'vaccination_status' || field === 'status')
      ) {
        element.value = String(row[field] ?? '').toLowerCase();
      } else if (moduleName === 'appointments' && field === 'appointment_datetime') {
        const rawValue = String(row[field] ?? '');
        element.value = rawValue.includes('T') ? rawValue.split('T')[0] : rawValue.slice(0, 10);
      } else {
        element.value = row[field] ?? '';
      }
    }
  });

  if (moduleName === 'invoices') {
    computeInvoiceTotalFromForm();
  }

  selectedRecordId = row[cfg.id];
  setFormMode(false);
}

function clearForm(moduleName) {
  const cfg = moduleConfig[moduleName];
  cfg.fields.forEach((field) => {
    const element = document.getElementById(`field_${field}`);
    if (element) {
      element.value = '';
    }
  });

  const ownerIdElement = document.getElementById('field_owner_id');
  if (ownerIdElement && (moduleName === 'animals' || moduleName === 'appointments')) {
    ownerIdElement.value = sessionOwnerId ?? '';
  }

  const ownerContactElement = document.getElementById('field_owner_contact');
  if (ownerContactElement && moduleName === 'animals') {
    ownerContactElement.value = sessionOwnerContact;
  }

  if (moduleName === 'invoices') {
    computeInvoiceTotalFromForm();
  }

  selectedRecordId = null;
  setFormMode(true);
}

async function loadRecords() {
  const moduleName = moduleSelect.value;
  const cfg = moduleConfig[moduleName];
  if (modulesWithAnimalRef.has(moduleName) && animalsCache.length === 0) {
    await loadAnimalsCache();
  }
  const rows = await api(`/api/${moduleName}`);

  const displayFields =
    modulesWithAnimalRef.has(moduleName)
      ? cfg.fields.map((field) => (field === 'animal_id' ? 'animal_name' : field))
      : cfg.fields;
  const headers = [cfg.id, ...displayFields, 'actions'];
  const thead = recordsTable.querySelector('thead');
  const tbody = recordsTable.querySelector('tbody');

  thead.innerHTML = `<tr>${headers.map((h) => `<th>${toLabel(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = '';

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [cfg.id, ...displayFields]
      .map((field) => {
        if (modulesWithAnimalRef.has(moduleName) && field === 'animal_name') {
          return `<td>${getAnimalNameById(row.animal_id) || `#${row.animal_id}`}</td>`;
        }
        return `<td>${row[field] ?? ''}</td>`;
      })
      .join('');

    tr.innerHTML = `${cells}
      <td>
        <button class="small-btn" data-action="edit">Edit</button>
        <button class="small-btn delete-btn" data-action="delete">Delete</button>
      </td>`;

    tr.querySelector('[data-action="edit"]').addEventListener('click', () => {
      fillForm(moduleName, row);
    });

    tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await api(`/api/${moduleName}/${row[cfg.id]}`, { method: 'DELETE' });
      await loadRecords();
      await loadSummary();
    });

    tbody.appendChild(tr);
  });
}

async function loadSummary() {
  const summary = await api('/api/dashboard/summary');
  summaryCards.innerHTML = '';

  const labels = {
    animals: 'Registered Animals',
    activeAppointments: 'Active Appointments',
    pendingLab: 'Pending Lab Tests',
    unpaidInvoices: 'Unpaid Invoices',
  };

  Object.entries(summary).forEach(([key, value]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.innerHTML = `<h3>${labels[key] || key}</h3><p>${value}</p>`;
    summaryCards.appendChild(card);
  });
}

function startDashboardAutoRefresh() {
  if (dashboardRefreshTimer) {
    clearInterval(dashboardRefreshTimer);
  }

  dashboardRefreshTimer = setInterval(async () => {
    try {
      await loadSummary();
    } catch (error) {
      // Silent retry on next interval.
    }
  }, DASHBOARD_REFRESH_MS);
}

async function loadCalendar() {
  const month = document.getElementById('monthPicker').value;
  const container = document.getElementById('calendarGrid');
  container.innerHTML = '';

  if (!month) {
    return;
  }

  const appointments = await api(`/api/calendar/appointments?month=${month}`);
  const grouped = appointments.reduce((acc, appt) => {
    const day = new Date(appt.appointment_datetime).getDate();
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(appt);
    return acc;
  }, {});

  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const card = document.createElement('div');
    card.className = 'day-card';

    const items = grouped[day] || [];
    card.innerHTML = `<strong>${day}</strong>${items
      .map((item) => `${new Date(item.appointment_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${item.animal_name || `#${item.animal_id}`}`)
      .join('<br/>')}`;

    container.appendChild(card);
  }
}

async function generateInvoice() {
  const selectedAnimalId = document.getElementById('invoiceAnimalSelect')?.value;
  if (!selectedAnimalId) {
    return;
  }

  const invoices = await api('/api/invoices');
  const latestInvoice = invoices.find((invoice) => Number(invoice.animal_id) === Number(selectedAnimalId));

  if (!latestInvoice) {
    throw new Error('No invoice found for the selected animal');
  }

  const invoiceId = latestInvoice.invoice_id;

  const invoice = await api(`/api/invoices/${invoiceId}/generate`);
  const response = await fetch(`/api/invoices/${invoiceId}/generate-pdf`, {
    headers: {
      'x-owner-id': String(sessionOwnerId),
      'x-owner-contact': sessionOwnerContact,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to generate invoice PDF');
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `invoice-${invoiceId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);

  invoiceView.textContent = `PDF downloaded: invoice-${invoiceId}.pdf\n\n${JSON.stringify(invoice, null, 2)}`;
}

async function loadReport(type) {
  const data = await api(`/api/reports/${type}`);
  renderReportVisualization(type, data);
}

createBtn.addEventListener('click', async () => {
  try {
    const moduleName = moduleSelect.value;
    const cfg = moduleConfig[moduleName];
    const payload = getFormData(moduleName);

    if (selectedRecordId) {
      await api(`/api/${moduleName}/${selectedRecordId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      alert(`Updated existing ${toLabel(moduleName)} record (${cfg.id}: ${selectedRecordId}) instead of creating a duplicate.`);
    } else {
      await api(`/api/${moduleName}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    clearForm(moduleName);
    await loadRecords();
    await loadSummary();
  } catch (error) {
    alert(error.message);
  }
});

updateBtn.addEventListener('click', async () => {
  try {
    const moduleName = moduleSelect.value;
    const cfg = moduleConfig[moduleName];
    if (!selectedRecordId) {
      alert(`Select a ${cfg.id} from table using Edit first.`);
      return;
    }

    const payload = getFormData(moduleName);
    await api(`/api/${moduleName}/${selectedRecordId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    clearForm(moduleName);
    await loadRecords();
    await loadSummary();
  } catch (error) {
    alert(error.message);
  }
});

clearBtn.addEventListener('click', () => {
  clearForm(moduleSelect.value);
});

moduleSelect.addEventListener('change', async () => {
  if (modulesWithAnimalRef.has(moduleSelect.value)) {
    await loadAnimalsCache();
  }
  buildForm(moduleSelect.value);
  await loadRecords();
});

document.getElementById('loadCalendarBtn').addEventListener('click', async () => {
  await loadCalendar();
});

document.getElementById('generateInvoiceBtn').addEventListener('click', async () => {
  try {
    await generateInvoice();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelectorAll('.reportBtn').forEach((button) => {
  button.addEventListener('click', async () => {
    await loadReport(button.dataset.report);
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('ownerSession');
  window.location.href = '/login.html';
});

async function init() {
  if (!ownerSession || !sessionOwnerId) {
    return;
  }

  const ownerSessionText = document.getElementById('ownerSessionText');
  ownerSessionText.textContent = `Logged in as ${sessionOwnerName} (Owner ID: ${sessionOwnerId}, Contact: ${sessionOwnerContact})`;

  renderModuleOptions();
  moduleSelect.value = 'animals';
  await loadAnimalsCache();
  populateInvoiceAnimalDropdown();
  buildForm('animals');

  const now = new Date();
  document.getElementById('monthPicker').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  await loadSummary();
  startDashboardAutoRefresh();
  await loadRecords();
  await loadCalendar();
}

document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) {
    try {
      await loadSummary();
    } catch (error) {
      // Ignore refresh errors when returning to tab.
    }
  }
});

init().catch((error) => {
  showEmptyReport(error.message);
});
