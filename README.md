# API Facturador Electronico DIAN - Morchis

Backend NestJS para facturacion electronica DIAN integrada con ERP de produccion, inventario y ventas para Morchis.

## Project Structure

```text
.
|-- examples/
|   |-- create-invoice.request.json
|   |-- create-invoice.response.json
|   |-- dian-status.response.json
|   `-- sample-invoice.xml
|-- src/
|   |-- app.module.ts
|   |-- main.ts
|   |-- common/
|   |   |-- config/
|   |   |   |-- configuration.ts
|   |   |   `-- env.validation.ts
|   |   |-- filters/
|   |   |   `-- http-exception.filter.ts
|   |   |-- interceptors/
|   |   |   `-- logging.interceptor.ts
|   |   |-- logger/
|   |   |   |-- app-logger.service.ts
|   |   |   `-- logger.module.ts
|   |   `-- utils/
|   |       |-- date.util.ts
|   |       |-- number.util.ts
|   |       `-- zip.util.ts
|   `-- modules/
|       |-- dian/
|       |   |-- dian.module.ts
|       |   `-- dian.service.ts
|       |-- invoices/
|       |   |-- dto/
|       |   |-- schemas/
|       |   |-- types/
|       |   |-- invoices.controller.ts
|       |   |-- invoices.module.ts
|       |   `-- invoices.service.ts
|       |-- mail/
|       |   |-- mail.module.ts
|       |   `-- mail.service.ts
|       |-- pdf/
|       |   |-- pdf.module.ts
|       |   `-- pdf.service.ts
|       |-- qr/
|       |   |-- qr.module.ts
|       |   `-- qr.service.ts
|       |-- signing/
|       |   |-- signing.module.ts
|       |   `-- signing.service.ts
|       `-- ubl/
|           |-- ubl.module.ts
|           `-- ubl.service.ts
|-- .env.example
|-- package.json
|-- tsconfig.build.json
`-- tsconfig.json
```

## Functional Flow

1. ERP ventas envia una orden de venta al endpoint `POST /api/v1/invoices/from-sale-order`.
2. `InvoicesService` valida resolucion, calcula totales, agrupa impuestos y prepara la factura DIAN.
3. `UblService` genera CUFE, SoftwareSecurityCode y el XML UBL 2.1 con `sts:DianExtensions`.
4. `SigningService` carga el `.p12/.pfx`, inserta la firma XAdES-BES dentro de `ext:UBLExtensions` y produce XML firmado.
5. `DianService` comprime el XML a ZIP base64 y llama `SendBillSync` o `SendBillAsync` segun ambiente.
6. `PdfService` genera PDF A4 y ticket POS de 80 mm con QR y datos fiscales.
7. `MailService` envia al cliente PDF y XML adjuntos.
8. MongoDB conserva XML, XML firmado, respuesta DIAN, PDF, ticket y traza de auditoria.

## Modules

- `InvoicesModule`: orquestacion del proceso completo desde la orden ERP hasta la persistencia.
- `UblModule`: generacion del XML UBL 2.1, CUFE y QR payload DIAN.
- `SigningModule`: lectura del certificado PKCS#12 y firma XAdES-BES.
- `DianModule`: transporte SOAP hacia DIAN y mapeo de respuestas `SendBillSync`, `SendBillAsync`, `GetStatus`.
- `PdfModule`: PDF comercial y ticket POS 80 mm.
- `MailModule`: entrega de XML/PDF por correo.
- `QrModule`: imagen QR reusable para PDF y ticket.

## Environment

Copie los valores reales de su emisor en `.env` a partir de `.env.example`.

Campos criticos:

- `DIAN_SOFTWARE_ID`
- `DIAN_SOFTWARE_PIN`
- `DIAN_TECHNICAL_KEY`
- `DIAN_RESOLUTION_*`
- `CERTIFICATE_PATH`
- `CERTIFICATE_PASSPHRASE`
- `MONGODB_URI`

## Run

```bash
npm install
npm run start:dev
```

## Example Request

Ver [examples/create-invoice.request.json](examples/create-invoice.request.json).

## Example Response

Ver [examples/create-invoice.response.json](examples/create-invoice.response.json).

## Example XML Output

Ver [examples/sample-invoice.xml](examples/sample-invoice.xml).

## Example DIAN Response Parsing

Respuesta cruda tipica `SendBillSync`:

```json
{
  "SendBillSyncResult": {
    "StatusCode": "00",
    "StatusDescription": "Procesado Correctamente.",
    "StatusMessage": "La factura ha sido autorizada",
    "XmlDocumentKey": "79d8db7efc1f1d1fe0dcb7aaf5336e18f0eb6d8ff9c8cb2a8ec9db4dc6a1234",
    "XmlBase64Bytes": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4..."
  }
}
```

Mapeo producido por `DianService`:

```json
{
  "zipName": "SETP98001.zip",
  "accepted": true,
  "pending": false,
  "rejected": false,
  "trackId": "79d8db7efc1f1d1fe0dcb7aaf5336e18f0eb6d8ff9c8cb2a8ec9db4dc6a1234",
  "statusCode": "00",
  "message": "Procesado Correctamente.",
  "errors": [],
  "applicationResponse": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4..."
}
```

Para seguimiento asincrono use `GET /api/v1/invoices/track/:trackId/status`. Ejemplo en [examples/dian-status.response.json](examples/dian-status.response.json).

## Brief Implementation Notes

- El CUFE usa SHA-384 sobre la cadena compuesta por numero, fecha, hora, valores monetarios, NIT emisor, documento adquiriente, clave tecnica y ambiente.
- El XML incluye `SoftwareSecurityCode = SHA-384(SoftwareID + SoftwarePIN + invoiceNumber)`.
- La firma se inserta dentro del segundo `ext:UBLExtension`, manteniendo la extension DIAN en la primera.
- El servicio valida el consecutivo dentro del rango configurado en la resolucion DIAN.
- Totales e impuestos se recalculan del lado servidor para evitar inconsistencias enviadas por el ERP.

## Production Readiness Notes

- Use credenciales DIAN y certificado del emisor real. No use credenciales del desarrollador.
- Antes de produccion, valide cada XML firmado contra el anexo tecnico vigente DIAN y ejecute habilitacion completa.
- La firma XAdES-BES aqui es operativa y estructurada para UBL, pero debe probarse con el certificado final del contribuyente y con los validadores de DIAN.
- Configure almacenamiento externo para PDF/XML si el volumen documental crece mas alla de lo razonable para MongoDB.
- Agregue rotacion de logs, cola de reintentos, control de idempotencia y monitoreo de errores SOAP para operacion 24x7.
- En produccion asincrona, procese `GetStatus` en un worker o scheduler para cerrar facturas pendientes.
- Haga pruebas formales con consumidores finales, resolucion vigente, catalogos de municipios y reglas tributarias por cliente.
