/**
 * Rutas de diagnóstico TEMPORALES — eliminar después de resolver el problema
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/debug/users — muestra usuarios sin exponer hashes
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, organizacion, activo, creado_en FROM usuarios ORDER BY id'
    );
    res.json({ ok: true, total: rows.length, usuarios: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/debug/reset — fuerza reset de contraseñas de ambos admins
// Body: { secret: "reset2026" }
router.post('/reset', async (req, res) => {
  if (req.body?.secret !== 'reset2026') {
    return res.status(403).json({ error: 'Clave incorrecta' });
  }
  try {
    const hash = await bcrypt.hash('admin2026@', 12);
    const admins = [
      { nombre: 'Admin Residencia', email: 'admin@residenciatransitoria.cl', org: 'residencia' },
      { nombre: 'Admin Prevención',  email: 'admin@prevencionviolencia.cl',  org: 'prevencion'  },
    ];
    const resultados = [];
    for (const a of admins) {
      const { rowCount } = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, organizacion, activo)
         VALUES ($1, $2, $3, 'admin', $4, true)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               activo = true,
               organizacion = EXCLUDED.organizacion`,
        [a.nombre, a.email, hash, a.org]
      );
      resultados.push({ email: a.email, ok: rowCount > 0 });
    }
    res.json({ ok: true, password: 'admin2026@', resultados });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
