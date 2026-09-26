#!/usr/bin/env bash
# Crea un proyecto de tesis nuevo a partir de la plantilla UNTELS.
# Uso: nuevo-proyecto.sh DESTINO
# El destino no debe existir o debe estar vacío. No inicializa git: la tesis va en un
# repositorio privado aparte (git init && git remote add ... lo haces tú).
set -euo pipefail

if [ $# -lt 1 ]; then echo "Uso: $0 DESTINO" >&2; exit 1; fi
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SCRIPTS/../assets"
DESTINO="$1"

if [ -e "$DESTINO" ] && [ -n "$(ls -A "$DESTINO" 2>/dev/null)" ]; then
  echo "ERROR: $DESTINO ya existe y no está vacío." >&2; exit 1
fi
mkdir -p "$DESTINO"
cp -R "$ASSETS/plantilla/." "$DESTINO/"
cp "$ASSETS/plantilla.gitignore" "$DESTINO/.gitignore"

for d in figuras/src figuras/out literatura/pdfs literatura/fichas datos anexos generado/resultados; do
  mkdir -p "$DESTINO/$d"
  [ -n "$(ls -A "$DESTINO/$d")" ] || touch "$DESTINO/$d/.gitkeep"
done

PY=python3; command -v python3 >/dev/null 2>&1 && python3 -c "" 2>/dev/null || PY=python
"$PY" "$SCRIPTS/generar.py" "$DESTINO"

echo "==> Proyecto creado en $DESTINO"
echo "    1. Edita tesis.yaml (datos reales; todo lo marcado EJEMPLO se reemplaza)."
echo "    2. Compila: $SCRIPTS/compilar.sh \"$DESTINO\""
echo "    3. Versiona en un repositorio PRIVADO: cd \"$DESTINO\" && git init"
