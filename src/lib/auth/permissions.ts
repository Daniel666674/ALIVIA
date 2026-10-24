/** Single source of truth for permission keys. Seeded into `permissions`; checked by `can()`. */
export const PERMISSIONS = {
  "dashboard:read": "Ver el panel de inicio",
  "client:read": "Ver clientes",
  "client:write": "Crear y editar clientes",
  "import:run": "Importar clientes por CSV",
  "document:read": "Ver documentos",
  "document:write": "Subir documentos",
  "vault:read": "Abrir la bóveda",
  "task:read": "Ver tareas",
  "task:write": "Crear y editar tareas",
  "automation:manage": "Gestionar automatizaciones",
  "user:manage": "Gestionar usuarios y permisos",
  "audit:read": "Ver la auditoría",
  "demo:reset": "Reiniciar datos de demo",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

/** Default role → permission matrix for a new firm. Assistants only see assigned clients (enforced per-query later). */
export const DEFAULT_ROLES: Record<string, { name: string; permissions: PermissionKey[] }> = {
  owner: { name: "Administrador", permissions: ALL },
  accountant: {
    name: "Contador",
    permissions: [
      "dashboard:read", "client:read", "client:write", "import:run", "document:read",
      "document:write", "vault:read", "task:read", "task:write", "automation:manage",
    ],
  },
  assistant: {
    name: "Auxiliar contable",
    permissions: ["dashboard:read", "client:read", "document:read", "document:write", "task:read", "task:write"],
  },
};
