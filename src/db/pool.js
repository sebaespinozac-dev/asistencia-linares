const { Pool } = require('pg');
require('dotenv').config();

// Promesa de inicialización — garantiza que el pool esté listo antes de cualquier query
let initPromise = null;
let pool = null;

async function setupMemoryPool() {
  const { newDb } = require('pg-mem');
  const db = newDb();
  const { Pool: MemPool } = db.adapters.createPg();
  const memPool = new MemPool();

  const statements = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      rol VARCHAR(20) NOT NULL DEFAULT 'empleado',
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS marcajes (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo VARCHAR(10) NOT NULL,
      timestamp_servidor TIMESTAMP NOT NULL DEFAULT NOW(),
      ip_cliente VARCHAR(45),
      latitud DECIMAL(10,8),
      longitud DECIMAL(11,8),
      creado_en TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_marcajes_usuario ON marcajes(usuario_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marcajes_timestamp ON marcajes(timestamp_servidor)`,
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     SELECT 'Administrador',
            'admin@delegacion-linares.cl',
            '$2a$12$jB7CvjzBbHZgKe54fOFazuTuaJvblQMkvUz.1hV0.NfctxAd/3/dG',
            'admin'
     WHERE NOT EXISTS (
       SELECT 1 FROM usuarios WHERE email = 'admin@delegacion-linares.cl'
     )`
  ];

  for (const stmt of statements) {
    try {
      await memPool.query(stmt);
    } catch (e) {
      // ignorar si ya existe
    }
  }

  pool = memPool;
  console.log('⚠️  Modo demo activo (pg-mem). Los datos no persisten al reiniciar.');
  console.log('   Configure DATABASE_URL en .env para usar PostgreSQL real.');
}

async function initialize() {
  const dbUrl = process.env.DATABASE_URL;
  const isPlaceholder = !dbUrl
    || dbUrl.includes('usuario:contraseña')
    || dbUrl.includes('localhost:5432/asistencia_db');

  if (!isPlaceholder) {
    // Intentar PostgreSQL real
    const realPool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    });
    try {
      await realPool.query('SELECT 1');
      pool = realPool;
      pool.on('error', err => console.error('PostgreSQL error:', err));
      console.log('✅ Conectado a PostgreSQL real');
      return;
    } catch (err) {
      console.warn('⚠️  No se pudo conectar a PostgreSQL:', err.message);
      console.warn('   Cambiando a modo demo (pg-mem)...');
    }
  }

  await setupMemoryPool();
}

// Iniciar UNA sola vez — guardar la promesa para que todos esperen
function getPool() {
  if (!initPromise) {
    initPromise = initialize().catch(err => {
      console.error('Error crítico inicializando BD:', err);
      initPromise = null; // permitir reintento
      throw err;
    });
  }
  return initPromise;
}

// Iniciar inmediatamente al cargar el módulo
getPool();

// Exportar un proxy que siempre espera que el pool esté listo
module.exports = {
  query: async (...args) => {
    await getPool();
    if (!pool) throw new Error('Base de datos no inicializada');
    return pool.query(...args);
  },
  on: () => {}
};
