const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/marcajes - registrar marcaje
router.post('/', authMiddleware, async (req, res) => {
  const { tipo, latitud, longitud } = req.body;

  if (!['entrada', 'salida'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo debe ser entrada o salida' });
  }

  // Obtener IP real del cliente
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'desconocida';

  try {
    // Verificar que no haya marcaje del mismo tipo hoy sin cerrar
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { rows: marcajesHoy } = await pool.query(
      `SELECT tipo FROM marcajes
       WHERE usuario_id = $1
         AND timestamp_servidor >= $2
       ORDER BY timestamp_servidor DESC
       LIMIT 1`,
      [req.user.id, hoy]
    );

    const ultimoTipo = marcajesHoy[0]?.tipo;

    if (tipo === 'entrada' && ultimoTipo === 'entrada') {
      return res.status(400).json({ error: 'Ya tienes una entrada registrada. Registra tu salida primero.' });
    }
    if (tipo === 'salida' && ultimoTipo !== 'entrada') {
      return res.status(400).json({ error: 'No tienes una entrada registrada hoy.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO marcajes (usuario_id, tipo, ip_cliente, latitud, longitud)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tipo, timestamp_servidor, ip_cliente, latitud, longitud`,
      [req.user.id, tipo, ip, latitud || null, longitud || null]
    );

    res.json({ ok: true, marcaje: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar marcaje' });
  }
});

// GET /api/marcajes/hoy - marcajes de hoy del usuario logueado
router.get('/hoy', authMiddleware, async (req, res) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  try {
    const { rows } = await pool.query(
      `SELECT tipo, timestamp_servidor, ip_cliente, latitud, longitud
       FROM marcajes
       WHERE usuario_id = $1 AND timestamp_servidor >= $2
       ORDER BY timestamp_servidor ASC`,
      [req.user.id, hoy]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener marcajes' });
  }
});

// GET /api/marcajes/historial?desde=&hasta= - historial propio
router.get('/historial', authMiddleware, async (req, res) => {
  const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const hasta = req.query.hasta || new Date().toISOString();

  try {
    const { rows } = await pool.query(
      `SELECT tipo, timestamp_servidor, ip_cliente, latitud, longitud
       FROM marcajes
       WHERE usuario_id = $1
         AND timestamp_servidor BETWEEN $2 AND $3
       ORDER BY timestamp_servidor ASC`,
      [req.user.id, desde, hasta]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
