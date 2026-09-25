# Plan de Implementacion por Sprints (DIAN)

Fecha base: 2026-09-24
Alcance: cerrar brechas criticas y altas para operar facturacion electronica DIAN en produccion desde POS/ERP con trazabilidad completa.

## Resumen ejecutivo

- Duracion total sugerida: 4 sprints de 1 semana (4 semanas) o 2 sprints de 2 semanas (4 semanas).
- Objetivo final: emision DIAN end-to-end con WS-Security, AttachedDocument, resiliencia operativa, y auditoria completa.
- Criterio de salida: cumplimiento funcional de los 11 pasos del checklist, con pruebas automatizadas y monitoreo.

## Estado de ejecucion (corte: 2026-09-24)

- Sprint 1: implementado en backend (guard de API key, idempotencia, bloqueo de CUFE manual en produccion, trazabilidad de origen).
- Sprint 2: implementado en backend (WS-Security configurable, retry/backoff/jitter, timeout SOAP, logging con correlationId).
- Sprint 3: implementado en backend (AttachedDocument, tercer adjunto por correo, ampliacion de persistencia y timeline).
- Sprint 4: implementado parcialmente (PaymentTerms, validacion tecnica interna de XML, worker y endpoint de reconciliacion async, politica de reproceso por codigo/estado DIAN con override auditado, recomendacion automatica, snapshot de aprobacion versionada, registro de despliegue por ambiente, reporte mensual consolidado y exportacion CSV mensual/versionado con hash SHA-256 y firma HMAC-SHA256 opcional).

Pendientes globales de cierre final:

- Integracion completa del flujo POS externo para eliminar caminos paralelos fuera del emisor DIAN.
- Validacion formal XSD/Schematron del anexo tecnico DIAN (actualmente hay validacion interna por reglas).
- Ampliar suite de pruebas hacia integracion SOAP y E2E (ya existe base unitaria automatizada).
- Operar ciclo recurrente de recomendacion/aprobacion/despliegue usando reporte mensual consolidado y exportaciones CSV (mensual y por snapshot) con verificacion de hash SHA-256 y firma HMAC-SHA256 opcional como salida de control.

## Sprint 1 - Integracion operativa y seguridad base (Critico)

Estado: Implementado en este repositorio.

Objetivo:
- El flujo POS/ERP debe emitir por el servicio DIAN real, sin CUFE manual.
- Endpoints criticos protegidos con autenticacion/autorizacion.

Entregables tecnicos:
- Integracion de llamada desde canal POS/ERP hacia POST de emision DIAN.
- Eliminacion de dependencia de CUFE ingresado manualmente para la operacion normal.
- Guardas de seguridad para endpoints de invoices (JWT/API key interna y permisos).
- Idempotencia inicial por invoiceNumber para evitar doble emision accidental.

Tareas:
- Crear facade de integracion para que el origen de datos de factura sea orden de venta del ERP/POS.
- Agregar validaciones de negocio para rechazar facturas con CUFE externo en modo produccion.
- Incorporar control de acceso en [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L33).
- Definir contrato de respuesta de emision para consumidor POS/ERP.

Criterios de aceptacion:
- No existe camino feliz de emision con CUFE manual en produccion.
- Toda emision deja audit trail con usuario/origen/saleOrderId.
- Endpoint de emision no responde si no hay credencial valida.

Riesgos:
- Dependencia de cambios en servicio de POS/ERP externo.

Delta pendiente:
- Completar adopcion del endpoint de emision DIAN desde nomina-morchis/nomina-api para evitar doble flujo operativo.

## Sprint 2 - WS-Security + resiliencia DIAN (Critico/Alto)

Estado: Implementado en este repositorio.

Objetivo:
- Endurecer cliente SOAP DIAN con seguridad y tolerancia a fallos transitorios.

Entregables tecnicos:
- WS-Security implementado en cliente SOAP (segun esquema DIAN del ambiente).
- Timeouts por operacion SOAP configurables por entorno.
- Reintentos con backoff exponencial y jitter para errores transitorios.
- Logging estructurado por transaccion DIAN (correlationId, invoiceNumber, trackId).

Tareas:
- Extender [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L61) para configurar seguridad SOAP.
- Agregar politica de retry/timeout y clasificacion de errores.
- Definir tabla de errores DIAN recuperables vs no recuperables.
- Agregar pruebas de integracion con mock SOAP.

Criterios de aceptacion:
- Error transitorio de red no causa perdida de emision (hasta max retries).
- Error no recuperable de DIAN se persiste con detalle completo.
- Metricas de tiempo de respuesta y tasa de error visibles en logs.

Riesgos:
- Variacion de politicas WS-Security segun proveedor/endpoint.

Delta pendiente:
- Prueba de humo en ambiente habilitacion/produccion con credenciales finales del emisor.

