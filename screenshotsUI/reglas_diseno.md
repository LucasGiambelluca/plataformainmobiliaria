# 📏 Reglas de Diseño y Estilos UI — BuscadorProp

Este documento contiene las reglas de diseño, tipografía, colores, espaciados y componentes de la plataforma **BuscadorProp**, utilizadas como referencia para la implementación de nuestra plataforma inmobiliaria multitenant.

---

## 🎨 Sistema de Colores

Para mantener la flexibilidad en el multitenancy, podemos abstraer estos colores en variables de CSS:

| Elemento / Rol | Color Original (CSS) | Código HEX / Equivalente | Uso y Contexto |
| :--- | :--- | :--- | :--- |
| **Texto Principal / Títulos** | `rgba(34, 34, 34, 1)` | `#222222` | Títulos principales, títulos de tarjetas y cuerpo de texto con alto contraste. |
| **Texto Secundario** | `rgba(102, 102, 102, 1)` | `#666666` | Metadatos secundarios (baños, habitaciones, metros cuadrados). |
| **Fondo Global (Body)** | `rgba(248, 249, 250, 1)` | `#F8F9FA` | Color de fondo de la web (gris muy claro para destacar las tarjetas blancas). |
| **Fondo de Tarjeta (Card)** | `rgba(255, 255, 255, 1)` | `#FFFFFF` | Fondo de las tarjetas de propiedades e inputs de búsqueda. |
| **Color de Marca (Botones)**| `rgba(0, 47, 108, 1)` | `#002F6C` | Botón principal de búsqueda e interacciones primarias. |
| **Bordes y Separadores** | `rgba(222, 226, 230, 1)` | `#DEE2E6` | Bordes finos de inputs, tarjetas y líneas divisorias. |

---

## 🅰️ Tipografía y Fuentes

El sitio web utiliza principalmente la familia tipográfica **Poppins** (Google Fonts) para toda su interfaz, lo que le da una estética moderna, geométrica y limpia.

### 1. Parámetros Globales (`body`)
*   **Fuente Principal**: `'Poppins', sans-serif;`
*   **Tamaño Base**: `16px` (1rem)
*   **Espaciado de Letras (Letter Spacing)**: `0.5px` (0.03em)
*   **Altura de Línea (Line Height)**: `1.3` (`20.8px`)

### 2. Títulos y Encabezados (`h1`, `h2`, `h3`)
*   **Títulos de Tarjetas (Property Title)**:
    *   **Tamaño**: `16px`
    *   **Peso (Weight)**: `700` (Bold)
    *   **Espaciado**: `0.5px`
    *   **Color**: `#222222`
*   **Títulos de Secciones (Sección Filtros / Home)**:
    *   **Tamaño**: `24px` a `28px`
    *   **Peso (Weight)**: `500` (Medium) o `600` (Semi-Bold)
    *   **Color**: `#222222`

### 3. Precios y Destacados
*   **Tamaño**: `16px`
*   **Peso (Weight)**: `700` (Bold)
*   **Color**: `#222222`
*   *Nota*: El precio se sitúa en la parte inferior o superior de la tarjeta con una visibilidad muy alta.

---

## 🎛️ Estructura y Componentes Clave

### 1. Botones de Acción
*   **Botón Primario**:
    *   **Fondo**: `#002F6C` (Azul corporativo)
    *   **Color de texto**: `#FFFFFF`
    *   **Bordes Redondeados**: `200px` (Completamente ovalado/píldora)
    *   **Padding**: `10px 24px`
    *   **Transiciones**: `background-color 0.2s ease-in-out`
*   **Botón Secundario (Filtros)**:
    *   **Fondo**: `#FFFFFF` con borde `#DEE2E6`
    *   **Color de texto**: `#222222`
    *   **Bordes Redondeados**: `200px`

### 2. Tarjetas de Propiedades (Property Cards)
*   **Layout**: `flex` o `grid` según el viewport.
*   **Radio de Borde (Border Radius)**: `8px` para las imágenes y la tarjeta exterior.
*   **Sombras (Box Shadow)**:
    *   *Normal*: `0px 2px 8px rgba(0, 0, 0, 0.05)` (Sombra muy sutil)
    *   *Hover*: `0px 8px 16px rgba(0, 0, 0, 0.1)` (Aumenta la elevación al pasar el cursor)
*   **Padding Interno**: `16px` de separación para los textos y metadatos.

### 3. Sistema de Grillas (Grid)
*   **Página de Resultados**:
    *   Utiliza una distribución de **dos columnas**:
        1.  *Columna Izquierda (Filtros)*: Ancho fijo de `280px` a `320px` (oculto en móviles bajo un menú colapsable).
        2.  *Columna Derecha (Grilla de Propiedades)*: Un grid dinámico:
            ```css
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 24px;
            ```

---

> [!TIP]
> **Estrategia para nuestra Arquitectura Multitenant**:
> 1.  **CSS Variables**: Define los colores clave (`--tenant-primary`, `--tenant-background`, `--tenant-text`) en `:root` para poder modificarlos dinámicamente según la inmobiliaria logueada.
> 2.  **Web Fonts**: Integra `Poppins` desde Google Fonts como tipografía por defecto en nuestro `index.html` o a través del archivo de estilos globales CSS.
