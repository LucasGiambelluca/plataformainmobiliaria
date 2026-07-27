import { S3StorageProvider } from "@/shared/services/storage";

/**
 * La ida y vuelta URL ↔ clave no es cosmética: de ella depende poder borrar el
 * objeto cuando se elimina una propiedad o un archivo. Si se rompe, el storage
 * acumula huérfanos que siguen ocupando el plan del cliente.
 *
 * Solo se ejercitan los métodos puros; los que hablan con S3 se cubren con el
 * FakeStorageProvider en los tests de MediaService.
 */
function makeProvider(publicUrl: string) {
  return new S3StorageProvider({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "inmobiliaria-media",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicUrl,
    uploadUrlTtlMinutes: 10,
  });
}

const KEY = "tenants/t-1/properties/p-1/m-1.jpg";

describe("S3StorageProvider", () => {
  it("arma la URL pública sobre la base configurada", () => {
    const provider = makeProvider("https://cdn.plataforma.com");
    expect(provider.publicUrlFor(KEY)).toBe(`https://cdn.plataforma.com/${KEY}`);
  });

  it("tolera la barra final en la base", () => {
    const provider = makeProvider("https://cdn.plataforma.com/");
    expect(provider.publicUrlFor(KEY)).toBe(`https://cdn.plataforma.com/${KEY}`);
  });

  it("recupera la clave desde una URL propia", () => {
    const provider = makeProvider("https://cdn.plataforma.com");
    expect(provider.keyFromPublicUrl(provider.publicUrlFor(KEY))).toBe(KEY);
  });

  it("funciona con una base que incluye el bucket en el path (MinIO)", () => {
    const provider = makeProvider("http://localhost:9000/inmobiliaria-media");
    const url = provider.publicUrlFor(KEY);
    expect(url).toBe(`http://localhost:9000/inmobiliaria-media/${KEY}`);
    expect(provider.keyFromPublicUrl(url)).toBe(KEY);
  });

  it("devuelve null para una URL de otro origen", () => {
    const provider = makeProvider("https://cdn.plataforma.com");
    expect(provider.keyFromPublicUrl("https://otro-cdn.com/foto.jpg")).toBeNull();
  });
});
