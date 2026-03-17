const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const resources = {
  owners: {
    table: 'owners',
    id: 'owner_id',
    fields: ['owner_name', 'contact', 'password_hash'],
  },
  animals: {
    table: 'animals',
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
    table: 'appointments',
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
    table: 'examinations',
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
    table: 'treatments',
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
    table: 'vaccinations',
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
    table: 'lab_tests',
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
    table: 'invoices',
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

function pickFields(body, fields) {
  const picked = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      picked[field] = body[field];
    }
  });
  return picked;
}

function computeInvoiceTotal(payload) {
  const service = Number(payload.service_charges || 0);
  const meds = Number(payload.medication_charges || 0);
  const lab = Number(payload.lab_charges || 0);
  return service + meds + lab;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getSessionOwner(req) {
  const rawOwnerId = req.header('x-owner-id');
  const ownerId = rawOwnerId ? Number(rawOwnerId) : null;
  if (!ownerId || Number.isNaN(ownerId)) {
    return null;
  }

  return {
    owner_id: ownerId,
    contact: req.header('x-owner-contact') || null,
  };
}

function sanitizeRow(resourceTable, row) {
  if (!row) {
    return row;
  }

  if (resourceTable === 'owners') {
    delete row.password_hash;
  }

  if (resourceTable === 'animals') {
    delete row.microchip_id;
  }

  return row;
}

app.post('/api/auth/register', async (req, res) => {
  const { owner_name, contact, password } = req.body || {};
  if (!owner_name || !contact || !password) {
    res.status(400).json({ error: 'owner_name, contact, and password are required' });
    return;
  }

  try {
    const password_hash = hashPassword(password);
    const result = await db.run(
      'INSERT INTO owners (owner_name, contact, password_hash) VALUES (?, ?, ?)',
      [owner_name, contact, password_hash]
    );

    const owner = await db.get(
      'SELECT owner_id, owner_name, contact, created_at FROM owners WHERE owner_id = ?',
      [result.id]
    );

    res.status(201).json(owner);
  } catch (error) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
      res.status(409).json({ error: 'Owner already exists with this contact' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { contact, password } = req.body || {};
  if (!contact || !password) {
    res.status(400).json({ error: 'contact and password are required' });
    return;
  }

  try {
    const password_hash = hashPassword(password);
    const owner = await db.get(
      `
      SELECT owner_id, owner_name, contact, created_at
      FROM owners
      WHERE contact = ? AND password_hash = ?
      `,
      [contact, password_hash]
    );

    if (!owner) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.json(owner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const [animals, appointments, pendingLab, unpaidInvoices] = await Promise.all([
      db.get('SELECT COUNT(*) AS count FROM animals'),
      db.get("SELECT COUNT(*) AS count FROM appointments WHERE visit_status IN ('Scheduled', 'In Progress')"),
      db.get(
        "SELECT COUNT(*) AS count FROM lab_tests WHERE test_status IS NULL OR LOWER(TRIM(test_status)) != 'completed'"
      ),
      db.get(
        "SELECT COUNT(*) AS count FROM invoices WHERE payment_status IS NULL OR LOWER(TRIM(payment_status)) NOT IN ('paid', 'received')"
      ),
    ]);

    res.json({
      animals: animals?.count || 0,
      activeAppointments: appointments?.count || 0,
      pendingLab: pendingLab?.count || 0,
      unpaidInvoices: unpaidInvoices?.count || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search/animals', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  try {
    const rows = await db.all(
      `
      SELECT a.*, o.owner_name
      FROM animals a
      LEFT JOIN owners o ON a.owner_id = o.owner_id
      WHERE LOWER(a.name) LIKE ?
         OR LOWER(a.species) LIKE ?
         OR LOWER(COALESCE(o.owner_name, '')) LIKE ?
      ORDER BY a.animal_id DESC
      `,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search/owners', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  try {
    const rows = await db.all(
      `
      SELECT owner_id, owner_name, contact, created_at FROM owners
      WHERE LOWER(owner_name) LIKE ?
         OR LOWER(COALESCE(contact, '')) LIKE ?
      ORDER BY owner_id DESC
      `,
      [`%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calendar/appointments', async (req, res) => {
  const month = (req.query.month || '').toString();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'month is required in YYYY-MM format' });
    return;
  }

  try {
    const rows = await db.all(
      `
      SELECT ap.*, a.name AS animal_name
      FROM appointments ap
      LEFT JOIN animals a ON ap.animal_id = a.animal_id
      WHERE strftime('%Y-%m', ap.appointment_datetime) = ?
      ORDER BY ap.appointment_datetime ASC
      `,
      [month]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id/generate', async (req, res) => {
  try {
    const row = await db.get(
      `
      SELECT i.*, a.name AS animal_name, o.owner_name, o.contact
      FROM invoices i
      LEFT JOIN animals a ON i.animal_id = a.animal_id
      LEFT JOIN owners o ON a.owner_id = o.owner_id
      WHERE i.invoice_id = ?
      `,
      [req.params.id]
    );

    if (!row) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const computedTotal =
      Number(row.total_amount || 0) ||
      Number(row.service_charges || 0) + Number(row.medication_charges || 0) + Number(row.lab_charges || 0);

    res.json({
      ...row,
      total_amount: computedTotal,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id/generate-pdf', async (req, res) => {
  try {
    const row = await db.get(
      `
      SELECT i.*, a.name AS animal_name, o.owner_name, o.contact
      FROM invoices i
      LEFT JOIN animals a ON i.animal_id = a.animal_id
      LEFT JOIN owners o ON a.owner_id = o.owner_id
      WHERE i.invoice_id = ?
      `,
      [req.params.id]
    );

    if (!row) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const computedTotal =
      Number(row.total_amount || 0) ||
      Number(row.service_charges || 0) + Number(row.medication_charges || 0) + Number(row.lab_charges || 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `invoice-${row.invoice_id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 110).fill('#1F7A57');

    doc
      .fillColor('#FFFFFF')
      .fontSize(24)
      .text('Veterinary Care Invoice', 40, 36, { align: 'left' })
      .fontSize(12)
      .text('Veterinary Care for Animal Medical Solution', 40, 68);

    doc
      .fillColor('#15231B')
      .fontSize(11)
      .text(`Invoice #: ${row.invoice_id}`, 40, 130)
      .text(`Invoice Date: ${String(row.invoice_date || '').slice(0, 10) || 'N/A'}`, 40, 148)
      .text(`Generated At: ${new Date().toISOString().slice(0, 10)}`, 40, 166);

    doc
      .fontSize(12)
      .fillColor('#1F7A57')
      .text('Billed To', 40, 206)
      .fillColor('#15231B')
      .fontSize(11)
      .text(`Owner: ${row.owner_name || 'N/A'}`, 40, 226)
      .text(`Contact: ${row.contact || 'N/A'}`, 40, 244)
      .text(`Animal: ${row.animal_name || `#${row.animal_id}`}`, 40, 262);

    const tableTop = 310;
    const col1X = 40;
    const col2X = 430;

    doc.rect(40, tableTop, 515, 26).fill('#E8F4EE');
    doc
      .fillColor('#0F4D36')
      .fontSize(11)
      .text('Description', col1X + 8, tableTop + 8)
      .text('Amount', col2X + 8, tableTop + 8);

    const lineItems = [
      ['Service Charges', Number(row.service_charges || 0)],
      ['Medication Charges', Number(row.medication_charges || 0)],
      ['Lab Charges', Number(row.lab_charges || 0)],
    ];

    let currentY = tableTop + 26;
    lineItems.forEach((item, index) => {
      const rowShade = index % 2 === 0 ? '#FFFFFF' : '#F8FBF9';
      doc.rect(40, currentY, 515, 28).fill(rowShade);
      doc
        .fillColor('#15231B')
        .fontSize(11)
        .text(item[0], col1X + 8, currentY + 8)
        .text(item[1].toFixed(2), col2X + 8, currentY + 8);
      currentY += 28;
    });

    doc.rect(40, currentY, 515, 34).fill('#1F7A57');
    doc
      .fillColor('#FFFFFF')
      .fontSize(13)
      .text('Total Amount', col1X + 8, currentY + 10)
      .text(computedTotal.toFixed(2), col2X + 8, currentY + 10);

    currentY += 52;

    doc
      .fillColor('#15231B')
      .fontSize(11)
      .text(`Payment Method: ${row.payment_method || 'N/A'}`, 40, currentY)
      .text(`Payment Status: ${row.payment_status || 'N/A'}`, 40, currentY + 18)
      .text('Thank you for trusting our veterinary care.', 40, currentY + 50, { align: 'center', width: 515 });

    doc.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/patient-statistics', async (req, res) => {
  try {
    const bySpecies = await db.all(
      'SELECT species, COUNT(*) AS count FROM animals GROUP BY species ORDER BY count DESC'
    );
    const byStatus = await db.all(
      'SELECT status, COUNT(*) AS count FROM animals GROUP BY status ORDER BY count DESC'
    );
    res.json({ bySpecies, byStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/disease-trends', async (req, res) => {
  try {
    const trends = await db.all(
      `
      SELECT diagnosis, COUNT(*) AS count
      FROM examinations
      WHERE diagnosis IS NOT NULL AND diagnosis != ''
      GROUP BY diagnosis
      ORDER BY count DESC
      `
    );
    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/vaccination-coverage', async (req, res) => {
  try {
    const totals = await db.get('SELECT COUNT(*) AS total_animals FROM animals');
    const vaccinated = await db.get(
      "SELECT COUNT(*) AS vaccinated_animals FROM animals WHERE LOWER(COALESCE(vaccination_status, '')) IN ('up-to-date', 'complete', 'yes', 'vaccinated')"
    );

    const total = Number(totals?.total_animals || 0);
    const done = Number(vaccinated?.vaccinated_animals || 0);

    res.json({
      total_animals: total,
      vaccinated_animals: done,
      coverage_percentage: total === 0 ? 0 : Number(((done / total) * 100).toFixed(2)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/revenue', async (req, res) => {
  try {
    const byMonth = await db.all(
      `
      SELECT strftime('%Y-%m', invoice_date) AS month, SUM(total_amount) AS revenue
      FROM invoices
      GROUP BY strftime('%Y-%m', invoice_date)
      ORDER BY month ASC
      `
    );

    const byPaymentStatus = await db.all(
      `
      SELECT payment_status, SUM(total_amount) AS amount
      FROM invoices
      GROUP BY payment_status
      `
    );

    res.json({ byMonth, byPaymentStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/staff-activity', async (req, res) => {
  try {
    const appointments = await db.all(
      `
      SELECT veterinarian AS staff, COUNT(*) AS appointments_handled
      FROM appointments
      WHERE veterinarian IS NOT NULL AND veterinarian != ''
      GROUP BY veterinarian
      ORDER BY appointments_handled DESC
      `
    );

    const treatments = await db.all(
      `
      SELECT prescribing_veterinarian AS staff, COUNT(*) AS treatments_prescribed
      FROM treatments
      WHERE prescribing_veterinarian IS NOT NULL AND prescribing_veterinarian != ''
      GROUP BY prescribing_veterinarian
      ORDER BY treatments_prescribed DESC
      `
    );

    res.json({ appointments, treatments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:resource', async (req, res) => {
  try {
    const resource = resources[req.params.resource];
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const rows = await db.all(`SELECT * FROM ${resource.table} ORDER BY ${resource.id} DESC`);
    rows.forEach((row) => sanitizeRow(resource.table, row));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:resource/:id', async (req, res) => {
  try {
    const resource = resources[req.params.resource];
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const row = await db.get(`SELECT * FROM ${resource.table} WHERE ${resource.id} = ?`, [req.params.id]);
    if (!row) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    res.json(sanitizeRow(resource.table, row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:resource', async (req, res) => {
  try {
    const resource = resources[req.params.resource];
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const payload = pickFields(req.body, resource.fields);
    const sessionOwner = getSessionOwner(req);

    if (resource.table === 'animals' && sessionOwner) {
      payload.owner_id = sessionOwner.owner_id;
      if (!payload.owner_contact && sessionOwner.contact) {
        payload.owner_contact = sessionOwner.contact;
      }
    }

    if (resource.table === 'appointments' && sessionOwner) {
      payload.owner_id = sessionOwner.owner_id;
    }

    if (resource.table === 'invoices' && (payload.total_amount === undefined || payload.total_amount === null || payload.total_amount === '')) {
      payload.total_amount = computeInvoiceTotal(payload);
    }

    const keys = Object.keys(payload);
    if (keys.length === 0) {
      res.status(400).json({ error: 'No valid fields provided' });
      return;
    }

    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((key) => payload[key]);

    const result = await db.run(
      `INSERT INTO ${resource.table} (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const created = await db.get(
      `SELECT * FROM ${resource.table} WHERE ${resource.id} = ?`,
      [result.id]
    );

    res.status(201).json(sanitizeRow(resource.table, created));
  } catch (error) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
      res.status(409).json({ error: 'Duplicate value violates unique constraint' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/:resource/:id', async (req, res) => {
  try {
    const resource = resources[req.params.resource];
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const payload = pickFields(req.body, resource.fields);
    const sessionOwner = getSessionOwner(req);

    if (resource.table === 'animals' && sessionOwner) {
      payload.owner_id = sessionOwner.owner_id;
      if (!payload.owner_contact && sessionOwner.contact) {
        payload.owner_contact = sessionOwner.contact;
      }
    }

    if (resource.table === 'appointments' && sessionOwner) {
      payload.owner_id = sessionOwner.owner_id;
    }

    if (resource.table === 'invoices' && (payload.total_amount === undefined || payload.total_amount === null || payload.total_amount === '')) {
      payload.total_amount = computeInvoiceTotal(payload);
    }

    const keys = Object.keys(payload);
    if (keys.length === 0) {
      res.status(400).json({ error: 'No valid fields provided' });
      return;
    }

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => payload[key]);
    values.push(req.params.id);

    const result = await db.run(
      `UPDATE ${resource.table} SET ${setClause} WHERE ${resource.id} = ?`,
      values
    );

    if (result.changes === 0) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    const updated = await db.get(
      `SELECT * FROM ${resource.table} WHERE ${resource.id} = ?`,
      [req.params.id]
    );

    res.json(sanitizeRow(resource.table, updated));
  } catch (error) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
      res.status(409).json({ error: 'Duplicate value violates unique constraint' });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/:resource/:id', async (req, res) => {
  try {
    const resource = resources[req.params.resource];
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const result = await db.run(
      `DELETE FROM ${resource.table} WHERE ${resource.id} = ?`,
      [req.params.id]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Veterinary Care app running on http://localhost:${PORT}`);
});
