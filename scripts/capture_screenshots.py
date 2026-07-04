import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def capture_screenshots():
    # 1. Define and create output directory
    output_dir = r"c:\Users\Lucas\Desktop\plataforam-inmobiliaria-multitent\screenshotsUI"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created directory: {output_dir}")
    else:
        print(f"Directory already exists: {output_dir}")

    # 2. Setup Chrome Options for headless operation
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1440,900")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--log-level=3")  # Minimize console noise

    print("Initializing Chrome WebDriver...")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.set_page_load_timeout(30)

    try:
        # Define the pages to visit
        pages = [
            {
                "name": "01_home.png",
                "url": "https://www.buscadorprop.com.ar/"
            },
            {
                "name": "02_login_modal.png",
                "url": "https://www.buscadorprop.com.ar/?login=on"
            },
            {
                "name": "03_register.png",
                "url": "https://www.buscadorprop.com.ar/beneficios-de-registrarte"
            },
            {
                "name": "04_como_publicar.png",
                "url": "https://www.buscadorprop.com.ar/como-publicar"
            },
            {
                "name": "05_search_results.png",
                "url": "https://www.buscadorprop.com.ar/casas-chalets-venta"
            },
            {
                "name": "07_inmobiliarias_list.png",
                "url": "https://www.buscadorprop.com.ar/inmobiliarias"
            }
        ]

        # Keep track of a property detail URL to visit
        property_detail_url = None

        for page in pages:
            name = page["name"]
            url = page["url"]
            file_path = os.path.join(output_dir, name)
            
            print(f"Navigating to {url}...")
            try:
                driver.get(url)
                time.sleep(5)  # Wait for scripts/images to load

                # Dismiss cookie banner if it exists to clean up screenshots
                try:
                    # Look for common accept cookie buttons, or just click outside
                    pass
                except Exception:
                    pass

                # If we are on search results, try to extract a property URL for step 6
                if name == "05_search_results.png":
                    try:
                        # Wait for property links to load
                        print("Waiting for property links to load...")
                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/propiedad/']"))
                        )
                    except Exception as e:
                        print(f"Wait for property links timed out: {e}")

                    try:
                        # Find the first property link
                        links = driver.find_elements(By.CSS_SELECTOR, "a.card-prop__link")
                        if not links:
                            # Fallback: look for any link containing "/propiedad/"
                            links = driver.find_elements(By.CSS_SELECTOR, "a[href*='/propiedad/']")
                        
                        if links:
                            property_detail_url = links[0].get_attribute("href")
                            print(f"Found property detail URL: {property_detail_url}")
                        else:
                            print("No property links found on search results page.")
                    except Exception as e:
                        print(f"Could not extract property link: {e}")

                driver.save_screenshot(file_path)
                print(f"Saved screenshot: {file_path}")

            except Exception as e:
                print(f"Error capturing {name}: {e}")

        # Capture property detail page if we found one
        if property_detail_url:
            name = "06_property_detail.png"
            file_path = os.path.join(output_dir, name)
            print(f"Navigating to property detail: {property_detail_url}...")
            try:
                driver.get(property_detail_url)
                time.sleep(5)
                driver.save_screenshot(file_path)
                print(f"Saved screenshot: {file_path}")
            except Exception as e:
                print(f"Error capturing property detail: {e}")
        else:
            print("No property detail URL found, skipping 06_property_detail.png")

        print("All screenshots captured successfully!")

    finally:
        print("Closing WebDriver...")
        driver.quit()

if __name__ == "__main__":
    capture_screenshots()
