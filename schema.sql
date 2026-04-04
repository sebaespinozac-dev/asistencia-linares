-- schema.sql
-- Ejecutar una vez para inicializar la base de datos

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'empleado', -- 'admin' | 'empleado'
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marcajes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo VARCHAR(10) NOT NULL, -- 'entrada' | 'salida'
  timestamp_servidor TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_cliente VARCHAR(45),
  latitud DECIMAL(10, 8),
  longitud DECIMAL(11, 8),
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_marcajes_usuario ON marcajes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_marcajes_timestamp ON marcajes(timestamp_servidor);

-- Admin inicial (contraseña: Admin2024! - CAMBIAR INMEDIATAMENTE)
INSERT INTO usuarios (nombre, email, password_hash, rol)
VALUES (
  'Administrador',
  'admin@delegacion-linares.cl',
  '$2a$12$jB7CvjzBbHZgKe54fOFazuTuaJvblQMkvUz.1hV0.NfctxAd/3/dG',
  'admin'
) ON CONFLICT (email) DO NOTHING;
