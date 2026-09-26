#!/usr/bin/env python3
"""Revisa qué API keys de literatura están configuradas y dónde conseguir las que faltan.

Uso:
  python claves.py [--proyecto RUTA]            estado de cada key (sin exponer su valor)
  python claves.py [--proyecto RUTA] --probar   además hace una consulta mínima con cada key
  python claves.py [--proyecto RUTA] --env      crea <proyecto>/.env con las variables vacías
                                                (no sobrescribe uno existente)

Las keys se leen del entorno o de <proyecto>/.env; el entorno tiene prioridad.
<proyecto>/.env está en el .gitignore del proyecto de tesis: nunca se versiona.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from comun import CLAVES, ENV_CARGADO, MAILTO, http_json, tiene_clave


def enmascarar(valor: str) -> str:
    return valor[:3] + "…" + valor[-2:] if len(valor) > 8 else "…"


def probar(var: str) -> str:
    """Consulta mínima a la API de cada key. Devuelve 'ok' o el motivo del fallo."""
    v = os.environ.get(var, "")
    try:
        if var == "TESIS_MAILTO":
            http_json("https://api.openalex.org/works", {"filter": "doi:10.1109/access.2018.2870189",
                                                          "mailto": v}, reintentos=1)
        elif var == "S2_API_KEY":
            http_json("https://api.semanticscholar.org/graph/v1/paper/DOI:10.1109/access.2018.2870189",
                      {"fields": "title"}, {"x-api-key": v}, reintentos=1)
        elif var == "CORE_API_KEY":
            http_json("https://api.core.ac.uk/v3/search/works", {"q": "chatbot", "limit": 1},
                      {"Authorization": f"Bearer {v}"}, reintentos=1)
        elif var == "IEEE_API_KEY":
            http_json("https://ieeexploreapi.ieee.org/api/v1/search/articles",
                      {"querytext": "chatbot", "max_records": 1, "apikey": v}, reintentos=1)
        elif var == "SCOPUS_API_KEY":
            h = {"X-ELS-APIKey": v, "Accept": "application/json"}
            if os.environ.get("SCOPUS_INSTTOKEN"):
                h["X-ELS-Insttoken"] = os.environ["SCOPUS_INSTTOKEN"]
            d = http_json("https://api.elsevier.com/content/search/scopus",
                          {"query": "TITLE-ABS-KEY(chatbot)", "count": 1}, h, reintentos=1)
            if "service-error" in d or "error-response" in d:
                return "la key existe pero Scopus no autoriza la búsqueda (¿fuera de la red de la universidad?)"
        else:
            return "sin prueba"
        return "ok"
    except Exception as e:  # noqa: BLE001 - se informa cualquier fallo
        msg = str(e)
        if "401" in msg or "403" in msg:
            return "rechazada (401/403): key inválida o sin acceso institucional"
        if "429" in msg:
            return "límite de consultas alcanzado; la key parece válida"
        return f"error: {msg[:120]}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--probar", action="store_true")
    ap.add_argument("--env", action="store_true")
    a = ap.parse_args()

    if a.env:
        ruta = Path(a.proyecto) / ".env"
        if ruta.exists():
            print(f"{ruta} ya existe; no se sobrescribe.")
        else:
            lineas = ["# API keys de tesis-literatura. Este archivo NO se versiona (.gitignore).",
                      "# Deja vacío lo que no tengas: esa fuente se omite y se avisa.", ""]
            for c in CLAVES:
                lineas += [f"# {c['nombre']}: {c['da']}", f"#   Requisito: {c['requisito']}"]
                lineas += [f"#   {i}. {paso}" for i, paso in enumerate(c["pasos"], 1)]
                lineas += [f"{c['var']}=", ""]
            ruta.write_text("\n".join(lineas), encoding="utf-8")
            print(f"Creado {ruta}. Rellena los valores y vuelve a correr este script.")
        return

    print(f".env cargado: {ENV_CARGADO or 'no hay .env en el proyecto'}\n")
    print("| Variable | Estado | Activa | Qué da | Dónde conseguirla |")
    print("|---|---|---|---|---|")
    faltan = []
    for c in CLAVES:
        var = c["var"]
        if tiene_clave(var):
            estado = f"configurada ({enmascarar(os.environ[var])})"
            if a.probar:
                estado += f" · prueba: {probar(var)}"
        else:
            estado = "falta"
            faltan.append(c)
        activa = f"fuente `{c['fuente']}`" if c["fuente"] else "—"
        print(f"| `{var}` | {estado} | {activa} | {c['da']} | {c['donde']} ({c['requisito']}) |")

    if faltan:
        print("\n## Cómo conseguir las que faltan\n")
        for c in faltan:
            print(f"### {c['nombre']} (`{c['var']}`)\n")
            for i, paso in enumerate(c["pasos"], 1):
                print(f"{i}. {paso}")
            print(f"\nLuego añade a {Path(a.proyecto) / '.env'}: `{c['var']}=<valor>`\n")

    print()
    if not MAILTO:
        print("Prioridad: define TESIS_MAILTO; sin él no se buscan PDFs abiertos en Unpaywall.")
    if faltan:
        print("Sin estas keys la búsqueda funciona igual con OpenAlex, Semantic Scholar, Crossref, "
              "ALICIA y La Referencia (OpenAlex ya indexa lo que está en Scopus e IEEE por DOI); "
              "las fuentes que dependen de una key faltante se omiten y se reporta.")
        print(f"Para configurarlas: python claves.py --proyecto {a.proyecto} --env  y rellena el .env")


if __name__ == "__main__":
    main()
