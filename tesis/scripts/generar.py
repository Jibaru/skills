#!/usr/bin/env python3
"""Genera los .tex derivados de tesis.yaml (fuente única de verdad).

Uso:
    python generar.py [DIRECTORIO_PROYECTO] [--estricto] [--solo-validar]

- Valida tesis.yaml (alineación problema/objetivo/hipótesis, indicadores, título...).
- Escribe generado/*.tex: meta, carátula, estructura, formulación, objetivos, hipótesis,
  operacionalización, matriz de consistencia, cronograma, presupuesto, instrumentos y
  validación de expertos.
- Sale con código 1 si hay errores. Con --estricto, las advertencias también son errores.

Esquema: references/tesis-yaml.md de la skill `tesis`.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("ERROR: falta PyYAML. Instálalo con:  pip install pyyaml")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Palabras que no cuentan para el límite de 15 palabras del título (artículos,
# preposiciones, conjunciones y conectores).
PALABRAS_VACIAS = set("""
el la los las lo un una unos unas al del de a ante bajo cabe con contra desde durante en entre
hacia hasta mediante para por según segun sin so sobre tras versus vía via y e o u ni que su sus
como cual cuales cuyo cuya se este esta estos estas ese esa
""".split())

ESCALAS = {"Nominal", "Ordinal", "De intervalo", "De razón"}
RUBROS_ORDEN = ["Personal", "Bienes", "Servicios", "Otros"]


class Errores:
    def __init__(self) -> None:
        self.errores: list[str] = []
        self.advertencias: list[str] = []

    def error(self, msg: str) -> None:
        self.errores.append(msg)

    def advertencia(self, msg: str) -> None:
        self.advertencias.append(msg)


# --------------------------------------------------------------------------- utilidades
def esc(texto) -> str:
    """Escapa caracteres especiales de LaTeX en texto plano."""
    if texto is None:
        return ""
    s = str(texto).strip()
    s = s.replace("\\", "\x00")
    for a, b in (("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"), ("_", r"\_"),
                 ("{", r"\{"), ("}", r"\}"), ("~", r"\textasciitilde{}"), ("^", r"\textasciicircum{}")):
        s = s.replace(a, b)
    s = s.replace("\x00", r"\textbackslash{}")
    s = re.sub(r'"([^"]*)"', r"``\1''", s)
    return s


def formula_tex(f) -> str:
    f = (f or "").strip()
    return f"$\\displaystyle {f}$" if f else "---"


def tiene_contenido(ruta: Path) -> bool:
    """True si el archivo tiene algo más que comentarios y espacios."""
    if not ruta.exists():
        return False
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        sin_com = re.sub(r"(?<!\\)%.*", "", linea).strip()
        if sin_com:
            return True
    return False


def g(d, *claves, defecto=None):
    for c in claves:
        if not isinstance(d, dict) or c not in d:
            return defecto
        d = d[c]
    return d if d is not None else defecto


def lista(d, *claves) -> list:
    v = g(d, *claves, defecto=[])
    return v if isinstance(v, list) else [v]


def dinero(x: float) -> str:
    return f"{x:,.2f}"


def palabras_contenido(titulo: str) -> list[str]:
    palabras = re.findall(r"[\wÁÉÍÓÚÜÑáéíóúüñ\-]+", titulo)
    return [p for p in palabras if p.lower() not in PALABRAS_VACIAS]


def indicadores_vd(datos) -> list[tuple[dict, dict]]:
    """Lista de (dimension, indicador) de la variable dependiente."""
    res = []
    for dim in lista(datos, "variables", "dependiente", "dimensiones"):
        for ind in lista(dim, "indicadores"):
            res.append((dim, ind))
    return res


# --------------------------------------------------------------------------- validación
def validar(d: dict, err: Errores) -> None:
    meta = g(d, "meta", defecto={})
    if g(meta, "modo") not in ("plan", "tesis"):
        err.error("meta.modo debe ser 'plan' o 'tesis'.")
    if g(meta, "caratula", defecto="facultad") not in ("facultad", "reglamento"):
        err.error("meta.caratula debe ser 'facultad' o 'reglamento'.")
    if float(g(meta, "interlineado", defecto=1.5)) not in (1.5, 2.0):
        err.error("meta.interlineado debe ser 1.5 o 2.")
    if g(meta, "alineacion", defecto="justificado") not in ("justificado", "izquierda"):
        err.error("meta.alineacion debe ser 'justificado' o 'izquierda'.")

    autores = lista(meta, "autores")
    if not 1 <= len(autores) <= 2:
        err.error("meta.autores debe tener 1 o 2 autores (máximo 2 bachilleres, RCU 009-2024).")
    for i, a in enumerate(autores, 1):
        if not g(a, "apellidos") or not g(a, "nombres"):
            err.error(f"meta.autores[{i}]: faltan apellidos o nombres.")
    if not g(meta, "asesor", "apellidos"):
        err.advertencia("meta.asesor.apellidos está vacío.")
    if not g(meta, "asesor", "orcid"):
        err.advertencia("meta.asesor.orcid está vacío; la rúbrica pide el ORCID del asesor.")

    titulo = g(meta, "titulo", defecto="")
    if not titulo:
        err.error("meta.titulo está vacío.")
    else:
        n = len(palabras_contenido(titulo))
        if n > 15:
            err.advertencia(
                f"El título tiene {n} palabras de contenido (máximo 15 sin artículos, preposiciones "
                "ni conectores; tampoco cuenta el nombre de la organización). Revisa si se pasa.")

    con_hip = bool(g(meta, "con_hipotesis", defecto=True))
    if not g(d, "problema", "general"):
        err.error("problema.general está vacío.")
    if not g(d, "objetivos", "general"):
        err.error("objetivos.general está vacío.")
    pe, oe = lista(d, "problema", "especificos"), lista(d, "objetivos", "especificos")
    if not pe:
        err.error("problema.especificos está vacío.")
    if len(pe) != len(oe):
        err.error(f"Hay {len(pe)} problemas específicos y {len(oe)} objetivos específicos; "
                  "deben corresponderse uno a uno.")
    if con_hip:
        if not g(d, "hipotesis", "general"):
            err.error("hipotesis.general está vacía (meta.con_hipotesis es true).")
        he = lista(d, "hipotesis", "especificos")
        if len(he) != len(pe):
            err.error(f"Hay {len(pe)} problemas específicos y {len(he)} hipótesis específicas; "
                      "deben corresponderse uno a uno.")
    for i, o in enumerate(oe, 1):
        primera = (str(o).split() or [""])[0].lower()
        if not re.search(r"(ar|er|ir)$", primera):
            err.advertencia(f"objetivos.especificos[{i}] no empieza con un verbo en infinitivo: '{primera}'.")

    for rol in ("independiente", "dependiente"):
        if not g(d, "variables", rol, "nombre"):
            err.error(f"variables.{rol}.nombre está vacío.")

    inds = indicadores_vd(d)
    if con_hip and not inds:
        err.error("La variable dependiente no tiene indicadores (variables.dependiente.dimensiones[].indicadores).")
    usados = set()
    for dim, ind in inds:
        nom = g(ind, "nombre", defecto="(sin nombre)")
        for campo in ("nombre", "formula", "unidad", "escala", "instrumento"):
            if not g(ind, campo):
                err.error(f"Indicador '{nom}': falta '{campo}'.")
        if g(ind, "escala") and g(ind, "escala") not in ESCALAS:
            err.error(f"Indicador '{nom}': escala '{g(ind, 'escala')}' no válida ({', '.join(sorted(ESCALAS))}).")
        if g(ind, "sentido") not in ("baja", "sube"):
            err.error(f"Indicador '{nom}': 'sentido' debe ser 'baja' o 'sube'.")
        esp = g(ind, "especifico")
        if not isinstance(esp, int) or not 1 <= esp <= max(len(pe), 1):
            err.error(f"Indicador '{nom}': 'especifico' debe ser un número entre 1 y {len(pe)}.")
        else:
            usados.add(esp)
    for i in range(1, len(pe) + 1):
        if inds and i not in usados:
            err.advertencia(f"El problema/objetivo específico {i} no tiene ningún indicador que lo mida.")

    if g(meta, "modo") == "plan":
        for i, act in enumerate(lista(d, "cronograma"), 1):
            ini, fin = g(act, "inicio"), g(act, "fin")
            if not isinstance(ini, int) or not isinstance(fin, int) or ini < 1 or fin < ini:
                err.error(f"cronograma[{i}]: 'inicio' y 'fin' deben ser semanas enteras con inicio <= fin.")
        if not lista(d, "cronograma"):
            err.advertencia("cronograma está vacío (obligatorio en el plan).")
        items = lista(d, "presupuesto", "items")
        if not items:
            err.advertencia("presupuesto.items está vacío (obligatorio en el plan).")
        for i, it in enumerate(items, 1):
            try:
                float(g(it, "cantidad")), float(g(it, "costo_unitario"))
            except (TypeError, ValueError):
                err.error(f"presupuesto.items[{i}]: 'cantidad' y 'costo_unitario' deben ser números.")


# --------------------------------------------------------------------------- generadores
def gen_meta(d) -> str:
    m = g(d, "meta")
    autores = lista(m, "autores")
    a0 = autores[0]
    asesor = g(m, "asesor", defecto={})
    asesor_txt = f"{g(asesor, 'grado', defecto='')} {g(asesor, 'apellidos', defecto='')}, {g(asesor, 'nombres', defecto='')}".strip()
    lineas = [
        "% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
        r"\modoplan" if m["modo"] == "plan" else r"\modotesis",
        r"\conhipotesistrue" if g(m, "con_hipotesis", defecto=True) else r"\conhipotesisfalse",
        rf"\ConfigurarInterlineado{{{float(g(m, 'interlineado', defecto=1.5))}}}",
        rf"\ConfigurarAlineacion{{{g(m, 'alineacion', defecto='justificado')}}}",
        rf"\newcommand{{\TituloTesis}}{{{esc(m['titulo'])}}}",
        rf"\newcommand{{\AutorPrincipal}}{{{esc(a0['nombres'])} {esc(a0['apellidos'])}}}",
        rf"\newcommand{{\AutorPrincipalDNI}}{{{esc(g(a0, 'dni', defecto=''))}}}",
        rf"\newcommand{{\Asesor}}{{{esc(asesor_txt)}}}",
        rf"\newcommand{{\AsesorORCID}}{{{esc(g(asesor, 'orcid', defecto=''))}}}",
        rf"\newcommand{{\Universidad}}{{{esc(g(m, 'universidad'))}}}",
        rf"\newcommand{{\Facultad}}{{{esc(g(m, 'facultad'))}}}",
        rf"\newcommand{{\Escuela}}{{{esc(g(m, 'escuela'))}}}",
        rf"\newcommand{{\Carrera}}{{{esc(g(m, 'carrera'))}}}",
        rf"\newcommand{{\TituloProfesional}}{{{esc(g(m, 'titulo_profesional'))}}}",
        rf"\newcommand{{\Ciudad}}{{{esc(g(m, 'ciudad'))}}}",
        rf"\newcommand{{\Anio}}{{{esc(g(m, 'anio'))}}}",
        rf"\newcommand{{\PalabrasClave}}{{{esc(', '.join(lista(m, 'palabras_clave')))}}}",
        rf"\newcommand{{\Keywords}}{{{esc(', '.join(lista(m, 'keywords')))}}}",
        rf"\newcommand{{\DelimEspacial}}{{{esc(g(d, 'delimitacion', 'espacial', defecto=''))}}}",
        rf"\newcommand{{\DelimTemporal}}{{{esc(g(d, 'delimitacion', 'temporal', defecto=''))}}}",
        rf"\hypersetup{{pdftitle={{{esc(m['titulo'])}}},pdfauthor={{{esc(a0['nombres'])} {esc(a0['apellidos'])}}}}}",
    ]
    return "\n".join(lineas) + "\n"


def nombre_caratula(a: dict) -> str:
    return f"{esc(str(a['apellidos']).upper())}, {esc(str(a['nombres']).upper())}"


def gen_caratula(d) -> str:
    m = g(d, "meta")
    autores = lista(m, "autores")
    asesor = g(m, "asesor", defecto={})
    doc = "PLAN DE TESIS" if m["modo"] == "plan" else "TESIS"
    titulo = esc(str(m["titulo"]).upper())
    asesor_may = f"{esc(g(asesor, 'grado', defecto=''))} {esc(str(g(asesor, 'apellidos', defecto='')).upper())}, {esc(str(g(asesor, 'nombres', defecto='')).upper())}"
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           r"\thispagestyle{empty}",
           r"\begin{center}",
           r"\fontsize{14}{17}\selectfont\setstretch{1}"]
    if g(m, "caratula", defecto="facultad") == "facultad":
        etiqueta = "BACHILLERES" if len(autores) > 1 else "BACHILLER"
        filas = []
        for i, a in enumerate(autores):
            filas.append(f"{etiqueta + ':' if i == 0 else ''} & {nombre_caratula(a)} \\\\")
        filas.append(f"ASESOR: & {asesor_may} \\\\")
        out += [
            rf"{{\bfseries {esc(g(m, 'universidad'))}}}\\[2pt]",
            rf"{{\bfseries {esc(g(m, 'facultad'))}}}\\[2pt]",
            r"{\bfseries CARRERA PROFESIONAL}\\[2pt]",
            rf"{esc(g(m, 'carrera'))}",
            r"\vfill",
            r"\includegraphics[width=4.6cm]{logo-untels}",
            r"\vfill",
            rf"{{\bfseries {doc}}}",
            r"\vfill",
            rf"\parbox{{0.92\textwidth}}{{\centering ``{titulo}''}}",
            r"\vfill",
            r"{\bfseries PARA OPTAR EL TÍTULO PROFESIONAL DE}\\[2pt]",
            rf"{esc(g(m, 'titulo_profesional'))}",
            r"\vfill",
            r"{\bfseries PRESENTADO POR:}\\[8pt]",
            r"\begin{tabular}{@{}ll@{}}",
            *filas,
            r"\end{tabular}",
            r"\vfill",
            rf"{esc(g(m, 'ciudad'))}, {esc(g(m, 'anio'))}\\[2pt]",
            r"PERÚ",
        ]
    else:
        pres = "PRESENTADO POR LOS BACHILLERES" if len(autores) > 1 else "PRESENTADO POR EL BACHILLER"
        out += [
            rf"{{\bfseries {esc(g(m, 'universidad'))}}}\\[2pt]",
            rf"{{\bfseries {esc(g(m, 'facultad'))}}}\\[2pt]",
            rf"{{\bfseries {esc(g(m, 'escuela'))}}}",
            r"\vfill",
            r"\includegraphics[width=4.6cm]{logo-untels}",
            r"\vfill",
            rf"\parbox{{0.92\textwidth}}{{\centering\bfseries ``{titulo}''}}",
            r"\vfill",
            rf"{{\bfseries {doc}}}\\[6pt]",
            r"{\bfseries Para optar el Título Profesional de}\\[2pt]",
            rf"{{\bfseries {esc(g(m, 'titulo_profesional'))}}}",
            r"\vfill",
            rf"{{\bfseries {pres}}}\\[4pt]",
        ]
        for a in autores:
            out.append(rf"{{\bfseries {nombre_caratula(a)}}}\\")
            out.append(rf"{{\bfseries ORCID: {esc(g(a, 'orcid', defecto=''))}}}\\[4pt]")
        out += [
            r"\vfill",
            rf"{{\bfseries ASESOR: {asesor_may}}}\\",
            rf"{{\bfseries ORCID: {esc(g(asesor, 'orcid', defecto=''))}}}",
            r"\vfill",
            rf"{{\bfseries {esc(g(m, 'ciudad'))}}}\\[2pt]",
            rf"{{\bfseries {esc(g(m, 'anio'))}}}",
        ]
    out += [r"\end{center}", r"\clearpage"]
    return "\n".join(out) + "\n"


def lista_etiquetada(items: list, prefijo: str) -> str:
    out = [rf"\begin{{enumerate}}[label=\textbf{{{prefijo}\arabic*:}},leftmargin=1.27cm,itemsep=4pt]"]
    out += [rf"\item {esc(x)}" for x in items]
    out.append(r"\end{enumerate}")
    return "\n".join(out)


def gen_bloque(d, clave: str, t_general: str, t_especificos: str, prefijo_g: str, prefijo_e: str) -> str:
    return "\n".join([
        "% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
        rf"\subsection{{{t_general}}}",
        esc(g(d, clave, "general")),
        "",
        rf"\subsection{{{t_especificos}}}",
        lista_etiquetada(lista(d, clave, "especificos"), prefijo_e),
    ]) + "\n"


def gen_operacionalizacion(d) -> str:
    cab = (r"\textbf{Variable} & \textbf{Definición conceptual} & \textbf{Definición operacional} & "
           r"\textbf{Dimensión} & \textbf{Indicador} & \textbf{Fórmula} & \textbf{Escala} & \textbf{Instrumento} \\")
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           r"\begin{landscape}",
           r"{\small\setlength{\tabcolsep}{4pt}",
           r"\begin{longtable}{L{2.4cm}L{3.4cm}L{3.4cm}L{2.4cm}L{2.8cm}L{3.3cm}L{1.5cm}L{2.0cm}}",
           r"\caption{Matriz de operacionalización de las variables}\label{tab:operacionalizacion}\\",
           r"\toprule", cab, r"\midrule", r"\endfirsthead",
           r"\multicolumn{8}{@{}l}{\itshape (continuación)}\\", r"\toprule", cab, r"\midrule", r"\endhead",
           r"\bottomrule", r"\endlastfoot"]
    variables = [("independiente", "VI"), ("dependiente", "VD")]
    for k, (rol, sigla) in enumerate(variables):
        v = g(d, "variables", rol, defecto={})
        celda_var = rf"\textbf{{{sigla}:}} {esc(g(v, 'nombre'))}"
        dc, do = esc(g(v, "definicion_conceptual")), esc(g(v, "definicion_operacional"))
        filas = []
        for dim in lista(v, "dimensiones"):
            inds = lista(dim, "indicadores") or [{}]
            for j, ind in enumerate(inds):
                ind_txt = esc(g(ind, "nombre", defecto="---"))
                if g(ind, "simbolo"):
                    ind_txt += f" ({esc(g(ind, 'simbolo'))})"
                if g(ind, "unidad"):
                    ind_txt += f", en {esc(g(ind, 'unidad'))}"
                filas.append([esc(g(dim, "nombre")) if j == 0 else "", ind_txt,
                              formula_tex(g(ind, "formula")) if g(ind, "formula") else "---",
                              esc(g(ind, "escala", defecto="---")), esc(g(ind, "instrumento", defecto="---"))])
        if not filas:
            filas = [["---", "---", "---", "---", "---"]]
        for i, f in enumerate(filas):
            pre = [celda_var, dc, do] if i == 0 else ["", "", ""]
            out.append(" & ".join(pre + f) + r" \\")
        if k < len(variables) - 1:
            out.append(r"\midrule")
    out += [r"\end{longtable}}", r"\vspace{-10pt}", r"\nota{Elaboración propia.}", r"\end{landscape}"]
    return "\n".join(out) + "\n"


def gen_matriz(d) -> str:
    m = g(d, "meta")
    con_hip = bool(g(m, "con_hipotesis", defecto=True))
    met = g(d, "metodologia", defecto={})
    pe, oe = lista(d, "problema", "especificos"), lista(d, "objetivos", "especificos")
    he = lista(d, "hipotesis", "especificos") if con_hip else []
    inds = indicadores_vd(d)

    vi, vd = g(d, "variables", "independiente", defecto={}), g(d, "variables", "dependiente", defecto={})
    dims = "; ".join(esc(g(x, "nombre")) for x in lista(vd, "dimensiones"))
    var_general = (rf"\textbf{{VI:}} {esc(g(vi, 'nombre'))}\newline \textbf{{VD:}} {esc(g(vd, 'nombre'))}"
                   + (rf"\newline \textbf{{Dimensiones:}} {dims}" if dims else ""))
    campos_met = [("Enfoque", "enfoque"), ("Tipo", "tipo"), ("Nivel", "nivel"), ("Diseño", "diseno"),
                  ("Esquema", "esquema"), ("Método", "metodo"), ("Población", "poblacion"),
                  ("Muestra", "muestra"), ("Muestreo", "muestreo")]
    met_txt = r"\newline ".join(rf"\textbf{{{t}:}} {esc(g(met, c))}" for t, c in campos_met if g(met, c))
    if lista(met, "tecnicas"):
        met_txt += rf"\newline \textbf{{Técnicas:}} {esc(', '.join(lista(met, 'tecnicas')))}"
    if lista(met, "instrumentos"):
        met_txt += rf"\newline \textbf{{Instrumentos:}} {esc(', '.join(lista(met, 'instrumentos')))}"

    if con_hip:
        spec = r"L{3.9cm}L{3.9cm}L{3.9cm}L{4.4cm}L{5.4cm}"
        cab = r"\textbf{Problemas} & \textbf{Objetivos} & \textbf{Hipótesis} & \textbf{Variables e indicadores} & \textbf{Metodología} \\"
        ncol = 5
    else:
        spec = r"L{4.8cm}L{4.8cm}L{5.4cm}L{6.4cm}"
        cab = r"\textbf{Problemas} & \textbf{Objetivos} & \textbf{Variables e indicadores} & \textbf{Metodología} \\"
        ncol = 4

    autores_txt = esc("; ".join(f"{a['apellidos']}, {a['nombres']}" for a in lista(m, "autores")))
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           r"\begin{landscape}",
           r"\anexo{Anexo 1. Matriz de consistencia}",
           rf"\noindent{{\small\setstretch{{1}}\textbf{{Título:}} {esc(m['titulo'])}\newline "
           rf"\textbf{{Autor:}} {autores_txt}\par}}",
           r"{\small\setlength{\tabcolsep}{4pt}",
           rf"\begin{{longtable}}{{{spec}}}",
           r"\caption{Matriz de consistencia}\label{tab:matriz-consistencia}\\",
           r"\toprule", cab, r"\midrule", r"\endfirsthead",
           rf"\multicolumn{{{ncol}}}{{@{{}}l}}{{\itshape (continuación)}}\\", r"\toprule", cab, r"\midrule", r"\endhead",
           r"\bottomrule", r"\endlastfoot"]
    fila = [rf"\textbf{{Problema general:}}\newline {esc(g(d, 'problema', 'general'))}",
            rf"\textbf{{Objetivo general:}}\newline {esc(g(d, 'objetivos', 'general'))}"]
    if con_hip:
        fila.append(rf"\textbf{{Hipótesis general:}}\newline {esc(g(d, 'hipotesis', 'general'))}")
    fila += [var_general, met_txt]
    out += [" & ".join(fila) + r" \\", r"\midrule"]
    for i in range(len(pe)):
        ind_i = [ind for _, ind in inds if g(ind, "especifico") == i + 1]
        ind_txt = r"\newline ".join(
            rf"\textbf{{Indicador:}} {esc(g(x, 'nombre'))}" + (f" ({esc(g(x, 'simbolo'))})" if g(x, "simbolo") else "")
            for x in ind_i) or "---"
        fila = [rf"\textbf{{PE{i + 1}:}} {esc(pe[i])}", rf"\textbf{{OE{i + 1}:}} {esc(oe[i] if i < len(oe) else '')}"]
        if con_hip:
            fila.append(rf"\textbf{{HE{i + 1}:}} {esc(he[i] if i < len(he) else '')}")
        fila += [ind_txt, ""]
        out.append(" & ".join(fila) + r" \\")
        if i < len(pe) - 1:
            out.append(r"\midrule")
    out += [r"\end{longtable}}", r"\vspace{-10pt}", r"\nota{Elaboración propia.}", r"\end{landscape}"]
    return "\n".join(out) + "\n"


def gen_cronograma(d) -> str:
    acts = lista(d, "cronograma")
    if not acts:
        return "% GENERADO: cronograma vacío en tesis.yaml.\n"
    semanas = max(int(g(a, "fin", defecto=1)) for a in acts)
    horizontal = semanas > 24
    ancho_total = 22.0 if horizontal else 14.8
    ancho_act = 5.5 if horizontal else 4.6
    w = (ancho_total - ancho_act) / semanas - 0.07
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano."]
    if horizontal:
        out.append(r"\begin{landscape}")
    out += [r"\begin{table}[H]",
            r"\caption{Cronograma de actividades de la tesis}\label{tab:cronograma}",
            r"{\footnotesize\setlength{\tabcolsep}{1pt}",
            rf"\begin{{tabular}}{{@{{}}L{{{ancho_act}cm}}*{{{semanas}}}{{C{{{w:.3f}cm}}}}@{{}}}}",
            r"\toprule",
            rf"\multirow{{2}}{{*}}{{\textbf{{Actividad}}}} & \multicolumn{{{semanas}}}{{c}}{{\textbf{{Semana}}}} \\",
            rf"\cmidrule(l){{2-{semanas + 1}}}",
            " & " + " & ".join(rf"\tiny {s}" for s in range(1, semanas + 1)) + r" \\",
            r"\midrule"]
    for a in acts:
        ini, fin = int(g(a, "inicio")), int(g(a, "fin"))
        celdas = [r"\cellcolor{gray!65}" if ini <= s <= fin else "" for s in range(1, semanas + 1)]
        out.append(esc(g(a, "actividad")) + " & " + " & ".join(celdas) + r" \\[2pt]")
    out += [r"\bottomrule", r"\end{tabular}}", r"\nota{Elaboración propia.}", r"\end{table}"]
    if horizontal:
        out.append(r"\end{landscape}")
    return "\n".join(out) + "\n"


def gen_presupuesto(d) -> str:
    p = g(d, "presupuesto", defecto={})
    items = lista(p, "items")
    if not items:
        return "% GENERADO: presupuesto vacío en tesis.yaml.\n"
    mon = esc(g(p, "moneda", defecto="S/"))
    pct = float(g(p, "imprevistos_pct", defecto=10))
    rubros = sorted({g(i, "rubro", defecto="Otros") for i in items},
                    key=lambda r: RUBROS_ORDEN.index(r) if r in RUBROS_ORDEN else len(RUBROS_ORDEN))
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           r"\begin{longtable}{@{}L{2.4cm}L{6.4cm}r r r@{}}",
           r"\caption{Presupuesto de la tesis}\label{tab:presupuesto}\\",
           r"\toprule",
           rf"\textbf{{Rubro}} & \textbf{{Descripción}} & \textbf{{Cant.}} & \textbf{{C. unit. ({mon})}} & \textbf{{Subtotal ({mon})}} \\",
           r"\midrule", r"\endfirsthead",
           r"\toprule",
           rf"\textbf{{Rubro}} & \textbf{{Descripción}} & \textbf{{Cant.}} & \textbf{{C. unit. ({mon})}} & \textbf{{Subtotal ({mon})}} \\",
           r"\midrule", r"\endhead",
           r"\bottomrule", r"\endlastfoot"]
    total = 0.0
    for r in rubros:
        del_rubro = [i for i in items if g(i, "rubro", defecto="Otros") == r]
        sub = 0.0
        for j, it in enumerate(del_rubro):
            cant, cu = float(g(it, "cantidad")), float(g(it, "costo_unitario"))
            sub += cant * cu
            cant_txt = f"{cant:g}"
            out.append(f"{esc(r) if j == 0 else ''} & {esc(g(it, 'descripcion'))} & {cant_txt} & {dinero(cu)} & {dinero(cant * cu)} \\\\")
        out.append(rf"\multicolumn{{4}}{{@{{}}r}}{{\textit{{Subtotal {esc(r).lower()}}}}} & \textit{{{dinero(sub)}}} \\")
        out.append(r"\midrule")
        total += sub
    imp = total * pct / 100
    out += [rf"\multicolumn{{4}}{{@{{}}r}}{{Subtotal}} & {dinero(total)} \\",
            rf"\multicolumn{{4}}{{@{{}}r}}{{Imprevistos ({pct:g}\,\%)}} & {dinero(imp)} \\",
            rf"\multicolumn{{4}}{{@{{}}r}}{{\textbf{{Total}}}} & \textbf{{{dinero(total + imp)}}} \\",
            r"\end{longtable}", r"\vspace{-10pt}", r"\nota{Elaboración propia. Los montos provienen de cotizaciones.}"]
    return "\n".join(out) + "\n"


def gen_instrumentos(d) -> str:
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           "% Una ficha de registro por indicador de la variable dependiente."]
    for n, (dim, ind) in enumerate(indicadores_vd(d), 1):
        sim = esc(g(ind, "simbolo", defecto=f"I{n}"))
        out += [r"\begin{table}[H]",
                rf"\caption{{Ficha de registro del indicador {esc(g(ind, 'nombre'))}}}\label{{tab:ficha-{n}}}",
                r"{\small\begin{tabularx}{\textwidth}{@{}lY@{}}",
                r"\toprule",
                rf"\textbf{{Dimensión}} & {esc(g(dim, 'nombre'))} \\",
                rf"\textbf{{Indicador}} & {esc(g(ind, 'nombre'))} ({sim}) \\",
                rf"\textbf{{Fórmula}} & {formula_tex(g(ind, 'formula'))} \\",
                rf"\textbf{{Unidad de medida}} & {esc(g(ind, 'unidad'))} \\",
                rf"\textbf{{Técnica / instrumento}} & Observación / {esc(g(ind, 'instrumento'))} \\",
                r"\textbf{Medición} & Pre-prueba ( )\quad Post-prueba ( ) \\",
                r"\bottomrule",
                r"\end{tabularx}}",
                r"\medskip",
                r"{\small\begin{tabularx}{\textwidth}{@{}C{1cm}C{2.6cm}C{3.4cm}Y@{}}",
                r"\toprule",
                rf"\textbf{{N.\textsuperscript{{o}}}} & \textbf{{Fecha}} & \textbf{{{sim} ({esc(g(ind, 'unidad'))})}} & \textbf{{Observaciones}} \\",
                r"\midrule"]
        out += [rf"{k} & & & \\[3pt]" for k in range(1, 11)]
        out += [r"\bottomrule", r"\end{tabularx}}", r"\nota{Elaboración propia.}", r"\end{table}"]
    return "\n".join(out) + "\n"


def gen_validacion(d) -> str:
    out = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
           r"{\setlength{\parindent}{0pt}\setstretch{1}\small",
           rf"\textbf{{Título de la investigación:}} {esc(g(d, 'meta', 'titulo'))}\par",
           r"\textbf{Instrumento evaluado:} fichas de registro de los indicadores (Anexo 2)\par",
           r"\textbf{Criterios:} \textit{Claridad} (el ítem se comprende fácilmente), "
           r"\textit{Pertinencia} (el ítem corresponde al indicador y a la dimensión) y "
           r"\textit{Relevancia} (el ítem es esencial para medir la variable). Marque Sí o No.\par}",
           r"\medskip",
           r"{\small\setlength{\tabcolsep}{3pt}",
           r"\begin{longtable}{@{}C{0.8cm}L{6.2cm}C{1.1cm}C{1.1cm}C{1.1cm}C{1.1cm}C{1.1cm}C{1.1cm}L{2.4cm}@{}}",
           r"\caption{Formato de validación del instrumento por juicio de expertos}\label{tab:validacion}\\",
           r"\toprule",
           r"\multirow{2}{*}{\textbf{N.\textsuperscript{o}}} & \multirow{2}{*}{\textbf{Dimensión / ítem}} & "
           r"\multicolumn{2}{c}{\textbf{Claridad}} & \multicolumn{2}{c}{\textbf{Pertinencia}} & "
           r"\multicolumn{2}{c}{\textbf{Relevancia}} & \multirow{2}{*}{\textbf{Sugerencias}} \\",
           r"\cmidrule(lr){3-4}\cmidrule(lr){5-6}\cmidrule(lr){7-8}",
           r" & & Sí & No & Sí & No & Sí & No & \\",
           r"\midrule", r"\endfirsthead",
           r"\toprule",
           r"\textbf{N.\textsuperscript{o}} & \textbf{Dimensión / ítem} & Sí & No & Sí & No & Sí & No & \textbf{Sugerencias} \\",
           r"\midrule", r"\endhead",
           r"\bottomrule", r"\endlastfoot"]
    n = 0
    for dim in lista(d, "variables", "dependiente", "dimensiones"):
        out.append(rf"\multicolumn{{9}}{{@{{}}l}}{{\textbf{{Dimensión: {esc(g(dim, 'nombre'))}}}}} \\")
        for ind in lista(dim, "indicadores"):
            n += 1
            item = (f"Registro de {esc(str(g(ind, 'nombre')).lower())}"
                    + (f" ({esc(g(ind, 'simbolo'))})" if g(ind, "simbolo") else "")
                    + f" en {esc(g(ind, 'unidad'))}")
            out.append(rf"{n} & {item} & & & & & & & \\")
    out += [r"\end{longtable}}", r"\vspace{-10pt}", r"\nota{Elaboración propia.}",
            r"\medskip",
            r"{\setlength{\parindent}{0pt}\setstretch{1.3}\small",
            r"\textbf{Opinión de aplicabilidad:}\par",
            r"Aplicable ( )\qquad Aplicable después de corregir ( )\qquad No aplicable ( )\par",
            r"\medskip",
            r"\begin{tabularx}{\textwidth}{@{}lX@{}}",
            r"Apellidos y nombres del validador: & \hrulefill \\",
            r"Grado académico y especialidad: & \hrulefill \\",
            r"DNI: & \hrulefill \\",
            r"Fecha: & \hrulefill \\",
            r"\end{tabularx}",
            r"\vspace{2cm}",
            r"\begin{center}\rule{6cm}{0.4pt}\\Firma del experto\end{center}}"]
    return "\n".join(out) + "\n"


def gen_estructura(d, proyecto: Path) -> str:
    m = g(d, "meta")
    plan = m["modo"] == "plan"
    con_hip = bool(g(m, "con_hipotesis", defecto=True))
    L = ["% GENERADO por generar.py desde tesis.yaml. No editar a mano.",
         f"% Estructura oficial UNTELS: {'plan' if plan else 'tesis'} {'con' if con_hip else 'sin'} hipótesis."]

    def cap(titulo: str, *archivos: str) -> None:
        L.append(rf"\chapter{{{titulo}}}")
        L.extend(rf"\input{{{a}}}" for a in archivos)

    if plan:
        L += [r"\pagenumbering{arabic}", r"\input{generado/caratula}",
              r"\tableofcontents", r"\listoftables", r"\listoffigures"]
    else:
        L += [r"\iniciopreliminares", r"\input{generado/caratula}",
              r"\input{preliminares/actas}", r"\clearpage",
              r"\paginapreliminar{DECLARACIÓN DE AUTENTICIDAD}", r"\input{preliminares/declaracion}",
              r"\paginapreliminar{DEDICATORIA}", r"\input{preliminares/dedicatoria}",
              r"\paginapreliminar{AGRADECIMIENTOS}", r"\input{preliminares/agradecimientos}",
              r"\capitulosinnumero{RESUMEN}", r"\input{preliminares/resumen}",
              r"\capitulosinnumero{ABSTRACT}", r"\input{preliminares/abstract}",
              r"\tableofcontents", r"\listoftables", r"\listoffigures",
              r"\iniciocuerpo", r"\capitulosinnumero{INTRODUCCIÓN}", r"\input{capitulos/00-introduccion}"]

    cap("PLANTEAMIENTO DEL PROBLEMA", "capitulos/01-problema")
    cap("MARCO TEÓRICO", "capitulos/02-marco")
    if con_hip:
        cap("VARIABLES E HIPÓTESIS", "capitulos/03-variables")
    cap("METODOLOGÍA", "capitulos/04-metodologia")
    if not plan and (con_hip or tiene_contenido(proyecto / "capitulos/05-resultados.tex")):
        L += [r"\section{Resultados}", r"\input{capitulos/05-resultados}"]
    if plan:
        cap("CRONOGRAMA DE ACTIVIDADES DE LA TESIS", "capitulos/cronograma", "generado/cronograma")
        cap("PRESUPUESTO DE LA TESIS", "capitulos/presupuesto", "generado/presupuesto")
    else:
        if con_hip:
            cap("DISCUSIÓN DE RESULTADOS", "capitulos/06-discusion")
        cap("CONCLUSIONES", "capitulos/07-conclusiones")
    L += [r"\chapter{REFERENCIAS BIBLIOGRÁFICAS}", r"\printbibliography[heading=none]"]

    L += [r"\capitulosinnumero{ANEXOS}", r"\input{generado/matriz-consistencia}"]
    n = 1
    if con_hip:
        n += 1
        L += [r"\clearpage", rf"\anexo{{Anexo {n}. Instrumentos de recolección de datos}}",
              r"\input{generado/instrumentos}", r"\input{anexos/instrumentos}"]
        if not plan:
            n += 1
            L += [r"\clearpage", rf"\anexo{{Anexo {n}. Formato de validación de expertos}}",
                  r"\input{generado/validacion-expertos}"]
    if tiene_contenido(proyecto / "anexos/otros.tex"):
        L += [r"\clearpage", r"\input{anexos/otros}"]
    return "\n".join(L) + "\n"


# --------------------------------------------------------------------------- principal
def main() -> int:
    ap = argparse.ArgumentParser(description="Genera generado/*.tex desde tesis.yaml")
    ap.add_argument("proyecto", nargs="?", default=".", help="directorio del proyecto de tesis")
    ap.add_argument("--estricto", action="store_true", help="tratar advertencias como errores")
    ap.add_argument("--solo-validar", action="store_true", help="validar sin escribir archivos")
    args = ap.parse_args()

    proyecto = Path(args.proyecto).resolve()
    ruta_yaml = proyecto / "tesis.yaml"
    if not ruta_yaml.exists():
        print(f"ERROR: no existe {ruta_yaml}", file=sys.stderr)
        return 1
    try:
        d = yaml.safe_load(ruta_yaml.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        print(f"ERROR: tesis.yaml no es YAML válido:\n{e}", file=sys.stderr)
        return 1

    err = Errores()
    validar(d, err)
    for a in err.advertencias:
        print(f"ADVERTENCIA: {a}", file=sys.stderr)
    for e in err.errores:
        print(f"ERROR: {e}", file=sys.stderr)
    if err.errores or (args.estricto and err.advertencias):
        print(f"\ntesis.yaml tiene {len(err.errores)} error(es) y {len(err.advertencias)} advertencia(s). "
              "No se generó nada.", file=sys.stderr)
        return 1
    if args.solo_validar:
        print(f"tesis.yaml válido ({len(err.advertencias)} advertencia(s)).")
        return 0

    con_hip = bool(g(d, "meta", "con_hipotesis", defecto=True))
    salida = {
        "meta.tex": gen_meta(d),
        "caratula.tex": gen_caratula(d),
        "estructura.tex": gen_estructura(d, proyecto),
        "formulacion.tex": gen_bloque(d, "problema", "Problema general", "Problemas específicos", "PG", "PE"),
        "objetivos.tex": gen_bloque(d, "objetivos", "Objetivo general", "Objetivos específicos", "OG", "OE"),
        "matriz-consistencia.tex": gen_matriz(d),
        "cronograma.tex": gen_cronograma(d),
        "presupuesto.tex": gen_presupuesto(d),
    }
    if con_hip:
        salida.update({
            "hipotesis.tex": gen_bloque(d, "hipotesis", "Hipótesis general", "Hipótesis específicas", "HG", "HE"),
            "operacionalizacion.tex": gen_operacionalizacion(d),
            "instrumentos.tex": gen_instrumentos(d),
            "validacion-expertos.tex": gen_validacion(d),
        })
    destino = proyecto / "generado"
    destino.mkdir(exist_ok=True)
    (destino / "resultados").mkdir(exist_ok=True)
    for nombre, contenido in salida.items():
        (destino / nombre).write_text(contenido, encoding="utf-8", newline="\n")
    print(f"Generados {len(salida)} archivos en {destino} "
          f"(modo {g(d, 'meta', 'modo')}, {'con' if con_hip else 'sin'} hipótesis).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
