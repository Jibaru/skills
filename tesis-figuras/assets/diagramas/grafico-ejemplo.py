"""Plantilla de gráfico en estilo APA. figura.py le pasa FIG_OUT y FIG_ANCHO_CM.

Reemplaza DATOS por datos reales leídos de ../../datos/ (nunca inventados).
"""
import os
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

OUT = Path(os.environ.get("FIG_OUT", "."))
ANCHO = float(os.environ.get("FIG_ANCHO_CM", "15.5")) / 2.54

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "savefig.facecolor": "white",
})

# DATOS (ejemplo): distribución de artículos incluidos por base de datos
fuentes = ["Scopus", "IEEE Xplore", "ScienceDirect", "Otros"]
incluidos = [0, 0, 0, 0]

fig, ax = plt.subplots(figsize=(ANCHO * 0.8, 3.0))
ax.bar(fuentes, incluidos, color="#636363", edgecolor="black")
ax.set_ylabel("Artículos incluidos")
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}".replace(".", ",")))  # coma decimal
# Sin título dentro del gráfico: el título va en \caption (APA).
fig.tight_layout()
for ext in ("pdf", "png"):
    fig.savefig(OUT / f"grafico-ejemplo.{ext}", dpi=300)