## Sprint 3 - AttachedDocument + ciclo de vida + persistencia completa (Alto)

Estado: Implementado en este repositorio.

Objetivo:
- Completar artefactos regulatorios y trazabilidad documental.

Entregables tecnicos:
- Generador de AttachedDocument.xml.
- Envio de correo con PDF + XML firmado + AttachedDocument.
- Modelo de persistencia ampliado con campos de trazabilidad completa.
- Estados ampliados del ciclo de vida (DRAFT, PENDING, SENDING, SENT, PDF_GENERATED, EMAILED, CANCELLED).

Tareas:
- Crear modulo AttachedDocumentGenerator.
- Extender [src/modules/mail/mail.service.ts](../src/modules/mail/mail.service.ts#L41) para adjuntar tercer documento.
- Extender schema [src/modules/invoices/schemas/invoice.schema.ts](../src/modules/invoices/schemas/invoice.schema.ts#L8) con:
  - responseXml
  - applicationResponse
  - attachedDocumentXml
  - sentAt
  - validatedAt
  - emailedAt
  - errors[] tipados
  - transitionHistory[]
- Migracion de datos para documentos previos.

Criterios de aceptacion:
- Factura validada genera AttachedDocument de forma deterministica.
- Correo sale con 3 adjuntos en flujo aprobado.
- Se puede reconstruir toda la linea temporal de cada factura.

Riesgos:
- Tamano de documentos en MongoDB; posible necesidad de almacenamiento externo.

Delta pendiente:
- Definir politica de offload/archivo externo de artefactos para volumen alto.

## Sprint 4 - Cumplimiento tecnico UBL/DIAN + pruebas y operacion (Medio/Alto)

Estado: Parcialmente implementado en este repositorio.

Objetivo:
- Cerrar brechas de cumplimiento fino y calidad operacional.

Entregables tecnicos:
- Inclusion de PaymentTerms si aplica al perfil.
- Validacion automatica XML (XSD/Schematron/anexo vigente).
- Worker para polling de estados async (GetStatus) y cierre automatico.
- Pruebas E2E del flujo completo.

Tareas:
- Ajustar [src/modules/ubl/ubl.service.ts](../src/modules/ubl/ubl.service.ts#L385) para nodos faltantes segun reglas.
- Implementar worker scheduler para trackIds pendientes.
- Agregar suite de pruebas por modulo (UBL, Signing, DIAN client, workflow).
- Dashboard minimo: pendientes, rechazadas por codigo, tiempo de validacion.

Criterios de aceptacion:
- Todas las validaciones tecnicas internas pasan antes de enviar a DIAN.
- Cola async converge a estado final sin accion manual.
- Cobertura de pruebas minima acordada (ej. >= 70% en modulos criticos).

Delta pendiente:
- Integrar validador formal XSD/Schematron (todavia no implementado).
- Ampliar pruebas automatizadas a integracion y E2E (base unitaria ya implementada).
- Estandarizar maquina de estados y ajustar catalogo de politicas de reproceso por codigo DIAN real.
- Usar endpoints de catalogo y recomendacion de rechazos para aprobar listas finales de bloqueo con el equipo operativo.
- Registrar snapshots de aprobacion con version, ticket y aprobador via endpoint dedicado para auditoria.
- Registrar por cada version aprobada la evidencia de despliegue (ambiente/ticket/usuario/snippet aplicado).
- Generar y archivar reporte mensual consolidado (metricas + recomendacion + aprobaciones + despliegues).
- Generar y archivar exportacion CSV del reporte mensual como soporte de comite/auditoria.
- Generar exportacion CSV por version aprobada para soporte puntual de auditoria y trazabilidad de cambios.
- Verificar y archivar hash SHA-256 de cada CSV exportado como evidencia de integridad documental.
- Si se habilita firma, verificar y archivar la firma HMAC-SHA256 (`X-Content-Signature`) y key id (`X-Content-Signature-Key-Id`) por cada CSV exportado.

## Dependencias y orden recomendado

1. Sprint 1 antes de todos (bloquea operacion segura).
2. Sprint 2 antes de salida a produccion.
3. Sprint 3 para cumplimiento documental y auditoria completa.
4. Sprint 4 para robustez final y escalabilidad operativa.

## KPI de seguimiento

- Tasa de aprobacion DIAN por dia.
- Tiempo promedio desde creacion hasta VALIDATED.
- Porcentaje de reintentos exitosos.
- Porcentaje de facturas con trazabilidad completa (request/response/artefactos/fechas).
- Errores por categoria: validacion, firma, SOAP, negocio.

## Definition of Done global

- Flujo POS/ERP emite por DIAN sin pasos manuales de CUFE.
- WS-Security y resiliencia activos en produccion.
- AttachedDocument generado y enviado.
- Trazabilidad completa persistida.
- Checklist DIAN interno marcado como cumplido con evidencia tecnica y pruebas.