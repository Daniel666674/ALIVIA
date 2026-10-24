# Alivia · Plan de construcción (demo seguro, TypeScript, Vercel)

Sistema operativo para firmas contables (Colombia). Evoluciona la demo estática `alivia.html` a una app real.
Demo: 1 firma, 4 usuarios, base de datos limpia, carga de CSV, desde el día 1 con seguridad real.

> Este plan va al repo NUEVO y PRIVADO (`alivia`), no a este repo (público, GitHub Pages).

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| App | **Next.js 15 (App Router) + TypeScript estricto** | Un solo proyecto front+back, nativo en Vercel |
| UI | Tailwind + shadcn/ui | Rápido, accesible; reutiliza el diseño de `alivia.html` |
| DB | **Postgres (Neon, vía Vercel Marketplace)** | Cifrado en reposo, backups, branching para staging |
| ORM | **Drizzle ORM** + migraciones versionadas | Consultas parametrizadas por construcción → sin SQL injection; tipos end-to-end |
| Validación | **Zod** en TODA entrada (forms, API, CSV, env) | Nada entra sin validar |
| Auth | Propia, mínima, sobre primitivas probadas (patrón Lucia): **Argon2id** + sesiones opacas en DB + TOTP 2FA | Demo cerrada de 4 usuarios, sin registro público; control total |
| Rate limit | **Upstash Redis** (`@upstash/ratelimit`) + Vercel WAF/Firewall | Límites por IP, por cuenta y por ruta |
| Archivos | **Vercel Blob (privado)** + cifrado en la app antes de subir | La bóveda nunca queda como URL pública |
| Jobs | **Vercel Cron** + cola **Upstash QStash** (reintentos, idempotencia) | Recordatorios y automatizaciones |
| Email | **Resend** (WhatsApp queda para fase 2) | Recordatorios |
| IA (opcional) | Claude API, solo para extraer datos de documentos | Fase 4, tras revisión de privacidad |
| Tests/CI | Vitest, Playwright, GitHub Actions | Seguridad probada, no supuesta |

## 2. Seguridad (no negociable desde el commit 1)

**Autenticación**
- Sin registro público. Los 4 usuarios se crean por seed/invitación del admin.
- Contraseñas: Argon2id (`@node-rs/argon2`), mínimo 12 caracteres, chequeo contra lista de contraseñas filtradas.
- Sesión: token aleatorio de 256 bits en cookie `HttpOnly; Secure; SameSite=Lax; __Host-`; en DB se guarda solo el **hash** (SHA-256). Expiración idle 30 min / absoluta 12 h, rotación al login, revocación por dispositivo.
- **2FA TOTP obligatorio** (códigos de recuperación hasheados).
- Bloqueo progresivo tras intentos fallidos; mensajes genéricos (sin enumeración de usuarios); comparación en tiempo constante.
- Middleware protege todo salvo `/login`; **cada** server action/route handler vuelve a verificar sesión + permiso (no confiar solo en middleware).

**Autorización**
- Multi-tenant: toda tabla de negocio lleva `firm_id`. Todas las consultas pasan por una capa `scoped(db, ctx)` que lo fuerza.
- **Row Level Security de Postgres** como segunda barrera (`SET LOCAL app.firm_id` por transacción).
- RBAC con permisos granulares (`client:read`, `document:download`, `vault:read`, `import:run`, `user:manage`, `audit:read`…) + asignación por cliente (un auxiliar solo ve sus clientes).
- Roles demo: `owner` (admin), `accountant` ×2, `assistant` (solo clientes asignados).

**Rate limiting**
- Login: 5/15 min por IP+email, 20/h por IP. 2FA: 5/10 min. Descargas de bóveda: 30/min. Import CSV: 5/h. API general: 100/min por usuario. Respuestas `429` + `Retry-After`.
- Vercel Firewall: reglas básicas + modo challenge manual ante ataques.

**Inyección / entradas**
- Drizzle parametrizado; prohibido `sql.raw` con datos de usuario (regla de lint + test).
- Zod en cada frontera; límites de tamaño de body.
- CSV: parser estricto, tope de filas/tamaño, escape de celdas que empiezan con `= + - @` (CSV/formula injection), UTF-8/Latin-1 detectado.
- Archivos: allowlist de tipos (PDF, XML, XLSX, CSV, JPG/PNG), verificación de *magic bytes* (no solo extensión), tope de tamaño, nombre aleatorio en storage (nombre original solo en DB), `Content-Disposition: attachment`, `nosniff`.
- XSS: React escapa por defecto; **CSP con nonce**, sin `dangerouslySetInnerHTML`.
- CSRF: server actions + verificación de `Origin` + SameSite.
- Cabeceras: HSTS, CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy.

