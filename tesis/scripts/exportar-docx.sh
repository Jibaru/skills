#!/usr/bin/env bash
# Exporta la tesis a Word (tesis.docx) con pandoc en Docker, para cuando el asesor o la
# escuela pidan .docx. El PDF de LaTeX sigue siendo la versión oficial: el Word conserva
# texto, títulos, tablas, fórmulas, figuras y citas APA, pero el formato fino (carátula,
# tablas horizontales, numeración de páginas) hay que revisarlo a mano.
# Uso: exportar-docx.sh [DIRECTORIO_PROYECTO]
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$SCRIPTS/../assets"
PROYECTO="$(cd "${1:-.}" && pwd)"
IMAGEN="${TESIS_PANDOC_IMAGE:-pandoc/latex:latest}"
PY=python3; command -v python3 >/dev/null 2>&1 && python3 -c "" 2>/dev/null || PY=python

"$PY" "$SCRIPTS/generar.py" "$PROYECTO"
"$PY" "$SCRIPTS/exportar_docx.py" "$PROYECTO"

cp "$ASSETS/referencia-untels.docx" "$ASSETS/referencias.lua" "$ASSETS/apa-es.lua" "$PROYECTO/_docx/"
if [ -f "$PROYECTO/apa.csl" ]; then cp "$PROYECTO/apa.csl" "$PROYECTO/_docx/apa.csl"
elif [ -f "$ASSETS/plantilla/apa.csl" ]; then cp "$ASSETS/plantilla/apa.csl" "$PROYECTO/_docx/apa.csl"
else
  echo "==> Descargando apa.csl"
  curl -fsSL -o "$PROYECTO/_docx/apa.csl" \
    https://raw.githubusercontent.com/citation-style-language/styles/master/apa.csl
fi

VOL="$PROYECTO"
if command -v cygpath >/dev/null 2>&1; then VOL="$(cygpath -w "$PROYECTO")"; fi

echo "==> Convirtiendo con $IMAGEN"
MSYS_NO_PATHCONV=1 docker run --rm -v "$VOL:/tesis" -w /tesis "$IMAGEN" \
  _docx/tesis-pandoc.tex -f latex -o tesis.docx \
  --lua-filter=_docx/referencias.lua \
  --citeproc --bibliography=bib/referencias.bib --csl=_docx/apa.csl \
  --lua-filter=_docx/apa-es.lua \
  --reference-doc=_docx/referencia-untels.docx \
  --resource-path=.:figuras:figuras/out \
  -M lang=es-PE

echo "==> Listo: $PROYECTO/tesis.docx"
echo "    Revisa a mano: carátula, tablas horizontales (operacionalización y matriz),"
echo "    numeración de páginas e índices (en Word: Referencias > Actualizar tabla)."
