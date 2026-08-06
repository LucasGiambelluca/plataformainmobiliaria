import {
  LOCALIDADES,
  localidadSchema,
  normalizarLocalidad,
} from "@/shared/constants/localidades";

describe("catálogo de localidades", () => {
  it("no repite ninguna", () => {
    expect(new Set(LOCALIDADES).size).toBe(LOCALIDADES.length);
  });

  it("viene ordenado alfabéticamente en castellano", () => {
    // Es el orden en el que se muestra el desplegable: si el catálogo se
    // desordena al agregar una localidad, la lista queda ilegible.
    const ordenado = [...LOCALIDADES].sort((a, b) => a.localeCompare(b, "es"));
    expect([...LOCALIDADES]).toEqual(ordenado);
  });

  it("entra en la columna de la base", () => {
    // property.city y appraisal.city son VarChar(120).
    for (const localidad of LOCALIDADES) {
      expect(localidad.length).toBeLessThanOrEqual(120);
    }
  });

  it("no tiene espacios de más ni nombres vacíos", () => {
    for (const localidad of LOCALIDADES) {
      expect(localidad).toBe(localidad.trim());
      expect(localidad).not.toMatch(/\s{2,}/);
      expect(localidad.length).toBeGreaterThan(0);
    }
  });
});

describe("localidadSchema", () => {
  it("acepta un nombre del catálogo", () => {
    expect(localidadSchema.parse("Paraná")).toBe("Paraná");
  });

  it("rechaza el mismo nombre sin tilde", () => {
    // Es todo el punto del catálogo cerrado: "Parana" y "Paraná" convivían en
    // la base y el reparto de tasaciones no las cruzaba.
    expect(localidadSchema.safeParse("Parana").success).toBe(false);
  });

  it("rechaza una localidad de otra provincia y el texto vacío", () => {
    expect(localidadSchema.safeParse("Rosario").success).toBe(false);
    expect(localidadSchema.safeParse("").success).toBe(false);
  });

  it("explica qué hacer cuando el valor no está", () => {
    const r = localidadSchema.safeParse("Cualquier Cosa");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/de la lista/i);
  });
});

describe("normalizarLocalidad", () => {
  it("resuelve el mismo nombre escrito de cualquier forma", () => {
    for (const escrito of ["Paraná", "parana", "PARANA", "  Paraná  ", "PaRaNá"]) {
      expect(normalizarLocalidad(escrito)).toBe("Paraná");
    }
  });

  it("colapsa los espacios de más del medio", () => {
    expect(normalizarLocalidad("Concepcion  del   Uruguay")).toBe(
      "Concepción del Uruguay",
    );
  });

  it("devuelve null cuando no hay ninguna que le corresponda", () => {
    expect(normalizarLocalidad("Rosario")).toBeNull();
    expect(normalizarLocalidad("")).toBeNull();
  });

  it("deja pasar todas las del catálogo tal cual están", () => {
    for (const localidad of LOCALIDADES) {
      expect(normalizarLocalidad(localidad)).toBe(localidad);
    }
  });
});
