# Sistema de Control de Asistencia
## Guía de Despliegue — VPS Linux (Ubuntu/Debian)

---

## 1. REQUISITOS DEL SERVIDOR

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Nginx
sudo apt-get install -y nginx

# PM2 (gestor de procesos)
sudo npm install -g pm2
```

---

## 2. BASE DE DATOS

```bash
# Crear usuario y base de datos
sudo -u postgres psql

CREATE USER asistencia_user WITH PASSWORD 'contraseña_segura_aqui';
CREATE DATABASE asistencia_db OWNER asistencia_user;
GRANT ALL PRIVILEGES ON DATABASE asistencia_db TO asistencia_user;
\q

# Cargar esquema
psql -U asistencia_user -d asistencia_db -h localhost -f /ruta/al/schema.sql
```

---

## 3. INSTALACIÓN DE LA APP

```bash
# Subir archivos al servidor (desde tu máquina local)
scp -r ./asistencia usuario@IP_SERVIDOR:/var/www/

# En el servidor
cd /var/www/asistencia
npm install --production

# Configurar variables de entorno
cp .env.example .env
nano .env
# Editar: DATABASE_URL, JWT_SECRET (generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```

---

## 4. PM2 (mantener app activa)

```bash
cd /var/www/asistencia
pm2 start src/app.js --name asistencia
pm2 save
pm2 startup  # Seguir instrucciones para arranque automático
```

---

## 5. NGINX (proxy reverso + HTTPS)

```nginx
# /etc/nginx/sites-available/asistencia
server {
    listen 80;
    server_name tu-dominio.cl www.tu-dominio.cl;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/asistencia /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# HTTPS con Let's Encrypt (recomendado)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.cl
```

---

## 6. CREDENCIALES INICIALES

| Campo | Valor |
|-------|-------|
| Email | admin@delegacion-linares.cl |
| Contraseña | Admin2024! |

**⚠️ CAMBIAR INMEDIATAMENTE en el panel de Usuarios tras el primer login.**

---

## 7. CREAR USUARIO EMPLEADO

1. Ingresar como admin
2. Ir a pestaña **Usuarios**
3. Clic en **+ Nuevo**
4. Ingresar nombre, email y contraseña del profesional
5. Rol: Empleado
6. Guardar

---

## 8. COMANDOS ÚTILES

```bash
pm2 status              # Ver estado de la app
pm2 logs asistencia     # Ver logs en tiempo real
pm2 restart asistencia  # Reiniciar app
pm2 stop asistencia     # Detener app

# Ver logs de PostgreSQL
sudo journalctl -u postgresql -f
```

---

## 9. ESTRUCTURA DE ARCHIVOS

```
asistencia/
├── src/
│   ├── app.js              # Punto de entrada
│   ├── db/pool.js          # Conexión PostgreSQL
│   ├── middleware/auth.js  # JWT middleware
│   └── routes/
│       ├── auth.js         # Login/logout
│       ├── marcajes.js     # Registro asistencia
│       └── admin.js        # Panel administrador
├── public/
│   └── index.html          # Frontend completo
├── schema.sql              # Esquema de base de datos
├── package.json
└── .env.example
```

---

## 10. SOPORTE

Desarrollado por ECOAVES GESTIÓN Y CONTROL DE FAUNA URBANA SpA
sebastian.espinosa@ecoaves.cl | +56 9 8299 7453
