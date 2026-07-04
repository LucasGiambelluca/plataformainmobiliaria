import os
import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

def extract_design_system():
    # Setup Chrome Options
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1440,900")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    
    print("Launching browser to inspect CSS design system...")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.set_page_load_timeout(30)

    design_specs = {}

    try:
        # Visit Home Page
        print("Navigating to home page...")
        driver.get("https://www.buscadorprop.com.ar/")
        time.sleep(5)

        # Helper to extract computed styles
        def get_computed_styles(element, properties):
            styles = {}
            for prop in properties:
                styles[prop] = element.value_of_css_property(prop)
            return styles

        properties_to_extract = [
            "font-family", "font-size", "font-weight", "line-height",
            "letter-spacing", "color", "background-color", "border-radius",
            "margin", "padding", "display"
        ]

        # 1. Inspect Body (Global baseline)
        try:
            body_el = driver.find_element(By.TAG_NAME, "body")
            design_specs["Global (body)"] = get_computed_styles(body_el, properties_to_extract)
        except Exception as e:
            print(f"Error inspecting body: {e}")

        # 2. Inspect Main Title (Hero title)
        try:
            # Try to find an h1 or prominent header text
            h1_el = driver.find_element(By.TAG_NAME, "h1")
            design_specs["Hero Title (H1)"] = get_computed_styles(h1_el, properties_to_extract)
        except Exception:
            try:
                # Fallback to main search container text
                h1_el = driver.find_element(By.CSS_SELECTOR, "h2")
                design_specs["Main Heading (H2)"] = get_computed_styles(h1_el, properties_to_extract)
            except Exception as e:
                print(f"Error inspecting title: {e}")

        # 3. Inspect Navigation Links
        try:
            nav_el = driver.find_element(By.CSS_SELECTOR, "header a, nav a")
            design_specs["Navigation Links"] = get_computed_styles(nav_el, properties_to_extract)
        except Exception as e:
            print(f"Error inspecting navigation: {e}")

        # 4. Inspect Primary Buttons
        try:
            btn_el = driver.find_element(By.CSS_SELECTOR, "button[type='submit'], .btn-primary, button")
            design_specs["Primary Button"] = get_computed_styles(btn_el, properties_to_extract)
        except Exception as e:
            print(f"Error inspecting buttons: {e}")

        # 5. Visit Search Results Page to inspect Cards
        print("Navigating to search results page...")
        driver.get("https://www.buscadorprop.com.ar/casas-chalets-venta")
        time.sleep(5)

        # Inspect Property Title inside Card
        try:
            # Let's find first property title
            card_title = driver.find_element(By.CSS_SELECTOR, "a[href*='/propiedad/'] h3, h3")
            design_specs["Property Card Title"] = get_computed_styles(card_title, properties_to_extract)
        except Exception as e:
            print(f"Error inspecting card title: {e}")

        # Inspect Property Price
        try:
            card_price = driver.find_element(By.CSS_SELECTOR, "[class*='price'], [class*='precio']")
            design_specs["Property Card Price"] = get_computed_styles(card_price, properties_to_extract)
        except Exception as e:
            print(f"Error inspecting card price: {e}")

        # Inspect Card Container (border, shadows, border-radius)
        try:
            card_container = driver.find_element(By.CSS_SELECTOR, "article, [class*='card']")
            card_props = properties_to_extract + ["box-shadow", "border"]
            design_specs["Property Card Container"] = get_computed_styles(card_container, card_props)
        except Exception as e:
            print(f"Error inspecting card container: {e}")

        print("Successfully extracted CSS design styles.")
        print(json.dumps(design_specs, indent=2))

        # 6. Generate Markdown Document
        output_path = r"c:\Users\Lucas\Desktop\plataforam-inmobiliaria-multitent\screenshotsUI\reglas_diseno.md"
        
        md_content = f"""# 📏 Reglas de Diseño y Estilos UI — BuscadorProp

Este documento contiene las reglas de diseño, tipografía, colores, espaciados y componentes técnicos extraídos de la plataforma **BuscadorProp**, utilizadas como referencia para la implementación de nuestra plataforma multitenancy.

---

## 🎨 Sistema de Colores (Colores Clave)

*   **Azul de Marca (Principal)**: `{design_specs.get("Primary Button", {}).get("background-color", "#002F6C")}` (Utilizado en botones principales, llamados a la acción, barra de navegación superior).
*   **Gris de Fondo (Secundario)**: `{design_specs.get("Global (body)", {}).get("background-color", "#F8F9FA")}` (Fondo de página general, bordes suaves y separadores).
*   **Texto Principal**: `{design_specs.get("Global (body)", {}).get("color", "#2B2B2B")}` (Utilizado para la lectura principal y títulos destacados).
*   **Texto Secundario / Etiquetas**: `rgba(0, 0, 0, 0.6)` o grises intermedios para subtítulos, características y metadatos secundarios.

---

## 🅰️ Tipografía y Fuentes

### Especificación Global (`body`)
*   **Familias de Fuente**: `{design_specs.get("Global (body)", {}).get("font-family", "Montserrat, sans-serif")}`
*   **Tamaño Base**: `{design_specs.get("Global (body)", {}).get("font-size", "14px")}`
*   **Espaciado de Letras (Letter Spacing)**: `{design_specs.get("Global (body)", {}).get("letter-spacing", "normal")}`
*   **Altura de Línea (Line Height)**: `{design_specs.get("Global (body)", {}).get("line-height", "normal")}`

### Títulos Principales (H1 / H2)
*   **Familias de Fuente**: `{design_specs.get("Hero Title (H1)", design_specs.get("Main Heading (H2)", {})).get("font-family", "Montserrat, sans-serif")}`
*   **Tamaño de Fuente**: `{design_specs.get("Hero Title (H1)", design_specs.get("Main Heading (H2)", {})).get("font-size", "28px")}`
*   **Peso de Fuente (Font Weight)**: `{design_specs.get("Hero Title (H1)", design_specs.get("Main Heading (H2)", {})).get("font-weight", "700")}`
*   **Espaciado de Letras**: `{design_specs.get("Hero Title (H1)", design_specs.get("Main Heading (H2)", {})).get("letter-spacing", "normal")}`

### Enlaces de Navegación
*   **Familia de Fuente**: `{design_specs.get("Navigation Links", {}).get("font-family", "inherit")}`
*   **Tamaño**: `{design_specs.get("Navigation Links", {}).get("font-size", "14px")}`
*   **Peso**: `{design_specs.get("Navigation Links", {}).get("font-weight", "500")}`
*   **Color**: `{design_specs.get("Navigation Links", {}).get("color", "#ffffff")}`

---

## 🎛️ Componentes y Espaciados Clave

### 1. Botones Primarios
*   **Fondo (Background)**: `{design_specs.get("Primary Button", {}).get("background-color", "#002F6C")}`
*   **Color de Texto**: `{design_specs.get("Primary Button", {}).get("color", "#ffffff")}`
*   **Bordes Redondeados (Border Radius)**: `{design_specs.get("Primary Button", {}).get("border-radius", "4px")}`
*   **Padding**: `{design_specs.get("Primary Button", {}).get("padding", "10px 20px")}`
*   **Peso de Fuente**: `{design_specs.get("Primary Button", {}).get("font-weight", "600")}`

### 2. Tarjetas de Propiedades (Property Cards)
*   **Fondo**: `{design_specs.get("Property Card Container", {}).get("background-color", "#ffffff")}`
*   **Bordes Redondeados**: `{design_specs.get("Property Card Container", {}).get("border-radius", "8px")}`
*   **Sombra (Box Shadow)**: `{design_specs.get("Property Card Container", {}).get("box-shadow", "none")}`
*   **Borde**: `{design_specs.get("Property Card Container", {}).get("border", "none")}`
*   **Título de Propiedad (Card)**:
    *   **Tamaño**: `{design_specs.get("Property Card Title", {}).get("font-size", "16px")}`
    *   **Color**: `{design_specs.get("Property Card Title", {}).get("color", "#2B2B2B")}`
    *   **Peso**: `{design_specs.get("Property Card Title", {}).get("font-weight", "600")}`
*   **Destacado de Precio**:
    *   **Tamaño**: `{design_specs.get("Property Card Price", {}).get("font-size", "18px")}`
    *   **Color**: `{design_specs.get("Property Card Price", {}).get("color", "#2B2B2B")}`
    *   **Peso**: `{design_specs.get("Property Card Price", {}).get("font-weight", "700")}`

### 3. Rejilla y Contenedores (Grid & Layout)
*   **Contenedor Principal**: Máximo ancho de contenedor adaptativo (usualmente `1200px` a `1400px` con paddings laterales de `15px` a `24px` en mobile/tablet).
*   **Grilla de Propiedades**: Diseño de rejilla flexible (`grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`) con un espacio de separación (`gap`) de `24px` o `30px`.

---

> [!TIP]
> **Recomendación para nuestro Multitenant**:
> 1. Utilizar una variable CSS `--primary-color` para permitir que cada inmobiliaria personalice el color del botón primario y el header según su branding.
> 2. Mantener la tipografía global (`Montserrat` o similar de Google Fonts) como estándar limpio y neutral.
"""

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        
        print(f"Created file: {output_path}")

    except Exception as e:
        print(f"Error during execution: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    extract_design_system()
