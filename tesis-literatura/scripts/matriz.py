#!/usr/bin/env python3
"""Consolida literatura/fichas/*.md en la matriz de revisión de artículos.

  python matriz.py [--proyecto RUTA] [--solo-antecedentes]

Escribe literatura/matriz-revision.csv (y .xlsx si openpyxl está instalado) con las
columnas del Taller 02 del curso, más columnas extra para la redacción:

  N° | AÑO | TÍTULO | AUTOR | REPOSITORIO DE DATOS | ENLACE (DOI) | OBJETIVO |
  METODOLOGÍA | RESULTADOS | CONCLUSIÓN | APORTE A LA TESIS |
  PAÍS | ÁMBITO | TIPO | MUESTRA | INSTRUMENTOS | INDICADORES Y FÓRMULAS |
  RELEVANCIA | ANTECEDENTE | BIBKEY | ARCHIVO

Orden: internacionales primero y luego nacionales (como en la tesis), cada grupo del
más reciente al más antiguo. Al final avisa de fichas incompletas y de antecedentes
fuera de la ventana de años de tesis.yaml.
"""

from __future__ import annotations

import argparse
import re

from comun import anio_actual, escribir_csv, rutas, ventana_anios

COLUMNAS = ["N°", "AÑO", "TÍTULO", "AUTOR", "REPOSITORIO DE DATOS", "ENLACE (DOI)", "OBJETIVO",
            "METODOLOGÍA", "RESULTADOS", "CONCLUSIÓN", "APORTE A LA TESIS", "PAÍS", "ÁMBITO", "TIPO",
            "MUESTRA", "INSTRUMENTOS", "INDICADORES Y FÓRMULAS", "RELEVANCIA", "ANTECEDENTE",
            "BIBKEY", "ARCHIVO"]
SECCIONES = {"Objetivo": "OBJETIVO", "Metodología": "METODOLOGÍA", "Resultados": "RESULTADOS",
             "Conclusión": "CONCLUSIÓN", "Aporte a la tesis": "APORTE A LA TESIS",
             "Población y muestra": "MUESTRA", "Instrumentos": "INSTRUMENTOS",
             "Indicadores y fórmulas": "INDICADORES Y FÓRMULAS"}


def leer_ficha(texto: str) -> tuple[dict, dict]:
    meta, cuerpo = {}, texto
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", texto, flags=re.S)
    if m:
        cuerpo = m.group(2)
        for linea in m.group(1).splitlines():
            if ":" in linea and not linea.lstrip().startswith("#"):
                k, v = linea.split(":", 1)
                meta[k.strip()] = re.sub(r"\s+#.*$", "", v).strip()
    secciones = {}
    for bloque in re.split(r"^##\s+", cuerpo, flags=re.M)[1:]:
        titulo, _, contenido = bloque.partition("\n")
        secciones[titulo.strip()] = " ".join(contenido.split())
    return meta, secciones


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--solo-antecedentes", action="store_true")
    a = ap.parse_args()
    r = rutas(a.proyecto)
    minimo = anio_actual() - ventana_anios(r)

    filas, avisos = [], []
    for f in sorted(r["fichas"].glob("*.md")):
        meta, sec = leer_ficha(f.read_text(encoding="utf-8"))
        faltan = [s for s in SECCIONES if not sec.get(s)]
        if faltan:
            avisos.append(f"{f.name}: faltan secciones {', '.join(faltan)}")
        antecedente = meta.get("sirve_como_antecedente", "").lower() in ("si", "sí", "true")
        if a.solo_antecedentes and not antecedente:
            continue
        anio = meta.get("anio", "")
        if antecedente and anio.isdigit() and int(anio) < minimo:
            avisos.append(f"{f.name}: antecedente de {anio}, fuera de la ventana ({minimo}–{anio_actual()})")
        doi = meta.get("doi", "")
        fila = {"AÑO": anio, "TÍTULO": meta.get("titulo", ""), "AUTOR": meta.get("autores", ""),
                "REPOSITORIO DE DATOS": meta.get("repositorio", ""),
                "ENLACE (DOI)": f"https://doi.org/{doi}" if doi else meta.get("url", ""),
                "PAÍS": meta.get("pais", ""), "ÁMBITO": meta.get("ambito", ""), "TIPO": meta.get("tipo", ""),
                "RELEVANCIA": meta.get("relevancia", ""), "ANTECEDENTE": "sí" if antecedente else "no",
                "BIBKEY": meta.get("bibkey", ""), "ARCHIVO": meta.get("archivo", f.stem + ".pdf")}
        for s, col in SECCIONES.items():
            fila[col] = sec.get(s, "")
        filas.append(fila)

    filas.sort(key=lambda x: (x["ÁMBITO"] == "nacional", -int(x["AÑO"]) if str(x["AÑO"]).isdigit() else 0))
    for i, fila in enumerate(filas, 1):
        fila["N°"] = i
    escribir_csv(r["matriz"], filas, COLUMNAS)

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font
        wb = Workbook()
        ws = wb.active
        ws.title = "Matriz de revisión"
        ws.append(COLUMNAS)
        for fila in filas:
            ws.append([fila.get(c, "") for c in COLUMNAS])
        for c in ws[1]:
            c.font = Font(bold=True)
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = 14 if col[0].value in ("N°", "AÑO") else 40
            for c in col:
                c.alignment = Alignment(wrap_text=True, vertical="top")
        wb.save(r["matriz"].with_suffix(".xlsx"))
    except ImportError:
        pass

    nac = sum(1 for x in filas if x["ÁMBITO"] == "nacional" and x["ANTECEDENTE"] == "sí")
    inter = sum(1 for x in filas if x["ÁMBITO"] == "internacional" and x["ANTECEDENTE"] == "sí")
    print(f"{len(filas)} fichas en {r['matriz'].name}; antecedentes: {inter} internacionales, {nac} nacionales")
    if nac < 3 or inter < 5:
        print("AVISO: la meta del curso es al menos 5 internacionales y 3 nacionales")
    for av in avisos:
        print("AVISO:", av)


if __name__ == "__main__":
    main()
