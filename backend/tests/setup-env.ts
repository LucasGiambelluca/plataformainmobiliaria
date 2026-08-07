// Variables mínimas para que la validación de env no falle en los tests unitarios.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://app:devpassword@localhost:5432/realestate_test?schema=public";
process.env.JWT_SECRET ??= "test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-32-characters-long";
process.env.LOG_LEVEL ??= "silent";
// Los tests que tocan storage inyectan su propio FakeStorageProvider; esto solo
// evita que el provider compartido intente hablar con S3 al importar un router.
process.env.STORAGE_PROVIDER ??= "fake";

// Los tests de integración levantan la app entera: sin esto, el módulo de
// cobros intentaría hablar con MercadoPago y el de dominios haría consultas DNS
// reales. Cada proveedor tiene su implementación fake detrás de la interfaz.
process.env.PAYMENT_PROVIDER ??= "fake";
process.env.EMAIL_PROVIDER ??= "fake";
process.env.DNS_RESOLVER ??= "fake";

// El endpoint que autoriza los certificados de Caddy rechaza TODO cuando el
// token está vacío, que es el default de env.ts. Sin esto, sus tests no podrían
// distinguir "host no autorizado" de "token sin configurar".
process.env.CADDY_ASK_TOKEN ??= "token-de-test-para-caddy";

// Clave de cifrado de prueba. Los tests de secretBox la necesitan aunque
// PAYMENT_PROVIDER sea fake, porque el módulo la lee al cifrar.
process.env.CREDENTIALS_ENCRYPTION_KEY ??=
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
