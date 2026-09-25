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

## Swagger

Con la API levantada, la documentacion OpenAPI/Swagger queda disponible en:

- `http://localhost:3002/api/v1/docs`

Si cambia el puerto (`PORT`) o el prefijo (`API_PREFIX`), la ruta de Swagger se ajusta automaticamente a esos valores.

## API Endpoints

- `POST /api/v1/invoices/from-sale-order`: crea y envia factura electronica a DIAN.
- `GET /api/v1/invoices`: lista facturas almacenadas con paginacion y filtros.
- `GET /api/v1/invoices/:invoiceNumber`: consulta una factura por consecutivo.
- `GET /api/v1/invoices/track/:trackId/status`: consulta estado DIAN por `trackId`.

### cURL Quickstart

Puede ejecutar estos comandos en terminal para pruebas manuales:

```bash
# 1) Crear factura DIAN desde orden de venta
curl -X POST "http://localhost:3002/api/v1/invoices/from-sale-order" \
  -H "Content-Type: application/json" \
  -d '{
    "saleOrderId": "SO-REAL-TEST-20260923-001",
    "resolutionPrefix": "SETP",
    "resolutionNumber": 98002,
    "issueDateTime": "2026-09-23T10:45:00-05:00",
    "paymentDueDate": "2026-09-23T10:45:00-05:00",
    "paymentMeansCode": "10",
    "currencyCode": "COP",
    "sendEmail": false,
    "notes": ["Prueba DIAN habilitacion", "Creada desde cURL"],
    "customer": {
      "identificationType": "13",
      "identificationNumber": "1020304050",
      "legalName": "Cliente Prueba Real",
      "email": "cliente.prueba@correo.com",
      "phone": "3001234567",
      "address": "Cra 15 # 93-47",
      "cityCode": "11001",
      "cityName": "Bogota",
      "departmentCode": "11",
      "departmentName": "Bogota D.C.",
      "countryCode": "CO",
      "countryName": "Colombia"
    },
    "items": [
      {
        "sku": "PRD-TEST-001",
        "description": "Producto prueba habilitacion",
        "unitCode": "EA",
        "quantity": 2,
        "unitPrice": 25000,
        "discountAmount": 0,
        "taxes": [
          {
            "code": "01",
            "name": "IVA",
            "percent": 19
          }
        ]
      }
    ],
    "metadata": {
      "source": "ERP",
      "channel": "API_TEST_REAL"
    }
  }'

# 2) Listar facturas con paginacion y filtros
curl "http://localhost:3002/api/v1/invoices?page=1&limit=20&status=VALIDATED&invoiceNumber=SETP&dateFrom=2026-01-01&dateTo=2026-12-31"

# 3) Consultar factura por consecutivo
curl "http://localhost:3002/api/v1/invoices/SETP98002"

# 4) Consultar estado DIAN por TrackId
curl "http://localhost:3002/api/v1/invoices/track/79d8db7efc1f1d1fe0dcb7aaf5336e18f0eb6d8ff9c8cb2a8ec9db4dc6a1234/status"
```

### Listado de Facturas (Paginado)

Endpoint: `GET /api/v1/invoices`

Query params disponibles:

- `page` (opcional, default `1`): numero de pagina.
- `limit` (opcional, default `20`, rango `1..100`): tamano de pagina.
- `status` (opcional): filtra por estado (`CREATED`, `XML_GENERATED`, `SIGNED`, `SUBMITTED`, `VALIDATED`, `REJECTED`).
- `invoiceNumber` (opcional): busqueda parcial por consecutivo (case-insensitive).
- `dateFrom` (opcional): fecha inicial de creacion (`YYYY-MM-DD` o ISO 8601).
- `dateTo` (opcional): fecha final de creacion (`YYYY-MM-DD` o ISO 8601).

Ejemplo:

```http
GET /api/v1/invoices?page=1&limit=20&status=VALIDATED&invoiceNumber=SETP&dateFrom=2026-01-01&dateTo=2026-12-31
```

Respuesta:

```json
{
  "items": [
    {
      "invoiceNumber": "SETP98001",
      "saleOrderId": "SO-2026-000981",
      "cufe": "f9f6aa8d263b97e87e8f95dc31f63fe3f7f7049d2f0fd25f8f6a6aa25a8d541e",
      "status": "VALIDATED"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 125,
    "totalPages": 7
  }
}
```

Si los parametros son invalidos (por ejemplo `page < 1`, `limit > 100` o fechas invalidas), la API responde `400 Bad Request`.

## Recommended Runtime Versions

Para esta version del proyecto (NestJS 12) se recomienda:

- Node.js `20.x` LTS
- npm `10.x`

Puede validar versiones con:

```bash
node -v
npm -v
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
