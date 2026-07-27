// Variables mínimas para que la validación de env no falle en los tests unitarios.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://app:devpassword@localhost:5432/realestate_test?schema=public";
process.env.JWT_SECRET ??= "test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-32-characters-long";
process.env.LOG_LEVEL = "silent";
// Los tests que tocan storage inyectan su propio FakeStorageProvider; esto solo
// evita que el provider compartido intente hablar con S3 al importar un router.
process.env.STORAGE_PROVIDER ??= "fake";