**Cifrado**
- En tránsito: TLS (Vercel/Neon).
- En reposo: DB y Blob cifrados por el proveedor **+** cifrado a nivel de campo AES-256-GCM (clave por entorno, `key_version` para rotación) para datos sensibles: NIT/cédula de contactos, teléfonos, emails de contacto, notas privadas.
- Bóveda: **envelope encryption** — cada archivo con su propia clave de datos (DEK), la DEK cifrada con la clave maestra (KEK). Se descifra solo en memoria al descargar, tras verificar permiso.
- Búsqueda por NIT sin descifrar: columna con *blind index* (HMAC-SHA256).
- Secretos solo en variables de entorno de Vercel (Sensitive), validadas con Zod al arrancar; escaneo de secretos en CI (gitleaks).

**Auditoría y privacidad (Ley 1581 / habeas data)**
- `audit_log` append-only (quién, qué, cuándo, IP, user-agent, recurso; sin datos sensibles en el payload). Eventos: login, 2FA, descarga, import, cambio de permisos, borrado.
- Minimización: no se guardan PII en logs ni en analítica. Logging estructurado con redacción.
- Soft-delete + purga programada; exportación de datos de un cliente; registro de consentimiento/finalidad del tratamiento.
- Seguridad de dependencias: Dependabot, `npm audit` en CI, lockfile fijo.

## 3. Esquema de base de datos (núcleo)

```
firms(id, name, nit_enc, nit_idx, created_at)
users(id, firm_id, email_citext UNIQUE, name, password_hash, role_id, status, totp_secret_enc,
      totp_enabled, failed_logins, locked_until, last_login_at, created_at)
roles(id, firm_id, key, name)                    permissions(id, key)        role_permissions(role_id, permission_id)
sessions(id, user_id, token_hash UNIQUE, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at)
recovery_codes(id, user_id, code_hash, used_at)
login_attempts(id, email_hash, ip, success, at)
audit_log(id, firm_id, user_id, action, resource_type, resource_id, ip, user_agent, meta jsonb, at)  -- sin UPDATE/DELETE

clients(id, firm_id, name, nit_enc, nit_idx, nit_dv, tax_regime, entity_type, sector, city,
        contact_name_enc, contact_email_enc, contact_phone_enc, status, created_at, deleted_at)
client_assignments(client_id, user_id, role_on_client)

obligation_templates(id, key, name, periodicity, rule jsonb)       -- IVA, retefuente, renta, nómina, exógena, ICA…
tax_calendar(id, year, obligation_key, nit_last_digits, due_date)  -- calendario DIAN cargado como dato
obligations(id, firm_id, client_id, template_id, period, due_date, status, assigned_to, completed_at)

tasks(id, firm_id, client_id, obligation_id?, title, status, priority, due_date, assigned_to, source)  -- manual | automation | nba
documents(id, firm_id, client_id, obligation_id?, kind, name, mime, size, sha256, storage_key,
          dek_enc, key_version, status, uploaded_by, uploaded_at, deleted_at)
vault_items(id, firm_id, client_id, category, document_id, sensitivity, visibility)   -- bóveda: credenciales, RUT, firmas, certificados
vault_access_log(...)  -> se cubre con audit_log

reminders(id, firm_id, target_type, target_id, user_id, channel, remind_at, status, attempts, sent_at, dedupe_key UNIQUE)
automations(id, firm_id, name, trigger jsonb, conditions jsonb, actions jsonb, enabled)
automation_runs(id, automation_id, status, started_at, finished_at, error, dedupe_key UNIQUE)

nba_suggestions(id, firm_id, user_id, client_id, kind, score, reasons jsonb, payload jsonb,
                status, snoozed_until, computed_at, acted_at)

import_batches(id, firm_id, user_id, kind, filename, status, total, ok, failed, errors jsonb, created_at, rolled_back_at)
```
Índices en `(firm_id, …)` en todo; `UNIQUE (firm_id, nit_idx)` en clientes (idempotencia del CSV).

## 4. Lógica de negocio

**4.1 Calendario y obligaciones.** Al crear/importar un cliente se generan `obligations` según régimen, tipo de entidad y últimos dígitos del NIT cruzando `tax_calendar`. Se recalcula cuando cambia el régimen o llega un calendario nuevo.

**4.2 NBA (Next Best Action).** Motor determinista y explicable (sin caja negra), ejecutado por cron cada hora y tras eventos clave:
```
score = urgencia(días a vencimiento) × 40
      + riesgo(multa/sanción, historial de atrasos) × 25
      + impacto(tamaño/valor del cliente) × 15
      + bloqueo(docs faltantes que frenan otras tareas) × 15
      + antigüedad sin tocar × 5
```
Cada sugerencia guarda `reasons` ("IVA vence en 3 días · faltan 2 extractos · cliente sin contacto hace 12 d"). Tipos: pedir documento faltante, preparar declaración, contactar cliente, escalar a revisor, reasignar por carga. Se muestra por usuario (top 5 "Hoy") y por cliente; acciones: hacer, posponer, descartar (con motivo → retroalimenta pesos en fase posterior). Respeta permisos: nadie ve sugerencias de clientes no asignados.

**4.3 Automatizaciones.** Modelo `disparador → condiciones → acciones` (ej.: "10 días antes de vencimiento IVA y sin docs → crear tarea + recordatorio al cliente"). Disparadores: fecha, evento (documento subido, estado cambiado), cron. Acciones: crear tarea, enviar recordatorio, cambiar estado, generar NBA. Ejecución por cola con **idempotencia** (`dedupe_key`), reintentos con backoff, registro en `automation_runs`. Plantillas predefinidas para la demo; editor simple on/off + parámetros.

