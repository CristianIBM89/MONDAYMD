"""
Empaqueta la Teams App en un ZIP listo para subir al Teams Admin Center
o al Teams Developer Portal.

Uso:
    python package.py

Genera: teams-app/MeetingResumenIA.zip
"""
import zipfile, os, subprocess, sys
from pathlib import Path

BASE = Path(__file__).parent

def main():
    # 1. Generar iconos
    print("Generando iconos...")
    subprocess.run([sys.executable, "generate-icons.py"], cwd=BASE, check=True)

    # 2. Empaquetar ZIP
    zip_path = BASE / "MeetingResumenIA.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(BASE / "manifest.json",          "manifest.json")
        zf.write(BASE / "icons" / "icon-color.png",   "icon-color.png")
        zf.write(BASE / "icons" / "icon-outline.png", "icon-outline.png")

    size = zip_path.stat().st_size
    print(f"\n✅  Paquete creado: {zip_path}")
    print(f"   Tamaño: {size} bytes")
    print("\n📌  Próximos pasos:")
    print("   1. Abre https://dev.teams.microsoft.com/apps")
    print("   2. 'Import app' → selecciona MeetingResumenIA.zip")
    print("   3. Publica → 'Upload a custom app'")
    print("   4. En Teams Desktop: Apps → Built for your org → Resumen IA")

if __name__ == "__main__":
    main()
