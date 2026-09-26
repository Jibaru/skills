#!/usr/bin/env python3
"""Descarga la versión de acceso abierto de los candidatos seleccionados.

Uso:
  python descargar.py --proyecto RUTA --ids C0001,C0007      # candidatos concretos
  python descargar.py --proyecto RUTA --seleccionados        # los que pasaron el filtro por abstract
  python descargar.py --proyecto RUTA --doi 10.3390/s22176482

Orden de resolución (solo fuentes legales de acceso abierto):
  1. oa_url ya registrado en candidatos.csv
  2. Unpaywall (requiere TESIS_MAILTO)
  3. OpenAlex: best_oa_location y demás locations con pdf_url
  4. Semantic Scholar: openAccessPdf
  5. arXiv (DOI 10.48550/arxiv.*)
  6. CORE (si hay CORE_API_KEY)
  7. Meta etiqueta citation_pdf_url de la página del repositorio o del editor

Cada archivo se valida (debe empezar por %PDF). Lo que no se consiga se anota en
literatura/PENDIENTES.md con enlaces para conseguirlo por la vía institucional.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import urllib.parse

from comun import (CAMPOS_CANDIDATO, MAILTO, escribir_csv, es_pdf, http, http_json, leer_csv,
                   log, nombre_pdf, norm_doi, rutas)

CABECERA_PENDIENTES = """# PDFs pendientes

Estos trabajos no tienen versión de acceso abierto localizable. Vías para conseguirlos:

- Biblioteca de la UNTELS o sus bases suscritas (consulta en biblioteca qué accesos remotos tienes).
- Escribir al autor de correspondencia (el correo suele estar en la página del artículo) o pedirlo por ResearchGate.
- Buscar una versión del autor en su repositorio institucional o página personal.
- Préstamo interbibliotecario.

Cuando consigas el PDF, déjalo en `literatura/pdfs/` con cualquier nombre y ejecuta
`indexar.py`: se detecta, se asocia a su DOI y sale de esta lista.

