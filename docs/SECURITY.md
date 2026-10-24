# Seguridad · decisiones de Fase 1

| Riesgo | Control | Dónde / cómo se prueba |
|---|---|---|
| Acceso sin credenciales | Sin registro público; sesión opaca verificada en el servidor en cada página y acción (`requireUser`); `proxy.ts` es solo un filtro optimista | `tests/architecture.test.ts`, e2e |
| Robo de contraseñas en BD | Argon2id (m=19 MiB, t=2, p=1) | `lib/auth/password.ts` |
| Fuerza bruta | Rate limit (IP, IP+correo, 2FA) + bloqueo progresivo 15 min→24 h; falla cerrado si Redis cae | `lib/rate-limit.ts`, `tests/auth.test.ts` |
| Enumeración de usuarios | Mensaje genérico + verificación "dummy" de igual costo | `attemptLogin` |
| Robo de sesión | Token 256 bits, solo su hash en BD; cookie `__Host-` HttpOnly Secure SameSite=Lax; idle 30 min / absoluto 12 h; rotación al subir privilegios; cambio de clave revoca el resto | `lib/auth/session-core.ts` |
| Segundo factor | TOTP obligatorio, secreto cifrado AES-GCM, anti-replay por paso de tiempo, 10 códigos de recuperación de un solo uso (hash) | `lib/auth/login.ts` |
| Fuga entre firmas | `firm_id` en toda tabla + **RLS forzado** (incluso para el dueño de las tablas) + `SET LOCAL ROLE alivia_app` por transacción; **todo** acceso a BD pasa por `withTenant()` | `tests/rls.test.ts` |
| SQL injection | Drizzle parametrizado; `sql.raw` prohibido (ESLint + test); `set_config` parametrizado | `tests/architecture.test.ts` |
| XSS / clickjacking | React escapa; CSP con nonce + `strict-dynamic`; `X-Frame-Options: DENY`; `dangerouslySetInnerHTML` prohibido | `proxy.ts`, `next.config.ts` |
| CSRF | Server Actions (verificación de `Origin`) + SameSite=Lax | Next.js |
| Manipulación de auditoría | `audit_log` solo-inserción (permisos + trigger); sin PII ni secretos en `meta` | `tests/rls.test.ts` |
| Cifrado de campos | AES-256-GCM, AAD = ubicación del dato, versión de llave para rotación; índice ciego HMAC para buscar sin descifrar | `lib/crypto.ts`, `tests/crypto.test.ts` |
| Secretos | Solo variables de entorno validadas con Zod; producción exige Upstash y HTTPS | `src/env.ts` |
| Server Actions expuestas | Un archivo `"use server"` solo exporta funciones async y cada una revalida la sesión | `tests/architecture.test.ts` |

## Pendiente conscientemente (fases siguientes)
- Cifrado por archivo (envelope) y descargas auditadas → Fase 3 (bóveda).
- Verificación de contraseñas filtradas (HIBP) y recuperación de contraseña por correo.
- Restricción por cliente asignado (asistentes) → Fase 2.
- WAF / reglas de firewall de Vercel y alertas.

## Operación
- La conexión de la app usa el rol dueño de Neon; cada transacción hace `SET LOCAL ROLE alivia_app` (sin BYPASSRLS), por eso RLS aplica aunque el rol de Neon pueda saltarse RLS.
- Aprovisionamiento (`scripts/seed.ts`) es el único escritor entre firmas; marca `app.system`.
- Rotar llaves: añadir `FIELD_KEY_2`, subir `FIELD_KEY_CURRENT=2`; lo viejo se sigue descifrando.
