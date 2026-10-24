# Alivia

Sistema operativo para firmas contables. Next.js (App Router) + TypeScript estricto + Postgres (Drizzle) en Vercel.
Plan completo: [`docs/PLAN.md`](docs/PLAN.md) · Seguridad: [`docs/SECURITY.md`](docs/SECURITY.md)

## Estado
**Fase 1 (cimientos de seguridad)**: login real con Argon2id, 2FA TOTP obligatorio, sesiones en BD, rate limiting,
permisos por rol, multi-firma con RLS, auditoría inmutable, cabeceras/CSP. Base de datos **vacía**: sin clientes de ejemplo.

## Desarrollo local
```bash
cp .env.example .env.local        # completa las llaves (openssl rand -base64 32)
npm install
npm run db:migrate                # aplica migraciones
npm run db:seed -- --firm "Mi Firma" \
  --user ana@firma.co:"Ana Pérez":owner \
  --user luis@firma.co:"Luis Gómez":accountant \
  --user maria@firma.co:"María Ruiz":accountant \
  --user pablo@firma.co:"Pablo Díaz":assistant
npm run dev
```
El seed imprime una contraseña temporal por usuario (una sola vez). En el primer ingreso cada persona debe
cambiarla y activar el 2FA.

## Calidad
`npm run check` → typecheck + lint + tests (RLS, auth, cifrado, rate limit y guardas de arquitectura).

## Despliegue en Vercel
Variables de entorno (Production y Preview): `DATABASE_URL` (Neon, pooled), `FIELD_KEY_1`, `FIELD_KEY_CURRENT`,
`BLIND_INDEX_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `APP_URL` (https). Marcarlas como *Sensitive*.
Migraciones y seed se corren desde tu máquina o CI con el `DATABASE_URL` correspondiente.
