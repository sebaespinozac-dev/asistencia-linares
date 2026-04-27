const express = require('express');
const pool = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// POST /api/justificaciones - crear justificación (solo admin)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { funcionaria_id, fecha, motivo } = req.body;
  if (!funcionaria_id || !fecha || !motivo?.trim()) {
    return res.status(400).json({ error: 'funcionaria_id, fecha y motivo son requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO justificaciones (funcionaria_id, fecha, motivo, creado_por)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM usuarios WHERE id = $1 AND organizacion = $5)
       RETURNING *`,
      [funcionaria_id, fecha, motivo.trim(), req.user.id, req.user.organizacion]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Funcionaria no encontrada en esta organización' });
    res.json({ ok: true, justificacion: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar justificación' });
  }
});

// GET /api/justificaciones - todas las justificaciones (solo admin, con filtros)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const { funcionaria_id, desde, hasta } = req.query;
  try {
    let query = `
      SELECT j.id, j.fecha, j.motivo, j.created_at, j.funcionaria_id,
             u.nombre AS funcionaria_nombre, a.nombre AS admin_nombre
      FROM justificaciones j
      JOIN usuarios u ON j.funcionaria_id = u.id
      LEFT JOIN usuarios a ON j.creado_por = a.id
      WHERE u.organizacion = $1
    `;
    const params = [req.user.organizacion];
    if (funcionaria_id) { query += ` AND j.funcionaria_id = $${params.length + 1}`; params.push(funcionaria_id); }
    if (desde) { query += ` AND j.fecha >= $${params.length + 1}`; params.push(desde); }
    if (hasta) { query += ` AND j.fecha <= $${params.length + 1}`; params.push(hasta); }
    query += ' ORDER BY j.fecha DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener justificaciones' });
  }
});

// GET /api/justificaciones/:funcionaria_id - justificaciones de una funcionaria (admin o la propia usuaria)
router.get('/:funcionaria_id', authMiddleware, async (req, res) => {
  const fid = parseInt(req.params.funcionaria_id);
  if (req.user.rol !== 'admin' && req.user.id !== fid) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const { desde, hasta } = req.query;
  try {
    let query = `
      SELECT j.id, j.fecha, j.motivo, j.created_at,
             u.nombre AS funcionaria_nombre, a.nombre AS admin_nombre
      FROM justificaciones j
      JOIN usuarios u ON j.funcionaria_id = u.id
      LEFT JOIN usuarios a ON j.creado_por = a.id
      WHERE j.funcionaria_id = $1 AND u.organizacion = $2
    `;
    const params = [fid, req.user.organizacion];
    if (desde) { query += ` AND j.fecha >= $${params.length + 1}`; params.push(desde); }
    if (hasta) { query += ` AND j.fecha <= $${params.length + 1}`; params.push(hasta); }
    query += ' ORDER BY j.fecha DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener justificaciones' });
  }
});

module.exports = router;
