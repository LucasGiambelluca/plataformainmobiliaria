import sys
import os

try:
    import pyttsx3
except ImportError:
    print("Instalando pyttsx3...")
    os.system("pip install pyttsx3")
    import pyttsx3

try:
    import readchar
except ImportError:
    print("Instalando readchar...")
    os.system("pip install readchar")
    import readchar


def leer_archivo(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        return f.read()


def formatear_texto(texto):
    texto = texto.replace('#', '')
    texto = texto.replace('*', '')
    texto = texto.replace('`', '')
    texto = texto.replace('```', '')
    return texto


def speak(engine, texto):
    engine.say(texto)
    engine.runAndWait()


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_md = os.path.join(script_dir, '..', 'docs', 'arquitectura.md')

    if not os.path.exists(ruta_md):
        print(f"Error: No se encontró el archivo en {ruta_md}")
        sys.exit(1)

    print(f"Leyendo: {ruta_md}\n")

    engine = pyttsx3.init()
    engine.setProperty('rate', 180)
    engine.setProperty('volume', 1.0)

    texto = leer_archivo(ruta_md)
    texto_formateado = formatear_texto(texto)

    lineas = texto_formateado.split('\n')

    print("=" * 50)
    print(" Presiona 'P' para pausar/reanudar")
    print(" Presiona 'S' para detener")
    print(" Presiona cualquier tecla para continuar")
    print("=" * 50)

    pausado = False

    for i, linea in enumerate(lineas):
        if linea.strip():
            print(f"[{i+1}/{len(lineas)}] {linea[:60]}...")

            if not pausado:
                speak(engine, linea)

            try:
                key = readchar.readkey()
                if key.lower() == 'p':
                    pausado = not pausado
                    print(f"{'Pausado' if pausado else 'Reanudado'}")
                elif key.lower() == 's':
                    print("Deteniendo...")
                    break
            except:
                pass

    print("\nLectura finalizada.")
    engine.stop()


if __name__ == '__main__':
    main()