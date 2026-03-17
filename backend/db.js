const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'vetcare.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS owners (
      owner_id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_name TEXT NOT NULL,
      contact TEXT,
      password_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_contact_unique ON owners(contact)');

  db.all('PRAGMA table_info(owners)', (tableInfoError, columns) => {
    if (tableInfoError) {
      return;
    }

    const names = new Set(columns.map((column) => column.name));

    if (!names.has('password_hash')) {
      db.run('ALTER TABLE owners ADD COLUMN password_hash TEXT');
    }

    if (names.has('email')) {
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_email_unique ON owners(email)');
    }

    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_contact_unique ON owners(contact)');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS animals (
      animal_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      breed TEXT,
      age INTEGER,
      gender TEXT,
      microchip_id TEXT,
      owner_id INTEGER,
      owner_contact TEXT,
      vaccination_status TEXT,
      medical_alerts TEXT,
      registration_date TEXT,
      status TEXT,
      FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER,
      owner_id INTEGER,
      appointment_datetime TEXT NOT NULL,
      veterinarian TEXT,
      visit_type TEXT,
      visit_status TEXT,
      notes TEXT,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS examinations (
      exam_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER NOT NULL,
      symptoms TEXT,
      temperature REAL,
      pulse INTEGER,
      respiration INTEGER,
      weight REAL,
      physical_findings TEXT,
      diagnosis TEXT,
      clinical_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS treatments (
      treatment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER NOT NULL,
      exam_id INTEGER,
      medication_name TEXT,
      dosage TEXT,
      frequency TEXT,
      treatment_procedures TEXT,
      start_date TEXT,
      end_date TEXT,
      prescribing_veterinarian TEXT,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE,
      FOREIGN KEY (exam_id) REFERENCES examinations(exam_id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vaccinations (
      vaccination_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER NOT NULL,
      vaccine_name TEXT,
      preventive_treatment TEXT,
      administered_date TEXT,
      next_due_date TEXT,
      reminder_status TEXT,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS lab_tests (
      lab_test_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER NOT NULL,
      test_request_details TEXT,
      laboratory_results TEXT,
      reference_values TEXT,
      test_status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id INTEGER NOT NULL,
      service_charges REAL DEFAULT 0,
      medication_charges REAL DEFAULT 0,
      lab_charges REAL DEFAULT 0,
      total_amount REAL,
      payment_method TEXT,
      payment_status TEXT,
      invoice_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE
    )
  `);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

module.exports = {
  run,
  get,
  all,
};