**4.4 Recordatorios.** Cron cada 15 min toma `reminders` vencidos, envía por Resend, marca estado; deduplicados; zona horaria America/Bogota; resumen diario por usuario.

**4.5 Documentos.** Subida directa con URL firmada de corta vida → verificación de tipo/tamaño/hash → cifrado → registro. Estados: recibido → revisado → archivado. Vinculados a cliente y obligación; al subir, actualizan la obligación/NBA (ej. completar lista de documentos). Versionado simple. Clasificación por reglas (nombre/tipo) y, en fase 4, extracción con IA (facturas XML DIAN).

**4.6 Bóveda.** Sección separada y más estricta: permiso propio `vault:read`, re-autenticación (re-pedir 2FA) para abrir/descargar, descarga siempre auditada, enlaces efímeros (60 s), marca de visibilidad por rol, sin vista previa en caché.

**4.7 Carga de CSV (clientes).** Flujo en 3 pasos: (1) subir + plantilla descargable, (2) **vista previa/dry-run** con errores por fila y mapeo de columnas, (3) confirmar → transacción, `import_batches` con **rollback** posible. Upsert por NIT (idempotente), normalización de NIT/DV y ciudades, generación de obligaciones al terminar. Misma base para una 2ª plantilla (tareas) después.

**4.8 Base limpia para demo.** Migraciones + seed mínimo (firma, roles, permisos, plantillas de obligaciones, calendario DIAN del año, 4 usuarios). **Cero clientes ficticios.** Botón admin "Reiniciar datos de demo" (con confirmación + auditado) para limpiar clientes/documentos y volver a probar.

## 5. Pantallas (reutilizando el look de `alivia.html`)
Login + 2FA · Hoy (NBA) · Clientes (lista/detalle) · Obligaciones/Calendario · Tareas · Documentos · Bóveda · Automatizaciones · Recordatorios · Importar CSV · Equipo y permisos (admin) · Auditoría (admin) · Seguridad de mi cuenta (2FA, sesiones activas).

## 6. Fases (cada una se despliega y se prueba)
1. **Cimientos (seguridad primero):** repo, CI, Next+TS estricto, Drizzle+Neon, esquema auth/RBAC/audit, login+2FA+sesiones, rate limit, cabeceras/CSP, RLS, deploy a Vercel (preview + prod), seed de 4 usuarios. *Entregable: login real y seguro con tests.*
2. **Clientes + CSV:** modelo de clientes, importador con vista previa/rollback, calendario DIAN y generación de obligaciones.
3. **Documentos + Bóveda:** subida segura, cifrado, descargas auditadas, re-auth en bóveda.
4. **Tareas, NBA, recordatorios, automatizaciones:** motor, cron/cola, emails.
5. **Endurecimiento y demo:** pruebas de aislamiento entre tenants, test de rate limit, revisión OWASP ASVS (nivel 2 selectivo), pen-test básico, reinicio de demo, guion de demo, (opcional) extracción con IA.

## 7. Calidad
- TS `strict` + `noUncheckedIndexedAccess`; ESLint con reglas de seguridad; sin `any`.
- Tests: unitarios (scoring NBA, permisos, cifrado), integración (auth, RLS, import), e2e Playwright (login → 2FA → importar CSV → NBA). **Tests de abuso:** acceder a datos de otro usuario/cliente, SQLi, subir ejecutable disfrazado, exceder rate limit.
- CI: typecheck, lint, tests, gitleaks, `npm audit`; migraciones revisadas en PR; protección de rama `main`.
- Entornos: `preview` (Neon branch) y `production`, secretos separados.

## 8. Lo que necesito de ti antes de empezar
1. Crear repo **privado** `alivia` (vacío) y darme acceso; conectarlo a Vercel (o autorizo vía Vercel MCP).
2. Marketplace Vercel: Neon (Postgres), Upstash (Redis/QStash), Blob; cuenta Resend (o dominio de envío).
3. Los 4 usuarios: nombre, email, rol (propuesta: 1 owner, 2 contadores, 1 auxiliar).
4. Dominio/URL del demo (subdominio de `blackscale.consulting`?).
5. Columnas del CSV de clientes que usará el contador (si no, uso: razón social, NIT, régimen, tipo de entidad, ciudad, contacto, email, teléfono).

## 9. Riesgos / supuestos
- Es demo con datos reales de clientes del contador → trato como producción en seguridad; sugerir aviso de privacidad y acuerdo de tratamiento de datos para el piloto.
- Antivirus de archivos no corre nativo en Vercel: mitigación por allowlist + magic bytes + descarga forzada; escaneo con servicio externo opcional en fase 5.
- Calendario DIAN se carga como dato anual verificado manualmente (no se scrapea).
- Envío por WhatsApp (ya existe `server/src/lib/whatsapp.js` en el repo viejo) queda fuera del primer corte.
