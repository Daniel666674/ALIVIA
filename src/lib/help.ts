/** Contextual help shown by the (i) icons: what you are looking at and how to use it. */
export type HelpEntry = { title: string; see: string; use: string[] };

export const HELP: Record<string, HelpEntry> = {
  "dashboard": {
    title: "Dashboard",
    see: "El resumen del día de toda la firma: cuántos clientes hay, qué documentos faltan, qué tareas están vencidas y qué debería hacer primero.",
    use: ["Empiece por “Siguiente mejor acción”: es su lista de pendientes, ordenada por urgencia.", "Toque cualquier tarjeta o nombre para ir directo al detalle.", "“Actualizar” vuelve a calcular todo con los datos más recientes."],
  },
  "dashboard.stats": {
    title: "Indicadores",
    see: "Cinco números de la firma: clientes activos, documentos pendientes, tareas vencidas, facturas y automatizaciones.",
    use: ["“Documentos pendientes” cuenta los que aún faltan de clientes sin presentar.", "Facturas y automatizaciones llegan en la siguiente fase; por ahora salen en cero."],
  },
  "nba": {
    title: "Siguiente mejor acción",
    see: "Una lista priorizada de lo que conviene hacer ahora, cada acción con su razón (por ejemplo: “Vence en 2 días · faltan RUT y certificación bancaria”).",
    use: ["Trabaje de arriba hacia abajo: lo más urgente está primero.", "El botón verde de WhatsApp abre el chat del cliente con el mensaje ya escrito; usted solo lo envía. No se envía nada solo.", "Al abrir WhatsApp, la acción queda registrada y desaparece de la lista unos días para no insistir de más.", "“Abrir cliente” lo lleva a su ficha para resolverlo."],
  },
  "workload": {
    title: "Carga laboral",
    see: "Cuántos clientes sin presentar y cuántas tareas abiertas tiene cada persona del equipo.",
    use: ["Si alguien está muy cargado (barra roja), reasigne clientes desde la ficha de cada cliente."],
  },
  "missing": {
    title: "Documentos faltantes",
    see: "Los clientes a los que todavía les falta alguno de los 4 documentos base, empezando por la fecha límite más cercana.",
    use: ["El porcentaje es cuántos de los 4 documentos ya llegaron.", "Toque el nombre para ver qué falta exactamente y pedirlo por WhatsApp."],
  },
  "integrations": {
    title: "Integraciones",
    see: "Las herramientas que se podrán conectar con Alivia (Gmail, WhatsApp, Wompi…).",
    use: ["Hoy todas están en “Próximamente”. Se activan en las siguientes fases del proyecto."],
  },
  "clients": {
    title: "Clientes",
    see: "Todos los clientes de la firma. El punto de color es el semáforo: rojo = sin documentos, amarillo = faltan algunos, azul = en preparación, verde = declaración presentada.",
    use: ["Filtre por tipo o por estado con las pestañas y busque por nombre o por cédula/NIT completo.", "“Mis clientes” muestra solo los suyos.", "Toque un cliente para abrir su ficha.", "“Importar” carga muchos clientes de una vez; “Tablero” los muestra por color."],
  },
  "client.docs": {
    title: "Documentos base",
    see: "Los 4 documentos que se necesitan de cada cliente: certificación bancaria, RUT, clave DIAN (solo su estado) y documentos de cédula.",
    use: ["Suba el archivo (PDF, JPG o PNG, hasta 4 MB) con “Subir”; queda cifrado y el documento pasa a “Recibido”.", "Cuando lo verifique, marque “Revisado”.", "La clave DIAN no se guarda: solo marque “recibida” cuando el contador ya la tenga."],
  },
  "client.followup": {
    title: "Seguimiento",
    see: "Lo que pasa después de presentar la declaración: avisar al cliente, entregar la carpeta física y cobrar los honorarios.",
    use: ["Cada paso se marca a mano cuando ocurre; el sistema no envía nada por su cuenta.", "El botón de WhatsApp abre el chat con el mensaje listo.", "Si algo se marcó por error, use “Deshacer”."],
  },
  "client.stage": {
    title: "Estado de la declaración",
    see: "En qué etapa va la declaración de este cliente: sin presentar, en preparación, en revisión o presentada.",
    use: ["Use los botones de arriba a la derecha para avanzar la etapa.", "Al marcarla “Presentada” el cliente pasa a verde y aparecen las acciones de avisar, entregar carpeta y cobrar."],
  },
  "client.tasks": {
    title: "Tareas del cliente",
    see: "Las cosas por hacer relacionadas con este cliente.",
    use: ["Escriba la tarea, elija responsable y fecha y toque “Agregar”.", "Marque el cuadro para completarla."],
  },
  "import": {
    title: "Importar clientes",
    see: "Un asistente de 3 pasos para cargar su base de clientes desde un archivo de Excel (.xlsx) o CSV.",
    use: ["1) Suba su Excel (.xlsx) o CSV tal como lo tiene.", "2) Revise qué columna es cada dato y la vista previa: los errores se omiten y se le explican.", "3) Confirme. Si algo sale mal, “Deshacer” borra solo lo que creó esta importación."],
  },
  "board": {
    title: "Tablero",
    see: "Todos los clientes agrupados por color del semáforo, para ver de un vistazo cómo va la firma.",
    use: ["Filtre por persona arriba a la derecha.", "Toque una tarjeta para abrir el cliente."],
  },
  "tasks": {
    title: "Tareas",
    see: "Las tareas del equipo, con responsable y fecha.",
    use: ["Cree una tarea arriba, asigne y ponga fecha.", "“Mis tareas” filtra solo las suyas.", "Las vencidas aparecen en rojo y también en el dashboard."],
  },
  "documents": {
    title: "Documentos",
    see: "Todos los documentos de todos los clientes en una sola lista, con su estado.",
    use: ["Use las pestañas para ver solo los pendientes, recibidos o revisados.", "Busque por nombre del cliente.", "Toque el cliente para subir o revisar el documento."],
  },
  "automations": {
    title: "Automatizaciones",
    see: "Reglas que harán trabajo repetitivo por usted (recordatorios por correo, avisos).",
    use: ["Cada tarjeta explica qué hace, cómo ayuda y hasta dónde puede crecer. Marque “Me interesa” en las que quiera: así sabemos qué construir primero."],
  },
  "reports": {
    title: "Reportes",
    see: "El avance de la cartera: porcentaje con documentos completos, declaraciones presentadas y el trabajo de cada responsable.",
    use: ["Úselo en las reuniones de equipo para ver quién tiene qué."],
  },
  "team": {
    title: "Equipo y auditoría",
    see: "Las personas que usan el sistema y un registro de todo lo que han hecho. Solo se agrega, nunca se borra.",
    use: ["Revise quién tiene activa la verificación en dos pasos.", "La auditoría sirve para saber quién abrió o descargó un documento."],
  },
  "settings": {
    title: "Configuración",
    see: "Los datos de su firma, el uso de su plan y las protecciones de seguridad activas.",
    use: ["Las barras muestran cuántos usuarios y clientes lleva usados frente al límite de su plan."],
  },
};

export type HelpKey = keyof typeof HELP;
