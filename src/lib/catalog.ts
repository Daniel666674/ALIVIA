export type Phase = "Fase 2" | "Fase 3" | "Futuro";

export type CatalogItem = {
  id: string;
  name: string;
  group: string;
  phase: Phase;
  /** Qué hace. */
  what: string;
  /** Cómo les ayuda a la firma. */
  helps: string;
  /** Hasta dónde puede crecer. */
  grows: string[];
  /** Cómo se puede convertir en ingreso para la firma (cobrarle al cliente final). */
  revenue?: string;
};

export const AUTOMATIONS: CatalogItem[] = [
  {
    id: "a-docs", name: "Recordatorio de documentos faltantes", group: "Recolección de documentos", phase: "Fase 2",
    what: "Cuando a un cliente le faltan documentos, el sistema le escribe solo (correo o WhatsApp) a los 10, 5 y 2 días antes de su fecha límite, con la lista exacta de lo que falta.",
    helps: "Hoy el equipo persigue documentos uno por uno. Esto elimina la mayor parte de esas llamadas y mensajes y deja al contador dedicado a preparar declaraciones.",
    grows: ["Mensajes más insistentes a medida que se acerca el vencimiento", "Tono distinto por cliente (persona natural vs. empresa)", "Escalar a una llamada o tarea para el responsable si el cliente no responde"],
    revenue: "Es el argumento principal para cobrar: «nosotros le perseguimos sus documentos».",
  },
  {
    id: "a-silence", name: "Alerta si el cliente no responde", group: "Recolección de documentos", phase: "Fase 2",
    what: "Si pasan 5 días sin que el cliente suba nada, se crea una tarea para su responsable y el cliente sube en el semáforo.",
    helps: "Nadie se entera tarde de que un cliente estaba «dormido». El semáforo avisa antes de que sea una urgencia.",
    grows: ["Reasignar automáticamente a otro contador si el responsable está sobrecargado", "Informe semanal de clientes en riesgo para los socios"],
  },
  {
    id: "a-calendar", name: "Calendario tributario inteligente", group: "Cumplimiento DIAN", phase: "Fase 2",
    what: "Calcula la fecha límite de cada cliente según el último dígito de su NIT o cédula y el calendario de la DIAN, y la carga sola.",
    helps: "Se acabó escribir fechas a mano y equivocarse. Cada cliente ya trae su fecha correcta desde el momento de la importación.",
    grows: ["Todas las obligaciones: renta, IVA, retención, ICA, exógena", "Avisos de cambios de calendario o de nuevos decretos", "Plantilla de tareas por tipo de obligación"],
    revenue: "Se vende como «cumplimiento sin sustos»: el cliente paga por que nunca se le pase una fecha.",
  },
  {
    id: "a-present", name: "Aviso automático: declaración presentada", group: "Cierre y entrega", phase: "Fase 2",
    what: "Al marcar una declaración como presentada, se envía al cliente un mensaje de confirmación (con el soporte adjunto) y se agenda la entrega de la carpeta.",
    helps: "Hoy ya sugerimos la acción y abrimos WhatsApp con el mensaje listo; esto lo vuelve automático y deja evidencia de que se avisó.",
    grows: ["Adjuntar el PDF del acuse de la DIAN", "Encuesta corta de satisfacción al día siguiente", "Pedir una reseña o referido a clientes satisfechos"],
  },
  {
    id: "a-collect", name: "Cobro de honorarios sin incomodidad", group: "Cobros", phase: "Fase 2",
    what: "Después de presentar, el sistema manda el recordatorio de pago con un enlace para pagar (PSE, tarjeta, Nequi) y marca solo cuando entra el pago.",
    helps: "El «págueme» deja de ser una conversación incómoda del contador y la cartera se concilia sin revisar extractos.",
    grows: ["Recordatorios escalonados a 3, 7 y 15 días", "Cobro recurrente mensual para clientes con contabilidad", "Reporte de cartera por edad de la deuda"],
    revenue: "Habilita cobrar por adelantado o por suscripción mensual.",
  },
  {
    id: "a-assign", name: "Reparto automático de trabajo", group: "Equipo", phase: "Fase 2",
    what: "Los clientes nuevos o sin responsable se asignan al contador con menos carga, según reglas que defina la firma (tipo, ciudad, volumen).",
    helps: "Se evita que unos se ahoguen mientras otros tienen tiempo libre, y nadie reparte clientes en un chat.",
    grows: ["Metas por persona y alertas de sobrecarga", "Reglas por especialidad (empresas vs. personas naturales)", "Cobertura automática en vacaciones"],
  },
  {
    id: "a-digest", name: "Resumen diario por correo", group: "Equipo", phase: "Fase 2",
    what: "Cada mañana cada persona recibe un correo con sus 5 acciones más importantes del día, ordenadas por urgencia.",
    helps: "El equipo arranca el día sabiendo qué hacer sin entrar a buscarlo; los socios ven el pulso de la firma.",
    grows: ["Resumen semanal para los socios con indicadores", "Resumen por WhatsApp", "Comparativo contra la semana anterior"],
  },
  {
    id: "a-ocr", name: "Lectura automática de documentos (IA)", group: "Documentos", phase: "Fase 3",
    what: "Al subir un RUT, una cédula o una certificación bancaria, el sistema lee el documento, extrae sus datos y verifica que sea el correcto y esté vigente.",
    helps: "Menos digitación y menos documentos equivocados. Se detecta de inmediato un RUT vencido o una cédula ilegible.",
    grows: ["Leer facturas y extractos para pre-clasificar contabilidad", "Detectar inconsistencias entre documentos", "Autocompletar datos del cliente desde el RUT"],
    revenue: "Servicio premium: contabilidad pre-clasificada para clientes empresa.",
  },
  {
    id: "a-renewal", name: "Renovaciones y vencimientos", group: "Cumplimiento DIAN", phase: "Fase 3",
    what: "Avisa de vencimientos recurrentes: firma electrónica, matrícula mercantil, certificados, RUT.",
    helps: "Evita sanciones y cierra oportunidades de servicio adicional con los clientes.",
    grows: ["Gestionar la renovación completa como un servicio", "Recordatorios al cliente con enlace de pago"],
    revenue: "Cada renovación gestionada es un ingreso recurrente.",
  },
  {
    id: "a-health", name: "Semáforo de salud de cartera", group: "Gestión", phase: "Futuro",
    what: "Puntúa a cada cliente según puntualidad, documentos y pagos, y avisa de quién está en riesgo de irse o de caer en mora.",
    helps: "Los socios ven dónde poner atención antes de perder un cliente.",
    grows: ["Predicción de clientes que no entregarán a tiempo", "Segmentación para precios diferenciados"],
  },
];

