const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default () => ({
  app: {
    port: toNumber(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'log',
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  dian: {
    environment: process.env.DIAN_ENVIRONMENT || 'testing',
    profileExecutionId: process.env.DIAN_PROFILE_EXECUTION_ID || '2',
    sendMode: process.env.DIAN_SEND_MODE || 'sync',
    softwareId: process.env.DIAN_SOFTWARE_ID,
    softwarePin: process.env.DIAN_SOFTWARE_PIN,
    wsdlTest: process.env.DIAN_WSDL_TEST,
    wsdlProd: process.env.DIAN_WSDL_PROD,
    testSetId: process.env.DIAN_TEST_SET_ID,
    qrTestUrl: process.env.DIAN_QR_TEST_URL,
    qrProdUrl: process.env.DIAN_QR_PROD_URL,
    technicalKey: process.env.DIAN_TECHNICAL_KEY,
    soap: {
      timeoutMs: toNumber(process.env.DIAN_SOAP_TIMEOUT_MS, 20000),
      maxRetries: toNumber(process.env.DIAN_SOAP_MAX_RETRIES, 2),
      retryBaseMs: toNumber(process.env.DIAN_SOAP_RETRY_BASE_MS, 400),
      retryMaxMs: toNumber(process.env.DIAN_SOAP_RETRY_MAX_MS, 4000),
    },
    wsSecurity: {
      enabled: process.env.DIAN_WS_SECURITY_ENABLED || 'false',
      username: process.env.DIAN_WS_SECURITY_USERNAME,
      password: process.env.DIAN_WS_SECURITY_PASSWORD,
      mustUnderstand: process.env.DIAN_WS_SECURITY_MUST_UNDERSTAND || 'true',
      hasTimeStamp: process.env.DIAN_WS_SECURITY_HAS_TIMESTAMP || 'true',
      hasNonce: process.env.DIAN_WS_SECURITY_HAS_NONCE || 'true',
    },
    asyncReconciliation: {
      enabled: process.env.DIAN_ASYNC_RECONCILIATION_ENABLED || 'false',
      intervalMs: toNumber(process.env.DIAN_ASYNC_RECONCILIATION_INTERVAL_MS, 60000),
      batchSize: toNumber(process.env.DIAN_ASYNC_RECONCILIATION_BATCH_SIZE, 20),
    },
    reprocessPolicy: {
      allowedStatusCodes: process.env.DIAN_REPROCESS_ALLOWED_STATUS_CODES || '',
      blockedStatusCodes: process.env.DIAN_REPROCESS_BLOCKED_STATUS_CODES || '',
      blockedRuleCodePrefixes: process.env.DIAN_REPROCESS_BLOCKED_RULE_PREFIXES || '',
      requireApprovalForBlocked: process.env.DIAN_REPROCESS_REQUIRE_APPROVAL_FOR_BLOCKED || 'true',
    },
    company: {
      nit: process.env.DIAN_COMPANY_NIT,
      dv: process.env.DIAN_COMPANY_DV,
      name: process.env.DIAN_COMPANY_NAME,
      regime: process.env.DIAN_COMPANY_REGIME,
      taxLevelCode: process.env.DIAN_COMPANY_TAX_LEVEL,
      responsibility: process.env.DIAN_COMPANY_RESPONSIBILITY,
      phone: process.env.DIAN_COMPANY_PHONE,
      email: process.env.DIAN_COMPANY_EMAIL,
      address: process.env.DIAN_COMPANY_ADDRESS,
      cityCode: process.env.DIAN_COMPANY_CITY_CODE,
      cityName: process.env.DIAN_COMPANY_CITY_NAME,
      departmentCode: process.env.DIAN_COMPANY_DEPARTMENT_CODE,
      departmentName: process.env.DIAN_COMPANY_DEPARTMENT_NAME,
      countryCode: process.env.DIAN_COMPANY_COUNTRY_CODE,
      countryName: process.env.DIAN_COMPANY_COUNTRY_NAME,
      municipalityCode: process.env.DIAN_COMPANY_MUNICIPALITY_CODE,
    },
    resolution: {
      number: process.env.DIAN_RESOLUTION_NUMBER,
      prefix: process.env.DIAN_RESOLUTION_PREFIX,
      from: toNumber(process.env.DIAN_RESOLUTION_FROM, 1),
      to: toNumber(process.env.DIAN_RESOLUTION_TO, 99999999),
      validFrom: process.env.DIAN_RESOLUTION_VALID_FROM,
      validTo: process.env.DIAN_RESOLUTION_VALID_TO,
    },
  },
  certificate: {
    path: process.env.CERTIFICATE_PATH,
    passphrase: process.env.CERTIFICATE_PASSPHRASE,
  },
  mail: {
    host: process.env.MAIL_HOST,
    port: toNumber(process.env.MAIL_PORT, 587),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM,
  },
  pdf: {
    outputDir: process.env.PDF_OUTPUT_DIR || './tmp/pdf',
    printerWidthMm: toNumber(process.env.POS_PRINTER_WIDTH_MM, 80),
  },
  integration: {
    invoicesApiKey: process.env.INVOICES_API_KEY || 'dev-invoices-key',
  },
  auditArtifacts: {
    csvSignature: {
      enabled: process.env.CSV_SIGNATURE_ENABLED || 'false',
      hmacSecret: process.env.CSV_SIGNATURE_HMAC_SECRET,
      keyId: process.env.CSV_SIGNATURE_KEY_ID || 'csv-hmac-v1',
    },
  },
});