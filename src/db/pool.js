const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dns = require('dns');
const { promisify } = require('util');
require('dotenv').config();

const resolve4 = promisify(dns.resolve4);

let initPromise = null;
let pool = null;

async function seedOrgAdmins(p) {
  const hash = await bcrypt.hash('admin2026@', 12);
  const admins = [
    { nombre: 'Admin Residencia', email: 'admin@residenciatransitoria.cl', org: 'residencia' },
    { nombre: 'Admin Prevención',  email: 'admin@prevencionviolencia.cl',  org: 'prevencion'  },
  ];
  for (const a of admins) {
    await p.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, organizacion)
       VALUES ($1, $2, $3, 'admin', $4)
       ON CONFLICT (email) DO NOTHING`,
      [a.nombre, a.email, hash, a.org]
    );
  }
}

async function initialize() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('❌ DATABASE_URL no está configurado. Configure la variable de entorno antes de iniciar.');
  }

  const url = new URL(dbUrl);
  const ipv4Addresses = await resolve4(url.hostname);
  const ipv4Host = ipv4Addresses[0];
  console.log(`🔍 Resolviendo ${url.hostname} → ${ipv4Host}`);

  const realPool = new Pool({
    host: ipv4Host,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  await realPool.query('SELECT 1');
  pool = realPool;
  pool.on('error', err => console.error('PostgreSQL error:', err));
  console.log('✅ Conectado a PostgreSQL real (Supabase)');

  // Asegurar columna organizacion
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS organizacion TEXT`);

  // Sembrar admins de cada organización
  await seedOrgAdmins(pool);
}

function getPool() {
  if (!initPromise) {
    initPromise = initialize().catch(err => {
      console.error('Error crítico inicializando BD:', err.message);
      process.exit(1);
    });
  }
  return initPromise;
}

getPool();

module.exports = {
  query: async (...args) => {
    await getPool();
    if (!pool) throw new Error('Base de datos no inicializada');
    return pool.query(...args);
  },
  on: () => {}
};