export const INTEGRATIONS: CatalogItem[] = [
  {
    id: "i-whatsapp", name: "WhatsApp Business", group: "Comunicación con el cliente", phase: "Fase 2",
    what: "Conexión oficial con WhatsApp Business para enviar mensajes desde el sistema y recibir las respuestas (documentos, fotos) directamente en la ficha del cliente.",
    helps: "Hoy se abre el chat con el mensaje listo y se envía a mano. Con la conexión, los avisos salen solos y los documentos que el cliente manda por WhatsApp quedan en su carpeta.",
    grows: ["Plantillas aprobadas por Meta para recordatorios", "Bot que recibe documentos y los clasifica", "Historial de conversación dentro de la ficha"],
    revenue: "Se puede ofrecer como «atención por WhatsApp» dentro del plan del cliente.",
  },
  {
    id: "i-email", name: "Correo (Gmail y Outlook)", group: "Comunicación con el cliente", phase: "Fase 2",
    what: "Envía recordatorios desde el dominio de la firma y lee los correos donde los clientes mandan sus soportes para guardarlos en la carpeta correcta.",
    helps: "Los documentos dejan de perderse en bandejas personales; el cliente ve el correo de la firma, no de un sistema ajeno.",
    grows: ["Clasificar adjuntos con IA", "Correo reenviable por cliente (cliente123@firma.alivia.co)", "Respuestas sugeridas"],
  },
  {
    id: "i-wompi", name: "Pagos: Wompi, Bold y PSE", group: "Cobros", phase: "Fase 2",
    what: "Enlaces de pago por cliente (PSE, tarjeta, Nequi) con conciliación automática: cuando el cliente paga, el sistema lo registra.",
    helps: "Se cobra más rápido, sin cuentas de cobro manuales y sin cruzar extractos.",
    grows: ["Suscripciones mensuales para clientes de contabilidad", "Anticipos antes de empezar la declaración", "Reporte de ingresos de la firma"],
    revenue: "Es la base para cobrar acceso al portal y los servicios recurrentes a los ~500 clientes.",
  },
  {
    id: "i-drive", name: "Google Drive y OneDrive", group: "Documentos", phase: "Fase 2",
    what: "Sincroniza las carpetas de cada cliente con la nube que ya usa la firma.",
    helps: "El equipo conserva sus hábitos y las copias de respaldo; nada queda atrapado en una sola herramienta.",
    grows: ["Estructura automática de carpetas por año y obligación", "Respaldo cifrado programado"],
  },
  {
    id: "i-invoicing", name: "Facturación electrónica (Siigo, Alegra, World Office)", group: "Contabilidad", phase: "Fase 3",
    what: "Trae las facturas y movimientos de los clientes desde su software contable.",
    helps: "El contador deja de pedir archivos y empieza a trabajar con información que ya está ahí.",
    grows: ["Alertas de inconsistencias entre facturas y declaraciones", "Pre-llenado de declaraciones", "Indicadores para el cliente"],
    revenue: "Permite vender un tablero financiero mensual al cliente empresa.",
  },
  {
    id: "i-dian", name: "DIAN y RUES (consulta de datos públicos)", group: "Cumplimiento DIAN", phase: "Fase 3",
    what: "Valida NIT y dígito de verificación, consulta el estado del RUT y la matrícula mercantil de empresas.",
    helps: "Menos errores de digitación al crear clientes y detección temprana de clientes con RUT desactualizado.",
    grows: ["Monitoreo periódico del estado del cliente", "Alertas ante cambios de actividad económica"],
  },
  {
    id: "i-calendar", name: "Google Calendar y Outlook Calendar", group: "Equipo", phase: "Fase 2",
    what: "Publica las fechas límite y reuniones de cada cliente en el calendario del equipo.",
    helps: "Las fechas viven donde el equipo ya mira todos los días.",
    grows: ["Agendar citas con clientes desde un enlace", "Recordatorios de reunión por WhatsApp"],
  },
  {
    id: "i-esign", name: "Firma electrónica", group: "Documentos", phase: "Fase 3",
    what: "El cliente firma poderes, contratos de honorarios y autorizaciones desde el celular.",
    helps: "Se acabó imprimir, escanear y perseguir firmas; todo queda con trazabilidad.",
    grows: ["Contratos de honorarios renovables automáticamente", "Autorización de tratamiento de datos al ingresar el cliente"],
  },
  {
    id: "i-bank", name: "Conexión bancaria (open finance)", group: "Contabilidad", phase: "Futuro",
    what: "Con permiso del cliente, trae sus movimientos bancarios para conciliar y pre-clasificar.",
    helps: "Ahorra el esfuerzo de pedir y procesar extractos todos los meses.",
    grows: ["Conciliación contable automática", "Alertas de gastos no soportados"],
    revenue: "Servicio premium mensual para empresas.",
  },
  {
    id: "i-sheets", name: "Excel / Google Sheets y reportes", group: "Gestión", phase: "Fase 2",
    what: "Exporta cartera, avance y cobros; y mantiene actualizadas hojas compartidas con los socios.",
    helps: "Los socios siguen usando las hojas que conocen, pero alimentadas por el sistema.",
    grows: ["Tableros ejecutivos", "Exportes programados por correo"],
  },
  {
    id: "i-chat", name: "Slack y Microsoft Teams", group: "Equipo", phase: "Futuro",
    what: "Publica en el canal del equipo las alertas importantes: documento recibido, declaración presentada, pago recibido.",
    helps: "Todo el equipo se entera sin entrar al sistema.",
    grows: ["Comandos para asignar o marcar tareas desde el chat"],
  },
];

export const PORTAL_TIERS = [
  {
    name: "Esencial",
    price: "$60.000 al año",
    tag: "Para personas naturales",
    items: ["Subir sus 4 documentos desde el celular", "Ver el estado de su declaración (el semáforo)", "Recordatorios automáticos de lo que falta"],
    grows: "Es la puerta de entrada: el cliente deja de llamar a preguntar «¿cómo va lo mío?».",
  },
  {
    name: "Plus",
    price: "$96.000 al año",
    tag: "Clientes que quieren más control",
    items: ["Descargar sus declaraciones y soportes", "Pagar honorarios en línea", "Firmar documentos electrónicamente", "Canal directo con su contador"],
    grows: "Se cobra como suscripción mensual o anual de acceso.",
  },
  {
    name: "Empresas",
    price: "$720.000 – $900.000 al año",
    tag: "Los ~30 clientes empresa",
    items: ["Tablero de obligaciones y vencimientos", "Facturas y pagos conectados a su software contable", "Varios usuarios por empresa", "Reportes mensuales"],
    grows: "Servicio premium con ingreso recurrente más alto, sobre la misma plataforma.",
  },
] as const;
