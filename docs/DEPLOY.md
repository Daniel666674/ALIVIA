# Puesta en marcha de la demo (Vercel + Neon)

1. **Base de datos.** Vercel → equipo → proyecto `alivia` → **Storage → Create Database → Neon**. Plan Free, región US East,
   entornos **Production y Preview**. Vercel agrega `DATABASE_URL` (y `DATABASE_URL_UNPOOLED`) al proyecto.
2. **Usuarios.** Variables `SEED_FIRM` (nombre de la firma) y `SEED_USERS` con el formato
   `correo:Nombre Apellido:rol;correo:Nombre Apellido:rol` (roles: `owner`, `accountant`, `assistant`). El plan Fase 1 permite
   **4 usuarios** (`firms.seat_limit`).
3. **Despliegue.** Redeploy del último commit de `main`. `npm run vercel-build` aplica las migraciones y crea los usuarios
   que falten; las contraseñas temporales salen **una sola vez** en el log del build (busque `temp-password`).
4. Elimine `SEED_USERS` del proyecto cuando termine.
5. Cada persona entra, cambia su contraseña y activa el 2FA. Luego: **Clientes → Importar CSV**.

## Formato del CSV
Exportado desde Excel (UTF-8 o Windows-1252; separador coma o punto y coma). Obligatorio: nombre y cédula/NIT.
Opcional: tipo (natural/jurídica), correo, celular, ciudad, responsable (nombre de un usuario) y fecha límite (DD/MM/AAAA).
El importador reconoce los encabezados comunes y permite corregir el mapeo antes de guardar. Se puede deshacer.

## Límites de la Fase 1 (en código)
4 usuarios · 600 clientes · archivos PDF/JPG/PNG de hasta 4 MB (los guarda cifrados en Postgres: es almacenamiento de demo;
para volumen real hay que pasar a almacenamiento de objetos privado).
