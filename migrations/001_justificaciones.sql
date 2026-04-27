-- Migración: tabla justificaciones
-- Ejecutar una vez contra la base de datos PostgreSQL de producción

CREATE TABLE IF NOT EXISTS justificaciones (
  id              SERIAL PRIMARY KEY,
  funcionaria_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  motivo          TEXT NOT NULL,
  creado_por      INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_just_funcionaria ON justificaciones(funcionaria_id);
CREATE INDEX IF NOT EXISTS idx_just_fecha ON justificaciones(fecha);