| ID | Año | Título | DOI | Enlace |
|---|---|---|---|---|
"""


def metas(pagina: str) -> dict:
    """Extrae <meta name=... content=...> sin importar el orden de atributos."""
    out = {}
    for tag in re.findall(r"<meta\b[^>]*>", pagina, flags=re.I):
        n = re.search(r'name="([^"]+)"', tag, flags=re.I)
        c = re.search(r'content="([^"]*)"', tag, flags=re.I)
        if n and c:
            out.setdefault(n.group(1).lower(), html.unescape(c.group(1)))
    return out


def candidatos_url(fila: dict) -> list[tuple[str, str]]:
    urls = []
    doi = norm_doi(fila.get("doi", ""))
    if fila.get("oa_url"):
        urls.append(("registrado", fila["oa_url"]))
    if doi and MAILTO:
        try:
            u = http_json(f"https://api.unpaywall.org/v2/{urllib.parse.quote(doi)}", {"email": MAILTO}, reintentos=2)
            for loc in [u.get("best_oa_location")] + (u.get("oa_locations") or []):
                if loc and loc.get("url_for_pdf"):
                    urls.append(("unpaywall", loc["url_for_pdf"]))
        except Exception as e:
            log(f"    unpaywall: {e}")
    if doi:
        try:
            w = http_json(f"https://api.openalex.org/works/doi:{urllib.parse.quote(doi)}",
                          {"mailto": MAILTO} if MAILTO else None, reintentos=2)
            for loc in [w.get("best_oa_location")] + (w.get("locations") or []):
                if loc and loc.get("pdf_url"):
                    urls.append(("openalex", loc["pdf_url"]))
        except Exception as e:
            log(f"    openalex: {e}")
        try:
            h = {"x-api-key": os.environ["S2_API_KEY"]} if os.environ.get("S2_API_KEY") else None
            p = http_json(f"https://api.semanticscholar.org/graph/v1/paper/DOI:{urllib.parse.quote(doi)}",
                          {"fields": "openAccessPdf,externalIds"}, h, reintentos=3)
            if (p.get("openAccessPdf") or {}).get("url"):
                urls.append(("semantic scholar", p["openAccessPdf"]["url"]))
            if (p.get("externalIds") or {}).get("ArXiv"):
                urls.append(("arxiv", f"https://arxiv.org/pdf/{p['externalIds']['ArXiv']}"))
        except Exception as e:
            log(f"    s2: {e}")
        m = re.match(r"10\.48550/arxiv\.(.+)", doi)
        if m:
            urls.append(("arxiv", f"https://arxiv.org/pdf/{m.group(1)}"))
        if os.environ.get("CORE_API_KEY"):
            try:
                c = http_json("https://api.core.ac.uk/v3/search/works", {"q": f'doi:"{doi}"', "limit": 3},
                              {"Authorization": f"Bearer {os.environ['CORE_API_KEY']}"})
                urls += [("core", r["downloadUrl"]) for r in c.get("results", []) if r.get("downloadUrl")]
            except Exception as e:
                log(f"    core: {e}")
    # páginas de aterrizaje: repositorio (tesis) y editor (vía DOI)
    for origen, pagina in (("repositorio", fila.get("url", "")), ("editor", f"https://doi.org/{doi}" if doi else "")):
        if not pagina or not pagina.startswith("http") or "openalex.org" in pagina:
            continue
        try:
            m = metas(http(pagina, reintentos=2, timeout=30))
            if m.get("citation_pdf_url"):
                urls.append((origen, urllib.parse.urljoin(pagina, m["citation_pdf_url"])))
        except Exception as e:
            log(f"    {origen}: {e}")
    vistos, unicos = set(), []
    for o, u in urls:
        if u not in vistos:
            vistos.add(u)
            unicos.append((o, u))
    return unicos


def descargar(fila: dict, r: dict) -> str:
    for origen, url in candidatos_url(fila):
        try:
            data = http(url, binario=True, reintentos=2, timeout=90)
        except Exception as e:
            log(f"    {origen}: {url[:80]} -> {e}")
            continue
        if not es_pdf(data):
            log(f"    {origen}: {url[:80]} -> no es PDF (probablemente página de acceso)")
            continue
        nombre = nombre_pdf(fila.get("anio"), fila.get("autores", ""), fila.get("titulo", ""))
        (r["pdfs"] / nombre).write_bytes(data)
        log(f"    OK {origen}: {nombre} ({len(data) // 1024} KB)")
        return nombre
    return ""


def anotar_pendiente(r: dict, fila: dict) -> None:
    texto = r["pendientes"].read_text(encoding="utf-8") if r["pendientes"].exists() else CABECERA_PENDIENTES
    doi = fila.get("doi", "")
    clave = doi or fila.get("titulo", "")
    if clave and clave in texto:
        return
    enlace = f"https://doi.org/{doi}" if doi else fila.get("url", "")
    titulo = (fila.get("titulo") or "").replace("|", "/")
    texto += f"| {fila.get('id', '')} | {fila.get('anio', '')} | {titulo} | {doi} | {enlace} |\n"
    r["pendientes"].write_text(texto, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--ids")
    g.add_argument("--seleccionados", action="store_true")
    g.add_argument("--doi")
    a = ap.parse_args()
    if not MAILTO:
        log("Aviso: sin TESIS_MAILTO no se consulta Unpaywall (defínelo en el entorno o en <proyecto>/.env; ver claves.py)")

    r = rutas(a.proyecto)
    filas = leer_csv(r["candidatos"])
    if a.doi:
        doi = norm_doi(a.doi)
        objetivo = [f for f in filas if f.get("doi") == doi] or [{"id": "", "doi": doi, "titulo": doi}]
    elif a.ids:
        ids = {x.strip() for x in a.ids.split(",")}
        objetivo = [f for f in filas if f["id"] in ids]
    else:
        objetivo = [f for f in filas if f.get("filtro_abstract") == "1"]
    objetivo = [f for f in objetivo if f.get("estado_pdf") != "descargado"]

    ok = pend = 0
    for f in objetivo:
        log(f"[{f.get('id')}] {f.get('titulo', '')[:90]}")
        nombre = descargar(f, r)
        if nombre:
            f["pdf"], f["estado_pdf"] = nombre, "descargado"
            ok += 1
        else:
            f["estado_pdf"] = "pendiente"
            anotar_pendiente(r, f)
            pend += 1
    if filas:
        escribir_csv(r["candidatos"], filas, CAMPOS_CANDIDATO + ["estado_pdf", "pdf"])
    print(f"descargados: {ok}; pendientes: {pend} (ver {r['pendientes'].name})")


if __name__ == "__main__":
    main()
