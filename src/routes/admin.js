const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const router = express.Router();
router.use(authMiddleware, adminOnly);

// GET /api/admin/usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/admin/usuarios - crear usuario
router.post('/usuarios', async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, activo, creado_en`,
      [nombre, email.toLowerCase().trim(), hash, rol || 'empleado']
    );
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PATCH /api/admin/usuarios/:id
router.patch('/usuarios/:id', async (req, res) => {
  const { nombre, email, activo, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        'UPDATE usuarios SET nombre=$1, email=$2, activo=$3, password_hash=$4 WHERE id=$5',
        [nombre, email, activo, hash, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nombre=$1, email=$2, activo=$3 WHERE id=$4',
        [nombre, email, activo, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// GET /api/admin/registros - todos los marcajes con filtros
router.get('/registros', async (req, res) => {
  const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const hasta = req.query.hasta || new Date().toISOString();
  const usuario_id = req.query.usuario_id;

  try {
    let query = `
      SELECT m.id, u.nombre, u.email, m.tipo, m.timestamp_servidor, m.ip_cliente, m.latitud, m.longitud
      FROM marcajes m
      JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.timestamp_servidor BETWEEN $1 AND $2
    `;
    const params = [desde, hasta];

    if (usuario_id) {
      query += ` AND m.usuario_id = $${params.length + 1}`;
      params.push(usuario_id);
    }

    query += ' ORDER BY m.timestamp_servidor DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

// GET /api/admin/reporte/excel
router.get('/reporte/excel', async (req, res) => {
  const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const hasta = req.query.hasta || new Date().toISOString();

  try {
    const { rows } = await pool.query(`
      SELECT u.nombre, m.tipo, m.timestamp_servidor, m.ip_cliente, m.latitud, m.longitud
      FROM marcajes m
      JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.timestamp_servidor BETWEEN $1 AND $2
      ORDER BY u.nombre, m.timestamp_servidor ASC
    `, [desde, hasta]);

    // Agrupar por usuario y día
    const resumen = {};
    for (const row of rows) {
      const fecha = new Date(row.timestamp_servidor).toLocaleDateString('es-CL');
      const key = `${row.nombre}__${fecha}`;
      if (!resumen[key]) resumen[key] = { nombre: row.nombre, fecha, entrada: null, salida: null };
      if (row.tipo === 'entrada' && !resumen[key].entrada) resumen[key].entrada = row.timestamp_servidor;
      if (row.tipo === 'salida') resumen[key].salida = row.timestamp_servidor;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ECOAVES - Sistema de Asistencia';
    const sheet = workbook.addWorksheet('Reporte de Asistencia');

    // Título
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Delegación Presidencial Provincial de Linares';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:E2');
    sheet.getCell('A2').value = `Reporte de Asistencia — ${new Date(desde).toLocaleDateString('es-CL')} al ${new Date(hasta).toLocaleDateString('es-CL')}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.addRow([]);

    // Encabezados
    const header = sheet.addRow(['Nombre', 'Fecha', 'Hora de Ingreso', 'Hora de Salida', 'Total Horas']);
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a5276' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    sheet.columns = [
      { key: 'nombre', width: 28 },
      { key: 'fecha', width: 14 },
      { key: 'entrada', width: 18 },
      { key: 'salida', width: 18 },
      { key: 'horas', width: 14 }
    ];

    for (const datos of Object.values(resumen)) {
      const horaEntrada = datos.entrada ? new Date(datos.entrada).toLocaleTimeString('es-CL') : '—';
      const horaSalida = datos.salida ? new Date(datos.salida).toLocaleTimeString('es-CL') : '—';
      let totalHoras = '—';
      if (datos.entrada && datos.salida) {
        const diff = (new Date(datos.salida) - new Date(datos.entrada)) / 3600000;
        totalHoras = `${diff.toFixed(2)} hrs`;
      }
      const row = sheet.addRow([datos.nombre, datos.fecha, horaEntrada, horaSalida, totalHoras]);
      row.eachCell(cell => { cell.alignment = { horizontal: 'center' }; });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-asistencia-${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel' });
  }
});

// GET /api/admin/reporte/pdf
router.get('/reporte/pdf', async (req, res) => {
  const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const hasta = req.query.hasta || new Date().toISOString();

  try {
    const { rows } = await pool.query(`
      SELECT u.nombre, m.tipo, m.timestamp_servidor
      FROM marcajes m
      JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.timestamp_servidor BETWEEN $1 AND $2
      ORDER BY u.nombre, m.timestamp_servidor ASC
    `, [desde, hasta]);

    const resumen = {};
    for (const row of rows) {
      const fecha = new Date(row.timestamp_servidor).toLocaleDateString('es-CL');
      const key = `${row.nombre}__${fecha}`;
      if (!resumen[key]) resumen[key] = { nombre: row.nombre, fecha, entrada: null, salida: null };
      if (row.tipo === 'entrada' && !resumen[key].entrada) resumen[key].entrada = row.timestamp_servidor;
      if (row.tipo === 'salida') resumen[key].salida = row.timestamp_servidor;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-asistencia-${Date.now()}.pdf`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(16).fillColor('#1a5276').text('Delegación Presidencial Provincial de Linares', { align: 'center' });
    doc.fontSize(12).fillColor('#333').text('Sistema Digital de Control de Asistencia', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(
      `Período: ${new Date(desde).toLocaleDateString('es-CL')} al ${new Date(hasta).toLocaleDateString('es-CL')}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    // Tabla
    const colWidths = [160, 70, 90, 90, 75];
    const headers = ['Nombre', 'Fecha', 'Hora Ingreso', 'Hora Salida', 'Total Horas'];
    let x = 50;

    // Header row
    doc.fillColor('#1a5276');
    headers.forEach((h, i) => {
      doc.rect(x, doc.y, colWidths[i], 20).fill();
      x += colWidths[i];
    });
    x = 50;
    const headerY = doc.y;
    headers.forEach((h, i) => {
      doc.fillColor('white').fontSize(9).text(h, x + 4, headerY + 5, { width: colWidths[i] - 8 });
      x += colWidths[i];
    });
    doc.moveDown(1.5);

    // Data rows
    let rowIdx = 0;
    for (const datos of Object.values(resumen)) {
      const horaEntrada = datos.entrada ? new Date(datos.entrada).toLocaleTimeString('es-CL') : '—';
      const horaSalida = datos.salida ? new Date(datos.salida).toLocaleTimeString('es-CL') : '—';
      let totalHoras = '—';
      if (datos.entrada && datos.salida) {
        const diff = (new Date(datos.salida) - new Date(datos.entrada)) / 3600000;
        totalHoras = `${diff.toFixed(2)} hrs`;
      }

      const cols = [datos.nombre, datos.fecha, horaEntrada, horaSalida, totalHoras];
      x = 50;
      const rowY = doc.y;

      if (rowIdx % 2 === 0) {
        doc.fillColor('#eaf2ff');
        doc.rect(50, rowY, 495, 18).fill();
      }

      cols.forEach((col, i) => {
        doc.fillColor('#222').fontSize(8).text(col, x + 4, rowY + 4, { width: colWidths[i] - 8 });
        x += colWidths[i];
      });

      doc.moveDown(1.2);
      rowIdx++;

      if (doc.y > 750) doc.addPage();
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').text(`Generado el ${new Date().toLocaleString('es-CL')} — Sistema ECOAVES`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

module.exports = router;
