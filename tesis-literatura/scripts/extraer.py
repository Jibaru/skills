#!/usr/bin/env python3
"""Extrae el texto de un PDF por páginas para analizarlo sin abrir el PDF entero.

  python extraer.py PDF [--proyecto RUTA]
      escribe literatura/texto/<nombre>.txt con marcadores "=== p N ===" y
      muestra el índice (outline) y las páginas donde empiezan capítulos
  python extraer.py PDF --paginas 12-30
      imprime solo ese rango (para que un subagente lea una sección)

Los números "p N" son los del archivo PDF. Para citar en APA hay que usar el número
impreso en la página; si difiere, la ficha debe anotar ambos (ver references/ficha.md).
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from comun import rutas

RE_CAPITULO = re.compile(r"^\s*(CAP[IÍ]TULO\s+[IVXLC\d]+|[IVX]{1,4}\.\s+[A-ZÁÉÍÓÚÑ ]{6,}|\d\.\s+[A-Z][A-Za-z ]{4,}|"
                         r"(ABSTRACT|RESUMEN|INTRODUCCI[OÓ]N|INTRODUCTION|METHODS?|METODOLOG[IÍ]A|RESULTS?|"
                         r"RESULTADOS|DISCUSSION|DISCUSI[OÓ]N|CONCLUSIONS?|CONCLUSIONES|REFERENCES|REFERENCIAS)\b)",
                         re.M)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--paginas", help="rango N-M (1-based, inclusivo)")
    a = ap.parse_args()

    import pymupdf
    r = rutas(a.proyecto)
    pdf = Path(a.pdf)
    if not pdf.exists():
        pdf = r["pdfs"] / a.pdf
    doc = pymupdf.open(pdf)

    if a.paginas:
        ini, _, fin = a.paginas.partition("-")
        ini, fin = int(ini), int(fin or ini)
        for i in range(max(ini, 1) - 1, min(fin, doc.page_count)):
            print(f"=== p {i + 1} ===")
            print(doc[i].get_text().strip())
        return

    salida = r["texto"] / (pdf.stem + ".txt")
    partes, secciones = [], []
    for i, pag in enumerate(doc):
        t = pag.get_text()
        partes.append(f"=== p {i + 1} ===\n{t.strip()}\n")
        for m in RE_CAPITULO.finditer(t[:600]):
            secciones.append((i + 1, " ".join(m.group(0).split())[:70]))
    salida.write_text("\n".join(partes), encoding="utf-8")
    vacias = [i + 1 for i, p in enumerate(doc) if len(p.get_text().strip()) < 30]

    print(f"{pdf.name}: {doc.page_count} páginas -> {salida}")
    if vacias:
        muestra = ", ".join(map(str, vacias[:15])) + ("…" if len(vacias) > 15 else "")
        print(f"AVISO: {len(vacias)} páginas sin texto extraíble (p {muestra}). Si alguna importa, "
              "renderízala a PNG (pymupdf get_pixmap) y léela como imagen.")
    toc = doc.get_toc()
    if toc:
        print("Índice embebido:")
        for nivel, titulo, pagina in toc:
            if nivel <= 2:
                print(f"  {'  ' * (nivel - 1)}{titulo} (p {pagina})")
    elif secciones:
        print("Posibles inicios de sección:")
        vistos = set()
        for p, s in secciones:
            if s not in vistos:
                vistos.add(s)
                print(f"  p {p}: {s}")


if __name__ == "__main__":
    main()
