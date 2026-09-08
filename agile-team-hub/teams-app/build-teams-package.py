#!/usr/bin/env python3
"""
build-teams-package.py
Genera el paquete ZIP de Agile Team Hub listo para cargar en Microsoft Teams.

Uso:
  python build-teams-package.py

El ZIP generado: AgileTeamHub.zip
Contiene SOLO: manifest.json, icon-color.png, icon-outline.png
NO incluye: .env, código fuente, credenciales, node_modules
"""
import zipfile, os, sys, json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_ZIP  = os.path.join(SCRIPT_DIR, 'AgileTeamHub.zip')

REQUIRED_FILES = ['manifest.json', 'icon-color.png', 'icon-outline.png']

def validate_manifest(manifest_path):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        m = json.load(f)

    errors = []
    if 'REPLACE_WITH' in m.get('id', ''):
        errors.append("manifest.json: Reemplaza 'REPLACE_WITH_NEW_GUID' con un GUID real.")
    if 'REPLACE_WITH' in m.get('developer', {}).get('websiteUrl', ''):
        errors.append("manifest.json: Reemplaza REPLACE_WITH_YOUR_APP_URL con la URL real de tu backend.")
    if 'REPLACE_WITH' in str(m.get('validDomains', [])):
        errors.append("manifest.json: Reemplaza REPLACE_WITH_YOUR_APP_DOMAIN con el dominio real.")
    if 'REPLACE_WITH' in str(m.get('staticTabs', [])):
        errors.append("manifest.json: Actualiza los contentUrl de las pestañas estáticas.")

    return errors

def main():
    print("=== Generador de paquete Teams - Agile Team Hub ===\n")

    # Check all required files exist
    missing = [f for f in REQUIRED_FILES if not os.path.exists(os.path.join(SCRIPT_DIR, f))]
    if missing:
        print(f"[ERROR] Archivos faltantes: {missing}")
        print("   Ejecuta primero: python generate-icons.py")
        sys.exit(1)

    # Validate manifest
    manifest_path = os.path.join(SCRIPT_DIR, 'manifest.json')
    warnings = validate_manifest(manifest_path)
    if warnings:
        print("[WARN] ADVERTENCIAS en manifest.json (el ZIP se generará pero NO será funcional hasta corregirlas):")
        for w in warnings:
            print(f"   * {w}")
        print()

    # Build ZIP
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname in REQUIRED_FILES:
            full = os.path.join(SCRIPT_DIR, fname)
            zf.write(full, fname)
            print(f"   [OK] Incluido: {fname} ({os.path.getsize(full):,} bytes)")

    print(f"\n[OK] Paquete generado: {OUTPUT_ZIP}")
    print(f"   Tamano: {os.path.getsize(OUTPUT_ZIP):,} bytes")
    print()
    print("Pasos para cargarlo en Teams:")
    print("   1. Abre Microsoft Teams")
    print("   2. Ve a Apps (barra lateral izquierda)")
    print("   3. Administrar tus aplicaciones -> Cargar una aplicacion personalizada")
    print("   4. Selecciona AgileTeamHub.zip")

if __name__ == '__main__':
    main()
