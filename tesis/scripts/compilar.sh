#!/usr/bin/env bash
# Compila un proyecto de tesis: generar.py + latexmk/biber dentro de Docker (TeX Live).
# Uso: compilar.sh [DIRECTORIO_PROYECTO]   (por defecto, el directorio actual)
# Deja main.pdf en el proyecto. Registro completo en main.log.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROYECTO="$(cd "${1:-.}" && pwd)"
IMAGEN="${TESIS_TEXLIVE_IMAGE:-texlive/texlive:latest}"

PY=python3; command -v python3 >/dev/null 2>&1 && python3 -c "" 2>/dev/null || PY=python

echo "==> Generando desde tesis.yaml"
"$PY" "$SCRIPTS/generar.py" "$PROYECTO"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker no está instalado. Instálalo o compila en Overleaf (generado/ ya está listo)." >&2
  exit 1
fi

# En Git Bash (Windows) hay que pasar la ruta en formato Windows y evitar la conversión MSYS.
VOL="$PROYECTO"
if command -v cygpath >/dev/null 2>&1; then VOL="$(cygpath -w "$PROYECTO")"; fi

echo "==> Compilando con $IMAGEN"
set +e
MSYS_NO_PATHCONV=1 docker run --rm -v "$VOL:/tesis" -w /tesis "$IMAGEN" \
  latexmk -pdf -interaction=nonstopmode -halt-on-error -file-line-error main.tex >/dev/null 2>&1
estado=$?
set -e

if [ $estado -ne 0 ]; then
  echo "ERROR: la compilación falló. Primeros errores de main.log:" >&2
  grep -E -A3 ':[0-9]+: |^! ' "$PROYECTO/main.log" 2>/dev/null | head -40 >&2 || true
  exit $estado
fi

paginas=$(grep -aoE "Output written on main.pdf \(([0-9]+) pages" "$PROYECTO/main.log" | grep -oE "[0-9]+" | tail -1 || true)
echo "==> Listo: $PROYECTO/main.pdf ($paginas páginas)"
grep -E "Citation .* undefined|Reference .* undefined|There were undefined" "$PROYECTO/main.log" | sort -u | head -10 || true
