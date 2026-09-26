#!/usr/bin/env python3
"""Análisis estadístico de los indicadores de la VD para la tesis.

Tres diseños, según `metodologia.ruta_pre_prueba` de tesis.yaml y las columnas del CSV:

  pareado        GE: O1 X O2 con la misma unidad medida antes y después.
                 CSV: id,indicador,pre,post
                 Prueba: t de Student para muestras relacionadas / Wilcoxon.
  independiente  O1 y O2 son unidades distintas (p. ej. históricos del proceso anterior
                 frente a registros nuevos; no hay unidad pareable).
                 CSV: indicador,grupo,valor   (grupo = pre | post)
                 Prueba: t de Student para muestras independientes (Welch si las varianzas
                 difieren según Levene) / U de Mann-Whitney.
  solo_post      G: X O2, sin pre-prueba. Se contrasta contra un valor de referencia
                 (meta, estándar o dato publicado), tomado de `referencia` del indicador en
                 tesis.yaml o de --referencia SIM=valor.
                 CSV: indicador,valor   (id opcional)
                 Prueba: t de Student para una muestra / Wilcoxon de rangos con signo
                 contra la referencia.

Todas las pruebas son unilaterales según el `sentido` del indicador (baja | sube).

Salidas:
  generado/resultados/descriptivos.tex, normalidad.tex, contrastacion.tex,
  generado/resultados/contrastacion-<SIM>.tex, resumen.json, resumen.md
  figuras/out/boxplot-<SIM>.pdf|png, figuras/out/medias.pdf|png
  datos/spss_import.csv

Uso:
  python estadistica.py --proyecto RUTA [--datos datos/pre_post.csv]
         [--diseno auto|pareado|independiente|solo_post] [--referencia TPR=5 ...]
         [--decimal coma|punto] [--alfa 0.05] [--umbral-normalidad 50]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("Falta PyYAML: pip install pyyaml")

try:
    from statsmodels.stats.diagnostic import lilliefors
except ImportError:  # pragma: no cover
    lilliefors = None


# ---------------------------------------------------------------- formato ---

COMA_MATH = [True]  # coma decimal dentro de $...$ (se fija en main)


class Fmt:
    """Números en estilo APA con coma o punto decimal."""

    def __init__(self, decimal: str):
        self.coma = decimal == "coma"
        self.sep = "; " if self.coma else ", "

    def num(self, x, d: int = 2) -> str:
        if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
            return "---"
        s = f"{x:.{d}f}"
        if s.startswith("-"):
            s = "−" + s[1:]
        return s.replace(".", ",") if self.coma else s

    def p(self, p: float) -> str:
        """p sin cero inicial (APA): ,032 / < ,001."""
        if p < 0.001:
            return "< " + ("," if self.coma else ".") + "001"
        s = f"{p:.3f}"[1:]
        return s.replace(".", ",") if self.coma else s

    def p_eq(self, p: float) -> str:
        t = self.p(p)
        return f"p {t}" if t.startswith("<") else f"p = {t}"

    def ic(self, lo, hi, d: int = 2) -> str:
        return f"[{self.num(lo, d)}{self.sep}{self.num(hi, d)}]"

    @staticmethod
    def tex(s: str) -> str:
        return s.replace("−", "$-$").replace("< ", "$<$ ")


# ------------------------------------------------------------- estadística ---

def descriptivos(x: np.ndarray) -> dict:
    n = len(x)
    m = float(np.mean(x))
    de = float(np.std(x, ddof=1)) if n > 1 else float("nan")
    ee = de / math.sqrt(n) if n > 1 else float("nan")
    tcrit = stats.t.ppf(0.975, n - 1) if n > 1 else float("nan")
    return {
        "n": n, "media": m, "mediana": float(np.median(x)), "de": de,
        "min": float(np.min(x)), "max": float(np.max(x)),
        "asimetria": float(stats.skew(x, bias=False)) if n > 2 else float("nan"),
        "curtosis": float(stats.kurtosis(x, bias=False)) if n > 3 else float("nan"),
        "ic95": [m - tcrit * ee, m + tcrit * ee],
    }


def normalidad(x: np.ndarray, umbral: int) -> dict:
    n = len(x)
    if n < 3 or np.allclose(x, x[0]):
        return {"prueba": "No aplica", "estadistico": float("nan"), "gl": n, "p": 0.0, "normal": False}
    if n <= umbral:
        r = stats.shapiro(x)
        return {"prueba": "Shapiro-Wilk", "estadistico": float(r.statistic), "gl": n,
                "p": float(r.pvalue), "normal": bool(r.pvalue > 0.05)}
    if lilliefors is not None:
        stat, p = lilliefors(x, dist="norm")
        nombre = "Kolmogorov-Smirnov (Lilliefors)"
    else:
        r = stats.kstest(x, "norm", args=(np.mean(x), np.std(x, ddof=1)))
        stat, p = r.statistic, r.pvalue
        nombre = "Kolmogorov-Smirnov (sin corrección de Lilliefors)"
    return {"prueba": nombre, "estadistico": float(stat), "gl": n, "p": float(p), "normal": bool(p > 0.05)}


def _z_de_p(p: float) -> float:
    return float(stats.norm.isf(p)) if 0 < p < 1 else float("nan")


def contraste_pareado(pre, post, sentido, umbral):
    # baja → Ha: μpre > μpost ; sube → Ha: μpre < μpost
    alt = "greater" if sentido == "baja" else "less"
    dif = pre - post
    nd = normalidad(dif, umbral)
    n = len(dif)
    out = {"normalidad": [("Diferencia (pre $-$ post)", nd)], "decide_con": "diferencias"}
    if nd["normal"]:
        r = stats.ttest_rel(pre, post, alternative=alt)
        de = float(np.std(dif, ddof=1))
        tcrit, ee = stats.t.ppf(0.975, n - 1), de / math.sqrt(n)
        out.update(prueba="t de Student para muestras relacionadas", est_nombre="t",
                   estadistico=float(r.statistic), gl=n - 1, z=None, p=float(r.pvalue),
                   efecto_nombre="d", efecto=abs(float(np.mean(dif)) / de) if de > 0 else float("nan"),
                   ic95_diferencia=[float(np.mean(dif) - tcrit * ee), float(np.mean(dif) + tcrit * ee)])
    else:
        if np.allclose(dif, 0):
            w, p = float("nan"), 1.0
        else:
            r = stats.wilcoxon(pre, post, alternative=alt, zero_method="wilcox",
                               method="approx", correction=False)
            w, p = float(r.statistic), float(r.pvalue)
        z = _z_de_p(p)
        n_ef = int(np.sum(~np.isclose(dif, 0)))
        out.update(prueba="Rangos con signo de Wilcoxon", est_nombre="W", estadistico=w, gl=None,
                   z=z, p=p, efecto_nombre="r",
                   efecto=abs(z) / math.sqrt(n_ef) if n_ef and not math.isnan(z) else float("nan"),
                   ic95_diferencia=None)
    out["h_tex"] = (r"$H_0$: $\mu_{pre} \le \mu_{post}$; $H_a$: $\mu_{pre} > \mu_{post}$" if sentido == "baja"
                    else r"$H_0$: $\mu_{pre} \ge \mu_{post}$; $H_a$: $\mu_{pre} < \mu_{post}$")
    return out


def contraste_independiente(pre, post, sentido, umbral):
    alt = "greater" if sentido == "baja" else "less"
    n1_, n2_ = normalidad(pre, umbral), normalidad(post, umbral)
    out = {"normalidad": [("Pre-prueba", n1_), ("Post-prueba", n2_)], "decide_con": "grupos"}
    n1, n2 = len(pre), len(post)
    if n1_["normal"] and n2_["normal"]:
        lev = stats.levene(pre, post, center="mean")
        iguales = bool(lev.pvalue > 0.05)
        r = stats.ttest_ind(pre, post, equal_var=iguales, alternative=alt)
        sp = math.sqrt(((n1 - 1) * np.var(pre, ddof=1) + (n2 - 1) * np.var(post, ddof=1)) / (n1 + n2 - 2))
        d = abs(float(np.mean(pre) - np.mean(post)) / sp) if sp > 0 else float("nan")
        # gl: Student o Welch-Satterthwaite
        if iguales:
            gl = n1 + n2 - 2
        else:
            v1, v2 = np.var(pre, ddof=1) / n1, np.var(post, ddof=1) / n2
            gl = float((v1 + v2) ** 2 / (v1 ** 2 / (n1 - 1) + v2 ** 2 / (n2 - 1)))
        ee = math.sqrt(np.var(pre, ddof=1) / n1 + np.var(post, ddof=1) / n2) if not iguales else \
            sp * math.sqrt(1 / n1 + 1 / n2)
        dm = float(np.mean(pre) - np.mean(post))
        tcrit = stats.t.ppf(0.975, gl)
        out.update(prueba=("t de Student para muestras independientes" if iguales
                           else "t de Welch para muestras independientes"),
                   est_nombre="t", estadistico=float(r.statistic), gl=gl, z=None, p=float(r.pvalue),
                   efecto_nombre="d", efecto=d, ic95_diferencia=[dm - tcrit * ee, dm + tcrit * ee],
                   levene={"F": float(lev.statistic), "p": float(lev.pvalue), "varianzas_iguales": iguales})
    else:
        r = stats.mannwhitneyu(pre, post, alternative=alt, method="asymptotic", use_continuity=True)
        z = _z_de_p(float(r.pvalue))
        out.update(prueba="U de Mann-Whitney", est_nombre="U", estadistico=float(r.statistic), gl=None,
                   z=z, p=float(r.pvalue), efecto_nombre="r",
                   efecto=abs(z) / math.sqrt(n1 + n2) if not math.isnan(z) else float("nan"),
                   ic95_diferencia=None)
    out["h_tex"] = (r"$H_0$: $\mu_{pre} \le \mu_{post}$; $H_a$: $\mu_{pre} > \mu_{post}$" if sentido == "baja"
                    else r"$H_0$: $\mu_{pre} \ge \mu_{post}$; $H_a$: $\mu_{pre} < \mu_{post}$")
    return out


def contraste_solo_post(post, ref, sentido, umbral):
    # baja → Ha: μpost < ref ; sube → Ha: μpost > ref
    alt = "less" if sentido == "baja" else "greater"
    nd = normalidad(post, umbral)
    n = len(post)
    out = {"normalidad": [("Post-prueba", nd)], "decide_con": "post", "referencia": ref}
    if nd["normal"]:
        r = stats.ttest_1samp(post, ref, alternative=alt)
        de = float(np.std(post, ddof=1))
        dm = float(np.mean(post) - ref)
        tcrit, ee = stats.t.ppf(0.975, n - 1), de / math.sqrt(n)
        out.update(prueba="t de Student para una muestra", est_nombre="t", estadistico=float(r.statistic),
                   gl=n - 1, z=None, p=float(r.pvalue), efecto_nombre="d",
                   efecto=abs(dm) / de if de > 0 else float("nan"),
                   ic95_diferencia=[dm - tcrit * ee, dm + tcrit * ee])
    else:
        dif = post - ref
        if np.allclose(dif, 0):
            w, p = float("nan"), 1.0
        else:
            r = stats.wilcoxon(dif, alternative=alt, zero_method="wilcox", method="approx", correction=False)
            w, p = float(r.statistic), float(r.pvalue)
        z = _z_de_p(p)
        n_ef = int(np.sum(~np.isclose(dif, 0)))
        out.update(prueba="Rangos con signo de Wilcoxon (una muestra)", est_nombre="W", estadistico=w,
                   gl=None, z=z, p=p, efecto_nombre="r",
                   efecto=abs(z) / math.sqrt(n_ef) if n_ef and not math.isnan(z) else float("nan"),
                   ic95_diferencia=None)
    r_ = f"{ref:g}".replace(".", "{,}") if COMA_MATH[0] else f"{ref:g}"
    out["h_tex"] = (rf"$H_0$: $\mu_{{post}} \ge {r_}$; $H_a$: $\mu_{{post}} < {r_}$" if sentido == "baja"
                    else rf"$H_0$: $\mu_{{post}} \le {r_}$; $H_a$: $\mu_{{post}} > {r_}$")
    return out


def magnitud_efecto(nombre: str, v: float) -> str:
    if v is None or math.isnan(v):
        return "no determinable"
    cortes = (0.2, 0.5, 0.8) if nombre == "d" else (0.1, 0.3, 0.5)
    return "trivial" if v < cortes[0] else "pequeño" if v < cortes[1] else "mediano" if v < cortes[2] else "grande"


# ------------------------------------------------------------------ salida ---

TABLA = r"""\begin{table}[htbp]
\caption{%s}
\label{%s}
\centering
\small
\begin{tabular}{%s}
\toprule
%s \\
\midrule
%s
\bottomrule
\end{tabular}
\nota{%s}
\end{table}
"""


def tabla_tex(titulo, etiqueta, columnas, encabezado, filas, nota):
    cuerpo = "\n".join(" & ".join(f) + r" \\" for f in filas)
    return TABLA % (titulo, etiqueta, columnas, " & ".join(encabezado), cuerpo, nota)


def esc(s) -> str:
    return (str(s).replace("\\", r"\textbackslash{}").replace("&", r"\&")
            .replace("%", r"\%").replace("_", r"\_").replace("#", r"\#"))


def estadistico_txt(c: dict, f: Fmt) -> str:
    if c["est_nombre"] == "t":
        gl = c["gl"]
        gl_s = str(gl) if isinstance(gl, int) else f.num(gl)
        return f"t({gl_s}) = {f.num(c['estadistico'])}"
    return f"{c['est_nombre']} = {f.num(c['estadistico'], 1)}, z = {f.num(c['z'])}"


def figuras(res, out: Path, coma: bool = True):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({
        "font.family": "sans-serif", "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
        "savefig.facecolor": "white", "figure.facecolor": "white",
    })
    from matplotlib.ticker import FuncFormatter

    def eje(ax):
        if coma:
            ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}".replace(".", ",")))

    ancho = 15.5 / 2.54
    out.mkdir(parents=True, exist_ok=True)
    grises = {"pre": "#bdbdbd", "post": "#636363"}
    etiquetas = {"pre": "Pre-prueba", "post": "Post-prueba"}
    for r in res:
        ks = list(r["valores"])
        fig, ax = plt.subplots(figsize=(ancho * 0.6, 3.2))
        bp = ax.boxplot([r["valores"][k] for k in ks], tick_labels=[etiquetas[k] for k in ks],
                        patch_artist=True, widths=0.5, medianprops={"color": "black"})
        for patch, k in zip(bp["boxes"], ks):
            patch.set_facecolor(grises[k])
            patch.set_edgecolor("black")
        if "referencia" in r["contraste"]:
            ax.axhline(r["contraste"]["referencia"], ls="--", color="black", lw=1)
            ax.annotate("Referencia", xy=(1.3, r["contraste"]["referencia"]), fontsize=8, va="bottom")
        ax.set_ylabel(f"{r['nombre']} ({r['unidad']})" if r["unidad"] else r["nombre"])
        eje(ax)
        fig.tight_layout()
        for ext in ("pdf", "png"):
            fig.savefig(out / f"boxplot-{r['simbolo']}.{ext}", dpi=300)
        plt.close(fig)

    fig, axes = plt.subplots(1, len(res), figsize=(ancho, 3.0), squeeze=False)
    for ax, r in zip(axes[0], res):
        ks = list(r["grupos"])
        medias = [r["grupos"][k]["media"] for k in ks]
        err = [[m - r["grupos"][k]["ic95"][0] for m, k in zip(medias, ks)],
               [r["grupos"][k]["ic95"][1] - m for m, k in zip(medias, ks)]]
        ax.bar([etiquetas[k].split("-")[0] for k in ks], medias, yerr=err, capsize=4,
               color=[grises[k] for k in ks], edgecolor="black")
        if "referencia" in r["contraste"]:
            ax.axhline(r["contraste"]["referencia"], ls="--", color="black", lw=1)
        ax.set_title(r["simbolo"], fontsize=10)
        ax.set_ylabel(r["unidad"] or "")
        eje(ax)
    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(out / f"medias.{ext}", dpi=300)
    plt.close(fig)


def redactar(r: dict, f: Fmt, alfa: float) -> str:
    c = r["contraste"]
    g = r["grupos"]
    verbo = "disminuye" if r["sentido"] == "baja" else "incrementa"
    u = r["unidad"]
    lineas = [f"### {r['simbolo']} — {r['nombre']}", ""]
    if "pre" in g:
        lineas.append(
            f"En la pre-prueba se obtuvo una media de {f.num(g['pre']['media'])} {u} "
            f"(DE = {f.num(g['pre']['de'])}, n = {g['pre']['n']}) y en la post-prueba de "
            f"{f.num(g['post']['media'])} {u} (DE = {f.num(g['post']['de'])}, n = {g['post']['n']}), "
            f"lo que representa una variación de {f.num(r['variacion_pct'], 1)} %.")
    else:
        lineas.append(
            f"En la post-prueba se obtuvo una media de {f.num(g['post']['media'])} {u} "
            f"(DE = {f.num(g['post']['de'])}, n = {g['post']['n']}), frente al valor de referencia de "
            f"{f.num(c['referencia'])} {u}.")
    partes = []
    for et, nd in c["normalidad"]:
        partes.append(f"{et.replace('$-$', '-')}: {nd['prueba']}, estadístico = "
                      f"{f.num(nd['estadistico'], 3)}, {f.p_eq(nd['p'])}")
    todas = all(nd["normal"] for _, nd in c["normalidad"])
    lineas.append(
        f"Umbral de normalidad: n ≤ {r['umbral_normalidad']} Shapiro-Wilk, mayor Kolmogorov-Smirnov. "
        + "; ".join(partes) + ". "
        + ("Como p > 0,05, se asume normalidad y se aplicó la prueba " if todas
           else "Como p < 0,05 en al menos un caso, no se asume normalidad y se aplicó la prueba ")
        + f"{c['prueba']}.")
    if "levene" in c:
        lineas.append(f"Prueba de Levene: F = {f.num(c['levene']['F'])}, {f.p_eq(c['levene']['p'])} "
                      f"({'varianzas iguales' if c['levene']['varianzas_iguales'] else 'varianzas diferentes'}).")
    ef = f"{c['efecto_nombre']} = {f.num(c['efecto'])}"
    lineas.append(
        f"H0: la implementación no {verbo} {r['nombre'].lower()}. "
        f"Ha: la implementación {verbo} {r['nombre'].lower()}. "
        f"Resultado ({estadistico_txt(c, f)}, {f.p_eq(c['p'])}, {ef}; efecto "
        f"{magnitud_efecto(c['efecto_nombre'], c['efecto'])}): "
        + (f"como p < {f.num(alfa)}, se rechaza H0 y se acepta Ha." if c["rechaza_h0"]
           else f"como p ≥ {f.num(alfa)}, no se rechaza H0."))
    return "\n".join(lineas) + "\n"


# -------------------------------------------------------------------- main ---

def cargar_yaml(path: Path):
    cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    ind = {}
    for dim in ((cfg.get("variables") or {}).get("dependiente") or {}).get("dimensiones") or []:
        for i in dim.get("indicadores") or []:
            sim = i.get("simbolo") or i.get("nombre")
            ind[sim] = {"nombre": i.get("nombre", sim), "unidad": i.get("unidad", ""),
                        "sentido": i.get("sentido", "sube"), "especifico": i.get("especifico"),
                        "dimension": dim.get("nombre", ""), "referencia": i.get("referencia")}
    ruta = (cfg.get("metodologia") or {}).get("ruta_pre_prueba")
    return ind, ruta


def detectar_diseno(pedido: str, ruta: str | None, cols: set) -> str:
    if pedido != "auto":
        return pedido
    if ruta == "solo_post":
        return "solo_post"
    if {"pre", "post"} <= cols:
        return "pareado"
    if {"grupo", "valor"} <= cols:
        return "independiente"
    if "valor" in cols:
        return "solo_post"
    sys.exit("No se pudo detectar el diseño: usa columnas id,indicador,pre,post (pareado), "
             "indicador,grupo,valor (independiente) o indicador,valor (solo_post).")


def main(argv=None):
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", default=".")
    ap.add_argument("--datos", default="datos/pre_post.csv")
    ap.add_argument("--diseno", choices=["auto", "pareado", "independiente", "solo_post"], default="auto")
    ap.add_argument("--referencia", action="append", default=[], metavar="SIM=VALOR",
                    help="valor de referencia para solo_post (sobrescribe tesis.yaml)")
    ap.add_argument("--decimal", choices=["coma", "punto"], default="coma")
    ap.add_argument("--alfa", type=float, default=0.05)
    ap.add_argument("--umbral-normalidad", type=int, default=50,
                    help="n ≤ umbral → Shapiro-Wilk; n > umbral → K-S Lilliefors (curso: 50)")
    ap.add_argument("--sin-figuras", action="store_true")
    a = ap.parse_args(argv)

    raiz = Path(a.proyecto).resolve()
    f = Fmt(a.decimal)
    COMA_MATH[0] = f.coma
    ind, ruta = cargar_yaml(raiz / "tesis.yaml")
    datos = pd.read_csv(raiz / a.datos)
    if "indicador" not in datos.columns:
        sys.exit("El CSV necesita la columna 'indicador' (el simbolo de tesis.yaml).")
    diseno = detectar_diseno(a.diseno, ruta, set(datos.columns))
    requeridas = {"pareado": {"id", "indicador", "pre", "post"},
                  "independiente": {"indicador", "grupo", "valor"},
                  "solo_post": {"indicador", "valor"}}[diseno]
    if requeridas - set(datos.columns):
        sys.exit(f"Diseño {diseno}: faltan columnas {sorted(requeridas - set(datos.columns))}")

    refs = {}
    for s in a.referencia:
        k, _, v = s.partition("=")
        refs[k] = float(v.replace(",", "."))

    desconocidos = sorted(set(datos["indicador"]) - set(ind))
    if desconocidos:
        sys.exit(f"Indicadores del CSV que no están en tesis.yaml (simbolo): {desconocidos}")

    resultados = []
    for sim, meta in ind.items():
        sub = datos[datos["indicador"] == sim]
        if sub.empty:
            print(f"AVISO: sin datos para {sim}", file=sys.stderr)
            continue
        r = {"simbolo": sim, **meta, "diseno": diseno, "umbral_normalidad": a.umbral_normalidad}
        if diseno == "pareado":
            sub = sub.dropna(subset=["pre", "post"])
            pre, post = sub["pre"].to_numpy(float), sub["post"].to_numpy(float)
            c = contraste_pareado(pre, post, meta["sentido"], a.umbral_normalidad)
            r["valores"] = {"pre": pre, "post": post}
        elif diseno == "independiente":
            sub = sub.dropna(subset=["valor"])
            grupo = sub["grupo"].astype(str).str.strip().str.lower()
            pre = sub.loc[grupo == "pre", "valor"].to_numpy(float)
            post = sub.loc[grupo == "post", "valor"].to_numpy(float)
            if not len(pre) or not len(post):
                sys.exit(f"{sim}: el diseño independiente necesita filas con grupo=pre y grupo=post")
            c = contraste_independiente(pre, post, meta["sentido"], a.umbral_normalidad)
            r["valores"] = {"pre": pre, "post": post}
        else:
            post = sub.dropna(subset=["valor"])["valor"].to_numpy(float)
            ref = refs.get(sim, meta.get("referencia"))
            if ref is None:
                sys.exit(f"{sim}: solo_post necesita un valor de referencia "
                         f"(campo 'referencia' del indicador en tesis.yaml o --referencia {sim}=VALOR)")
            c = contraste_solo_post(post, float(ref), meta["sentido"], a.umbral_normalidad)
            r["valores"] = {"post": post}
        c["rechaza_h0"] = bool(c["p"] < a.alfa)
        r["contraste"] = c
        r["grupos"] = {k: descriptivos(v) for k, v in r["valores"].items()}
        r["normalidad_grupos"] = {k: normalidad(v, a.umbral_normalidad) for k, v in r["valores"].items()}
        r["n"] = max(len(v) for v in r["valores"].values())
        g = r["grupos"]
        r["variacion_pct"] = ((g["post"]["media"] - g["pre"]["media"]) / g["pre"]["media"] * 100
                              if "pre" in g and g["pre"]["media"] else float("nan"))
        resultados.append(r)

    if not resultados:
        sys.exit("No hay datos para ningún indicador.")

    gen = raiz / "generado" / "resultados"
    gen.mkdir(parents=True, exist_ok=True)
    x = f.tex
    alfa_m = f.num(a.alfa).replace(",", "{,}")  # coma decimal sin espacio en modo matemático
    etq ={"pre": "Pre-prueba", "post": "Post-prueba"}

    filas = []
    for r in resultados:
        for i, (k, d) in enumerate(r["grupos"].items()):
            filas.append([esc(r["simbolo"]) if i == 0 else "", etq[k], str(d["n"]),
                          x(f.num(d["media"])), x(f.num(d["mediana"])), x(f.num(d["de"])),
                          x(f.num(d["min"])), x(f.num(d["max"])), x(f.num(d["asimetria"])),
                          x(f.num(d["curtosis"])), x(f.ic(*d["ic95"]))])
    (gen / "descriptivos.tex").write_text(tabla_tex(
        "Estadísticos descriptivos de los indicadores",
        "tab:descriptivos", "llrrrrrrrrl",
        ["Ind.", "Momento", "$n$", "$M$", "$Mdn$", "$DE$", "Mín.", "Máx.", "Asim.", "Curt.", "IC 95 \\%"],
        filas, "Elaboración propia."), encoding="utf-8")

    filas = []
    for r in resultados:
        filas_r = [(etq[k], nd) for k, nd in r["normalidad_grupos"].items()]
        if diseno == "pareado":
            filas_r += r["contraste"]["normalidad"]
        for i, (et, nd) in enumerate(filas_r):
            filas.append([esc(r["simbolo"]) if i == 0 else "", et, nd["prueba"],
                          x(f.num(nd["estadistico"], 3)), str(nd["gl"]), x(f.p(nd["p"])),
                          "Normal" if nd["normal"] else "No normal"])
    criterio = {"pareado": "la normalidad de las diferencias (pre $-$ post)",
                "independiente": "la normalidad de ambos grupos",
                "solo_post": "la normalidad de la post-prueba"}[diseno]
    (gen / "normalidad.tex").write_text(tabla_tex(
        "Pruebas de normalidad de los indicadores", "tab:normalidad", "lllrrrl",
        ["Ind.", "Datos", "Prueba", "Estadístico", "gl", "$p$", "Distribución"], filas,
        f"La elección de la prueba de contraste se basa en {criterio}. Se aplica Shapiro-Wilk si "
        f"$n \\le {a.umbral_normalidad}$ y Kolmogorov-Smirnov con corrección de Lilliefors si "
        f"$n > {a.umbral_normalidad}$. Elaboración propia."), encoding="utf-8")

    filas = []
    for r in resultados:
        c = r["contraste"]
        est = estadistico_txt(c, f).replace("t(", "$t$(").replace("W =", "$W$ =").replace("U =", "$U$ =") \
            .replace("z =", "$z$ =").replace(", ", "; " if f.coma else ", ")
        filas.append([esc(r["simbolo"]), "Baja" if r["sentido"] == "baja" else "Sube", c["prueba"],
                      x(est), x(f.p(c["p"])), f"${c['efecto_nombre']}$ = {x(f.num(c['efecto']))}",
                      "Se rechaza $H_0$" if c["rechaza_h0"] else "No se rechaza $H_0$"])
    (gen / "contrastacion.tex").write_text(tabla_tex(
        "Resumen de la contrastación de hipótesis por indicador", "tab:contrastacion", "llp{3.6cm}lrll",
        ["Ind.", "Sentido", "Prueba", "Estadístico", "$p$", "Efecto", "Decisión"], filas,
        f"Contraste unilateral con $\\alpha = {alfa_m}$. Elaboración propia."), encoding="utf-8")

    for r in resultados:
        c, g = r["contraste"], r["grupos"]
        filas = [[f"Media {etq[k].lower()}", x(f.num(d["media"]))] for k, d in g.items()]
        if "referencia" in c:
            filas.append(["Valor de referencia", x(f.num(c["referencia"]))])
        if "levene" in c:
            filas.append(["Levene", x(f"F = {f.num(c['levene']['F'])}; p = {f.p(c['levene']['p'])}")])
        filas.append(["Prueba", c["prueba"]])
        filas.append(["Estadístico", x(estadistico_txt(c, f).replace(", ", "; " if f.coma else ", "))])
        if c.get("ic95_diferencia"):
            filas.append(["IC 95 \\% de la diferencia", x(f.ic(*c["ic95_diferencia"]))])
        filas += [["$p$ (unilateral)", x(f.p(c["p"]))],
                  [f"Tamaño del efecto (${c['efecto_nombre']}$)",
                   f"{x(f.num(c['efecto']))} ({magnitud_efecto(c['efecto_nombre'], c['efecto'])})"],
                  ["Decisión", "Se rechaza $H_0$ y se acepta $H_a$" if c["rechaza_h0"] else "No se rechaza $H_0$"]]
        (gen / f"contrastacion-{r['simbolo']}.tex").write_text(tabla_tex(
            f"Contrastación de hipótesis para el indicador {esc(r['nombre'].lower())}",
            f"tab:contraste-{r['simbolo']}", "ll", ["Elemento", "Valor"], filas,
            f"{c['h_tex']}; $\\alpha = {alfa_m}$. Elaboración propia."), encoding="utf-8")

    def limpio(o):
        if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
            return None
        if isinstance(o, dict):
            return {k: limpio(v) for k, v in o.items() if k != "valores"}
        if isinstance(o, (list, tuple)):
            return [limpio(v) for v in o]
        if isinstance(o, np.ndarray):
            return limpio(o.tolist())
        if isinstance(o, (np.floating, np.integer)):
            return limpio(o.item())
        if isinstance(o, np.bool_):
            return bool(o)
        return o

    aceptadas = sum(r["contraste"]["rechaza_h0"] for r in resultados)
    resumen = {"diseno": diseno, "alfa": a.alfa, "decimal": a.decimal,
               "umbral_normalidad": a.umbral_normalidad, "indicadores": resultados,
               "hipotesis_aceptadas": aceptadas, "hipotesis_total": len(resultados)}
    (gen / "resumen.json").write_text(json.dumps(limpio(resumen), ensure_ascii=False, indent=2), encoding="utf-8")
    md = ["# Redacción sugerida (revísala; no la pegues sin leer)", "", f"Diseño: {diseno}", ""]
    md += [redactar(r, f, a.alfa) for r in resultados]
    md.append(f"En {aceptadas} de {len(resultados)} indicadores se rechazó H0.")
    (gen / "resumen.md").write_text("\n".join(md), encoding="utf-8")

    (raiz / "datos").mkdir(exist_ok=True)
    if diseno == "pareado":
        ancho = datos.pivot_table(index="id", columns="indicador", values=["pre", "post"])
        ancho.columns = [f"{i}_{m}" for m, i in ancho.columns]
        ancho[sorted(ancho.columns)].to_csv(raiz / "datos" / "spss_import.csv", encoding="utf-8")
    else:
        datos.to_csv(raiz / "datos" / "spss_import.csv", index=False, encoding="utf-8")

    if not a.sin_figuras:
        figuras(resultados, raiz / "figuras" / "out", f.coma)

    print(f"Diseño: {diseno}")
    for r in resultados:
        c = r["contraste"]
        print(f"{r['simbolo']}: {c['prueba']} p={c['p']:.6g} {'rechaza H0' if c['rechaza_h0'] else 'no rechaza H0'}")
    print(f"Tablas en {gen}")


if __name__ == "__main__":
    main()
