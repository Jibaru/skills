#!/usr/bin/env python3
"""Indexa los PDFs de literatura/pdfs/ (descargados o soltados a mano).

  python indexar.py [--proyecto RUTA] [--no-renombrar]

Para cada PDF nuevo:
  1. Busca un DOI en los metadatos y en el texto de las 2 primeras páginas.
  2. Si no hay DOI, toma el título (metadatos o línea de mayor tamaño de la p. 1)
     y lo busca en Crossref; acepta el resultado si el título coincide ≥ 85 %.
  3. Completa año, autores y título desde Crossref, lo asocia al candidato de
     candidatos.csv (por DOI o título) y lo renombra AAAA-apellido-slug.pdf.
  4. Cuenta páginas y decide la estrategia de análisis:
       completa        ≤ 30 páginas: un subagente lee todo el texto
       por-secciones   > 30 páginas (tesis, libros): se extrae por páginas y se analiza por capítulos
  5. Lo quita de PENDIENTES.md y marca estado_pdf=descargado en candidatos.csv.

Resultado: literatura/indice.csv (archivo, id, doi, anio, autores, titulo, paginas,
estrategia, sha1, ficha).
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import re
import urllib.parse

from comun import (CAMPOS_CANDIDATO, MAILTO, escribir_csv, http_json, leer_csv, log, nombre_pdf,
                   norm_doi, norm_titulo, rutas, sin_acentos)

CAMPOS_INDICE = ["archivo", "id", "doi", "anio", "autores", "titulo", "paginas", "estrategia", "sha1", "ficha", "revisar"]
RE_DOI = re.compile(r"\b(10\.\d{4,9}/[^\s\"<>,;]+)", re.I)
UMBRAL_PAGINAS = 30


def leer_pdf(path):
    import pymupdf
    doc = pymupdf.open(path)
    meta = doc.metadata or {}
    texto = "".join(doc[i].get_text() for i in range(min(2, doc.page_count)))
    titulo_visual = ""
    if doc.page_count:
        mayor = 0
        for b in doc[0].get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    t = s["text"].strip()
                    if len(t) > 15 and s["size"] > mayor:
                        mayor, titulo_visual = s["size"], t
    return doc.page_count, meta, texto, titulo_visual


def crossref_doi(doi):
    params = {"mailto": MAILTO} if MAILTO else None
    return http_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi)}", params, reintentos=2)["message"]


def crossref_titulo(titulo):
    params = {"query.bibliographic": titulo, "rows": 3}
    if MAILTO:
        params["mailto"] = MAILTO
    for it in http_json("https://api.crossref.org/works", params, reintentos=2)["message"]["items"]:
        t = (it.get("title") or [""])[0]
        if difflib.SequenceMatcher(None, norm_titulo(t), norm_titulo(titulo)).ratio() >= 0.85:
            return it
    return None


def datos_crossref(it):
    anio = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
    autores = "; ".join(f"{a.get('family', '')}, {a.get('given', '')}".strip(", ")
                        for a in it.get("author", []) if a.get("family"))
    return {"doi": norm_doi(it.get("DOI", "")), "anio": anio or "", "autores": autores,
            "titulo": (it.get("title") or [""])[0]}


def en_texto(titulo: str, texto: str) -> bool:
    """El título de Crossref debe aparecer en las primeras páginas (evita tomar el DOI de una cita)."""
    nt = norm_titulo(titulo)[:60]
    tx = re.sub(r"[^a-z0-9]", "", sin_acentos(texto.lower()))[:6000]
    if not nt:
        return False
    if nt in tx:
        return True
    bloque = difflib.SequenceMatcher(None, nt, tx, autojunk=False).find_longest_match(0, len(nt), 0, len(tx))
    return bloque.size >= len(nt) * 0.8


def identificar(pdf, meta, texto, titulo_visual, por_doi, por_tit):
    """Devuelve (candidato|None, info, revisar)."""
    info = {"doi": "", "anio": "", "autores": "", "titulo": ""}
    try:
        for m in RE_DOI.finditer((meta.get("subject") or "") + " " + (meta.get("keywords") or "") + " " + texto):
            doi = norm_doi(m.group(1))
            if doi in por_doi:
                return por_doi[doi], info, False
            try:
                datos = datos_crossref(crossref_doi(doi))
            except Exception:
                continue
            if en_texto(datos["titulo"], texto):
                return por_tit.get(norm_titulo(datos["titulo"])), datos, False
        for titulo in dict.fromkeys(t for t in ((meta.get("title") or "").strip(), titulo_visual) if len(t) > 15):
            c = por_tit.get(norm_titulo(titulo))
            if c:
                return c, info, False
            it = crossref_titulo(titulo)
            if it:
                datos = datos_crossref(it)
                return por_doi.get(datos["doi"]) or por_tit.get(norm_titulo(datos["titulo"])), datos, False
    except Exception as e:
        log(f"{pdf.name}: Crossref falló ({e}); se indexa con datos del PDF")
    # sin coincidencia fiable: no se inventan metadatos ni se renombra
    info["titulo"] = titulo_visual or meta.get("title") or ""
    return None, info, True


def quitar_pendiente(r, doi, titulo):
    if not r["pendientes"].exists():
        return
    lineas = r["pendientes"].read_text(encoding="utf-8").splitlines(keepends=True)
    nt = norm_titulo(titulo)
    fuera = lambda l: l.startswith("| C") and ((doi and doi in l.lower()) or (nt and nt[:60] in norm_titulo(l)))
    nuevas = [l for l in lineas if not fuera(l)]
    if len(nuevas) != len(lineas):
        r["pendientes"].write_text("".join(nuevas), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--no-renombrar", action="store_true")
    a = ap.parse_args()
    r = rutas(a.proyecto)

    indice = leer_csv(r["indice"])
    conocidos = {f["sha1"] for f in indice}
    candidatos = leer_csv(r["candidatos"])
    por_doi = {c["doi"]: c for c in candidatos if c.get("doi")}
    por_tit = {norm_titulo(c["titulo"]): c for c in candidatos}

    nuevos = 0
    for pdf in sorted(r["pdfs"].glob("*.pdf")):
        sha = hashlib.sha1(pdf.read_bytes()).hexdigest()
        if sha in conocidos:
            continue
        try:
            paginas, meta, texto, titulo_visual = leer_pdf(pdf)
        except Exception as e:
            log(f"{pdf.name}: no se pudo leer ({e})")
            continue
        info = {"doi": "", "anio": "", "autores": "", "titulo": ""}
        revisar = False
        # 1) descargado por descargar.py: el candidato ya trae metadatos verificados
        cand = next((c for c in candidatos if c.get("pdf") == pdf.name), None)
        if not cand:
            cand, info, revisar = identificar(pdf, meta, texto, titulo_visual, por_doi, por_tit)
        if cand:  # el candidato manda en título/autores/año si ya estaba registrado
            for k in ("anio", "autores", "titulo", "doi"):
                info[k] = cand.get(k, "") or info[k]
            cand["estado_pdf"] = "descargado"
            revisar = revisar and not cand.get("titulo")
        archivo = pdf.name
        if not a.no_renombrar and info["titulo"] and not revisar:
            destino = nombre_pdf(info["anio"], info["autores"], info["titulo"])
            if destino != pdf.name and not (r["pdfs"] / destino).exists():
                pdf.rename(r["pdfs"] / destino)
                archivo = destino
        if cand:
            cand["pdf"] = archivo
        quitar_pendiente(r, info["doi"], info["titulo"])
        indice.append({"archivo": archivo, "id": cand["id"] if cand else "", "doi": info["doi"],
                       "anio": info["anio"], "autores": info["autores"], "titulo": info["titulo"],
                       "paginas": paginas, "sha1": sha, "ficha": "", "revisar": "1" if revisar else "",
                       "estrategia": "completa" if paginas <= UMBRAL_PAGINAS else "por-secciones"})
        conocidos.add(sha)
        nuevos += 1
        log(f"+ {archivo} | {paginas} p. | doi={info['doi'] or '—'} | {'candidato ' + cand['id'] if cand else 'sin candidato'}"
            + (" | REVISAR: metadatos no confirmados, completa doi/título a mano en indice.csv" if revisar else ""))

    # fichas ya escritas
    for f in indice:
        ficha = r["fichas"] / (f["archivo"][:-4] + ".md")
        f["ficha"] = ficha.name if ficha.exists() else ""
    escribir_csv(r["indice"], indice, CAMPOS_INDICE)
    if candidatos:
        escribir_csv(r["candidatos"], candidatos, CAMPOS_CANDIDATO + ["estado_pdf", "pdf"])
    sin_ficha = [f for f in indice if not f["ficha"]]
    print(f"{nuevos} PDFs nuevos indexados; {len(indice)} en total; {len(sin_ficha)} sin ficha")
    for f in sin_ficha:
        print(f"  {f['archivo']} | {f['paginas']} p. | {f['estrategia']}")


if __name__ == "__main__":
    main()
