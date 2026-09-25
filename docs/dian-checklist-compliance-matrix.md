# Matriz de Cumplimiento Checklist DIAN vs Implementacion Actual

Fecha de revision: 2026-09-24
Ambito revisado principal: api-facturador-electronico
Ambito complementario: nomina-api + nomina-morchis para flujo POS

Leyenda de estado:
- Implementado
- Parcial
- No implementado

## Matriz

| Paso checklist | Estado actual | Evidencia tecnica | Brecha detectada | Prioridad | Recomendacion concreta |
|---|---|---|---|---|---|
| 1. Crear factura con datos minimos | Parcial | [src/modules/invoices/dto/create-invoice.dto.ts](../src/modules/invoices/dto/create-invoice.dto.ts#L12), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L42), [src/common/guards/invoices-api-key.guard.ts](../src/common/guards/invoices-api-key.guard.ts#L1) | El backend ya bloquea CUFE manual en produccion, pero falta integrar completamente el POS actual al endpoint DIAN (todavia existe flujo POS separado en otro repositorio) | Critica | Completar integracion de nomina-morchis/nomina-api para que emitan siempre via este servicio |
| 2. Generar XML UBL 2.1 | Implementado | [src/modules/ubl/ubl.service.ts](../src/modules/ubl/ubl.service.ts#L75), [src/modules/ubl/ubl.service.ts](../src/modules/ubl/ubl.service.ts#L390) | La validacion tecnica actual es interna por reglas de nodos, falta validador formal XSD/Schematron del anexo DIAN | Media | Integrar validacion formal XSD/Schematron previa a envio |
| 3. Firmar XML (XMLDSIG + XAdES) | Implementado (base) | [src/modules/signing/signing.service.ts](../src/modules/signing/signing.service.ts#L37), [src/modules/signing/signing.service.ts](../src/modules/signing/signing.service.ts#L104) | Falta hardening operativo y pruebas automatizadas de interoperabilidad con certificados reales de emisor | Alta | Agregar pruebas de firma y validacion con certificados reales de preproduccion |
| 4. Calcular CUFE SHA384 | Implementado | [src/modules/ubl/ubl.service.ts](../src/modules/ubl/ubl.service.ts#L12), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L140) | El riesgo operativo remanente esta en la coexistencia con flujo POS externo aun no integrado | Critica | Finalizar integracion de front/API POS al endpoint DIAN unico |
| 5. Generar ZIP con XML firmado | Implementado | [src/common/utils/zip.util.ts](../src/common/utils/zip.util.ts#L3), [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L20) | No hay checksum ni control avanzado de naming/payload para auditoria extra | Baja | Agregar checksum SHA del ZIP en persistencia opcional |
| 6. Enviar a DIAN (SOAP + seguridad + tiempos + reintentos) | Implementado (configurable) | [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L29), [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L132), [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L188) | Requiere activar y probar WS-Security con credenciales productivas reales del emisor | Alta | Ejecutar prueba de humo en habilitacion y produccion con credenciales finales |
| 7. Procesar respuesta DIAN completa | Implementado (base) | [src/modules/dian/dian-response.parser.ts](../src/modules/dian/dian-response.parser.ts#L1), [src/modules/dian/dian.service.ts](../src/modules/dian/dian.service.ts#L16), [tests/dian-response-parser.test.js](../tests/dian-response-parser.test.js#L1) | Existe parser tipado y pruebas de contrato base; falta ampliar cobertura de casos DIAN no felices de produccion | Media | Extender matriz de casos DIAN reales y pruebas de regresion por ambiente |
| 8. Guardar informacion en coleccion dedicada | Implementado | [src/modules/invoices/schemas/invoice.schema.ts](../src/modules/invoices/schemas/invoice.schema.ts#L8), [src/modules/invoices/schemas/invoice.schema.ts](../src/modules/invoices/schemas/invoice.schema.ts#L57), [src/modules/invoices/schemas/invoice.schema.ts](../src/modules/invoices/schemas/invoice.schema.ts#L86) | Pendiente opcional: storage externo para binarios/documentos por volumen | Media | Diseñar estrategia de archivado y offload de artefactos |
| 9. Generar PDF representacion grafica | Implementado | [src/modules/pdf/pdf.service.ts](../src/modules/pdf/pdf.service.ts#L21) | Plantilla funcional pero sin trazabilidad de version de formato ni almacenamiento externo | Media | Versionar plantilla y definir storage de artefactos para crecimiento |
| 10. Generar AttachedDocument | Implementado | [src/modules/attached-document/attached-document.service.ts](../src/modules/attached-document/attached-document.service.ts#L1), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L83) | Falta validar estructura exacta contra anexo tecnico vigente en ambiente real | Media | Ejecutar validacion documental con casos reales DIAN y ajustes finos de esquema |
| 11. Enviar al cliente PDF + XML + AttachedDocument | Implementado | [src/modules/mail/mail.service.ts](../src/modules/mail/mail.service.ts#L43), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L109) | Pendiente opcion de reintento de correo/cola desacoplada | Media | Mover envio a cola de mensajeria con politica de reintentos |
| Manejo de errores DIAN (no emitir si rechazada, corregir y reenviar) | Implementado | [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L334), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L349), [src/modules/invoices/reprocess-policy.util.ts](../src/modules/invoices/reprocess-policy.util.ts#L1), [src/modules/invoices/monthly-report-csv.util.ts](../src/modules/invoices/monthly-report-csv.util.ts#L1), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L189), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L215), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L267), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L300), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L348), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L411), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L444), [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L475), [src/modules/invoices/dto/reprocess-invoice.dto.ts](../src/modules/invoices/dto/reprocess-invoice.dto.ts#L1), [src/modules/invoices/dto/approve-reprocess-policy.dto.ts](../src/modules/invoices/dto/approve-reprocess-policy.dto.ts#L1), [src/modules/invoices/dto/register-policy-deployment.dto.ts](../src/modules/invoices/dto/register-policy-deployment.dto.ts#L1), [src/modules/invoices/schemas/reprocess-policy-approval.schema.ts](../src/modules/invoices/schemas/reprocess-policy-approval.schema.ts#L1), [tests/reprocess-policy.util.test.js](../tests/reprocess-policy.util.test.js#L1), [tests/monthly-report-csv.util.test.js](../tests/monthly-report-csv.util.test.js#L1) | Politica por statusCode/regla, override auditado, recomendacion automatica, aprobacion versionada, evidencia por ambiente, reporte mensual consolidado y exportacion CSV (mensual/versionado) con hash SHA-256 y firma HMAC-SHA256 opcional implementados; resta disciplina operativa continua | Baja | Operar y monitorear ciclo mensual con artefactos CSV verificables por hash (X-Content-SHA256) y firma (X-Content-Signature) para comite operativo/fiscal |
| Estados recomendados extendidos | Implementado (base) | [src/modules/invoices/types/invoice.types.ts](../src/modules/invoices/types/invoice.types.ts#L1), [src/modules/invoices/invoices.service.ts](../src/modules/invoices/invoices.service.ts#L120) | No todas las transiciones se usan en todas las rutas; falta estandarizar maquina de estados | Media | Implementar state machine central para transiciones validas |
| Seguridad de endpoints de emision | Implementado | [src/modules/invoices/invoices.controller.ts](../src/modules/invoices/invoices.controller.ts#L32), [src/common/guards/invoices-api-key.guard.ts](../src/common/guards/invoices-api-key.guard.ts#L1) | Se usa API key interna; falta capa complementaria si exponen publicamente (JWT/mTLS/IP allowlist) | Media | Agregar defensa en profundidad segun topologia de despliegue |
| Pruebas automatizadas del modulo | Implementado (base) | [tests/ubl.service.test.js](../tests/ubl.service.test.js#L1), [tests/attached-document.service.test.js](../tests/attached-document.service.test.js#L1), [tests/invoices-api-key.guard.test.js](../tests/invoices-api-key.guard.test.js#L1), [tests/dian-response-parser.test.js](../tests/dian-response-parser.test.js#L1), [package.json](../package.json#L10) | Aun faltan pruebas E2E e integracion SOAP contra ambientes de prueba DIAN | Media | Incorporar pruebas de integracion y E2E del flujo completo |

## Brechas transversales

- Arquitectura: se fortalecio separacion por modulos (UBL, firma, DIAN, AttachedDocument, reconciliacion), pero falta cerrar brecha de integracion completa con flujo POS externo.
- Seguridad: se implemento API key interna y WS-Security configurable; falta validacion operativa final con credenciales reales y defensa en profundidad en despliegue.
- Rendimiento: ya existe resiliencia SOAP con retry/timeout; pendiente optimizacion de carga de certificado para alta concurrencia.
- Persistencia: se amplio trazabilidad (response, timestamps, timeline, errores, attachedDocument); pendiente estrategia de archivado externo para crecimiento.
- Observabilidad de rechazos: se incorporo consolidado de statusCode/ruleCodes de rechazo para ajustar politicas de reproceso basadas en historico real.
- Gobierno operativo: se incorporo reporte mensual consolidado con recomendacion, snapshots aprobados, despliegues por ambiente y exportacion CSV (mensual y por version) con hash SHA-256 y firma HMAC-SHA256 opcional para auditoria/comites.

## Prioridad consolidada

- Critica:
  - Integracion POS/ERP al flujo DIAN real sin CUFE manual.
- Alta:
  - Validacion formal XSD/Schematron.
- Media:
  - Estandarizacion de maquina de estados.
  - Defensa en profundidad de seguridad (segun despliegue).
  - Ampliar cobertura de pruebas (integracion y E2E).
- Baja:
  - Institucionalizar ciclo operativo mensual de revision/aprobacion del catalogo de bloqueo DIAN.
  - Controles complementarios de naming/checksum ZIP y mejoras de plantilla/document storage.

## Resultado esperado al cerrar la matriz

- Emision real desde POS/ERP, firma y CUFE calculados por backend.
- Envio seguro y resiliente a DIAN.
- Respuesta DIAN procesada y trazabilidad completa persistida.
- Generacion de PDF y AttachedDocument.
- Envio al cliente con evidencia completa de entrega.