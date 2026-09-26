#!/usr/bin/env python3
"""Embudo de selección sobre literatura/candidatos.csv (Taller 01 del curso).

Etapas: titulo -> abstract -> texto. Cada candidato tiene filtro_titulo,
filtro_abstract y filtro_texto con 1 (pasa) o 0 (sale), más un motivo.

  python embudo.py ver --etapa titulo [--proyecto RUTA]
      lista compacta de los candidatos pendientes de esa etapa (id | año | fuente | título)
      para abstract también imprime el abstract; para texto, el PDF asociado
  python embudo.py marcar --etapa titulo --pasan C0001,C0004 [--resto 0] [--motivo "..."]
      marca 1 a los que pasan y, con --resto 0, marca 0 al resto de pendientes de esa etapa
  python embudo.py marcar --etapa abstract --salen C0009 --motivo "no es artículo original"
  python embudo.py distribucion
      escribe literatura/distribucion.md y literatura/distribucion.tex
      (Tabla "Distribución de artículos" por fuente)
"""

from __future__ import annotations

import argparse

from comun import CAMPOS_CANDIDATO, escribir_csv, leer_csv, rutas

ETAPAS = ["titulo", "abstract", "texto"]


def pendientes(filas, etapa):
    i = ETAPAS.index(etapa)
    out = []
    for f in filas:
        if f.get(f"filtro_{etapa}") not in ("", None):
            continue
        if i > 0 and f.get(f"filtro_{ETAPAS[i - 1]}") != "1":
            continue
        out.append(f)
    return out


def ver(filas, etapa):
    for f in pendientes(filas, etapa):
        base = f"{f['id']} | {f.get('anio', '')} | {f.get('fuente', '').split('; ')[0]} | {f.get('titulo', '')}"
        if etapa == "titulo":
            print(base)
        elif etapa == "abstract":
            print(base)
            print(f"   tipo={f.get('tipo', '')} idioma={f.get('idioma', '')} doi={f.get('doi', '')}")
            print(f"   {(f.get('abstract') or '(sin abstract: decidir por título o descargar)')[:1500]}\n")
        else:
            print(f"{base} | pdf={f.get('pdf', '') or 'SIN PDF'}")


def marcar(filas, etapa, pasan, salen, resto, motivo):
    campo = f"filtro_{etapa}"
    pend = {f["id"] for f in pendientes(filas, etapa)}
    for f in filas:
        if f["id"] in pasan:
            f[campo] = "1"
        elif f["id"] in salen or (resto == "0" and f["id"] in pend):
            f[campo] = "0"
            if motivo:
                f["motivo"] = f"{etapa}: {motivo}"


def distribucion(filas, r):
    fuentes = []
    for f in filas:
        principal = (f.get("fuente") or "Otra").split("; ")[0]
        if principal not in fuentes:
            fuentes.append(principal)
    tabla = []
    for fu in fuentes:
        sub = [f for f in filas if (f.get("fuente") or "Otra").split("; ")[0] == fu]
        tabla.append([fu, len(sub)] + [sum(1 for f in sub if f.get(f"filtro_{e}") == "1") for e in ETAPAS])
    total = ["Total", sum(t[1] for t in tabla)] + [sum(t[i] for t in tabla) for i in range(2, 5)]
    finales = total[4] or 1
    filas_md = []
    for t in tabla + [total]:
        pct = f"{100 * t[4] / finales:.1f}%" if total[4] else "—"
        filas_md.append(t + [pct])

    cab = ["Fuente", "Artículos encontrados", "Filtrados por título", "Filtrados por abstract",
           "Filtrados por texto completo", "Porcentaje por fuente"]
    md = "| " + " | ".join(cab) + " |\n|" + "---|" * len(cab) + "\n"
    md += "".join("| " + " | ".join(str(x) for x in t) + " |\n" for t in filas_md)
    r["lit"].joinpath("distribucion.md").write_text(
        "**Tabla N**\n\n*Distribución de artículos por fuente*\n\n" + md +
        "\n*Nota.* Elaboración propia a partir del registro de búsquedas.\n", encoding="utf-8")

    tex = ["\\begin{table}[htbp]", "\\caption{Distribución de artículos por fuente}",
           "\\label{tab:distribucion-articulos}", "\\centering\\small",
           "\\begin{tabular}{lrrrrr}", "\\toprule",
           "Fuente & Encontrados & Por título & Por abstract & Por texto & \\% \\\\", "\\midrule"]
    for t in filas_md:
        if t[0] == "Total":
            tex.append("\\midrule")
        fila = [str(x).replace("%", "\\%").replace("&", "\\&") for x in t]
        tex.append(" & ".join(fila) + " \\\\")
    tex += ["\\bottomrule", "\\end{tabular}",
            "\\par\\raggedright\\textit{Nota.} Elaboración propia a partir del registro de búsquedas.",
            "\\end{table}"]
    r["lit"].joinpath("distribucion.tex").write_text("\n".join(tex) + "\n", encoding="utf-8")
    print(md)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("accion", choices=["ver", "marcar", "distribucion"])
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--etapa", choices=ETAPAS)
    ap.add_argument("--pasan", default="")
    ap.add_argument("--salen", default="")
    ap.add_argument("--resto", choices=["0", ""], default="")
    ap.add_argument("--motivo", default="")
    a = ap.parse_args()
    r = rutas(a.proyecto)
    filas = leer_csv(r["candidatos"])
    if a.accion == "distribucion":
        distribucion(filas, r)
        return
    if not a.etapa:
        raise SystemExit("--etapa es obligatorio")
    if a.accion == "ver":
        ver(filas, a.etapa)
        return
    conj = lambda s: {x.strip() for x in s.split(",") if x.strip()}
    marcar(filas, a.etapa, conj(a.pasan), conj(a.salen), a.resto, a.motivo)
    escribir_csv(r["candidatos"], filas, CAMPOS_CANDIDATO)
    quedan = len(pendientes(filas, a.etapa))
    print(f"marcado. Pendientes en la etapa {a.etapa}: {quedan}")


if __name__ == "__main__":
    main()
