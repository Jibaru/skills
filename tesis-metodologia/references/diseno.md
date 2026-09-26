# Referencia de diseño metodológico

## Esquemas de diseño

| Diseño | Esquema | Uso |
|---|---|---|
| Pre-experimental pre/post | GE: O1 X O2 | Por defecto en tesis de Sistemas |
| Pre-experimental solo post | G: X O2 | Solo si no hay forma de obtener O1 |
| Cuasi-experimental | GE: O1 X O2 / GC: O3 – O4 | Solo si existe un segundo grupo real no intervenido (otra sede, otro canal) |
| Experimental puro | RGE / RGC con asignación aleatoria | Raro en tesis de pregrado de Sistemas |

Tabla modelo del esquema (LaTeX):

```latex
\begin{table}[H]
\caption{Esquema del diseño pre-experimental}
\label{tab:diseno}
\begin{tabular}{llll}
\toprule
Grupo & Pre-prueba & Tratamiento & Post-prueba \\
\midrule
GE & $O_1$ & $X$ & $O_2$ \\
\bottomrule
\end{tabular}
\par\smallskip
\begin{minipage}{\linewidth}\small
\textit{Nota.} GE: grupo experimental; $O_1$: medición de los indicadores antes de la
implementación; $X$: implementación del sistema web; $O_2$: medición después de la
implementación. Adaptado de \textcite{hernandez2018}.
\end{minipage}
\end{table}
```

La macro exacta de nota/caption la define `untels.cls`; ajústala si la plantilla trae
un entorno propio.

## Tamaño de muestra

| Caso | Fórmula |
|---|---|
| Proporción, N conocida | $n = \dfrac{N Z^2 p q}{e^2 (N-1) + Z^2 p q}$ |
| Proporción, N desconocida | $n = \dfrac{Z^2 p q}{e^2}$ |
| Media, N conocida | $n = \dfrac{N Z^2 S^2}{(N-1) e^2 + Z^2 S^2}$ |
| Media, N desconocida | $n = \dfrac{Z^2 S^2}{e^2}$ |

Valores de Z: 90 % → 1,645; 95 % → 1,96; 99 % → 2,576. Redondea n hacia arriba.
Calcúlalo con Python y muestra la sustitución numérica en el texto.

Si la unidad es "conversación" y el pre (O1) y el post (O2) deben ser **pareados** para
la t relacionada / Wilcoxon, la unidad pareable típica es el **día** o la **semana**
(p. ej., TPR diario de 30 días antes vs. 30 días después) o el **agente**. Decide la
unidad de pareo con la persona y déjala explícita; si no hay pareo natural, las muestras
son independientes y la prueba cambia a t para muestras independientes / U de
Mann-Whitney (avísalo a `tesis-resultados`).

## Muestreo

- Probabilístico: aleatorio simple, sistemático, estratificado, por conglomerados.
- No probabilístico: por conveniencia, intencional/por juicio, por cuotas.
- Censal: población pequeña y accesible → se trabaja con toda (muestra = población).

## Técnica → instrumento

| Técnica | Instrumento | Típico para |
|---|---|---|
| Análisis documental | Ficha de registro de datos | Registros previos de la empresa, logs del sistema |
| Observación | Ficha / guía de observación | Tiempos medidos manualmente en O1 |
| Encuesta | Cuestionario (Likert) | Satisfacción, percepción |
| Entrevista | Guía de entrevista | Diagnóstico inicial (no para contrastar hipótesis) |

## Validez por juicio de expertos (Anexo 3)

Tabla por ítem del instrumento, agrupada por dimensión, con columnas Claridad /
Pertinencia / Relevancia (Sí/No u 1–4), observaciones, y al final: "Opinión de
aplicabilidad: Aplicable ( ) Aplicable después de corregir ( ) No aplicable ( )",
apellidos y nombres del experto, grado, especialidad, DNI, fecha y firma. Tres expertos.
Resumen en el capítulo:

| Experto | Grado | Especialidad | Opinión |
|---|---|---|---|

## Textos modelo (parafrasear, no copiar; citar la fuente real en bib)

- Enfoque: "La investigación adoptará un enfoque cuantitativo, dado que los indicadores
  de la variable dependiente se expresarán numéricamente y se analizarán mediante
  pruebas estadísticas \parencite{hernandez2018}."
- Tipo: "Será de tipo aplicada, puesto que empleará conocimiento existente para
  resolver un problema concreto de la organización \parencite{...}."
- Nivel: "Tendrá un nivel explicativo, al buscar establecer el efecto de la variable
  independiente sobre la dependiente \parencite{...}."
- Diseño: "Se empleará un diseño pre-experimental con pre-prueba y post-prueba con un
  solo grupo, en el cual los indicadores se medirán antes y después de la
  implementación del sistema \parencite{ramos2021}."

## Presupuesto

Rubros: Personal (horas × tarifa, si aplica), Bienes (equipos, licencias),
Servicios (API de OpenAI por tokens estimados, WhatsApp Business Platform por
conversación/mensaje según tarifa vigente para Perú, hosting/VPS, dominio, internet),
Otros (impresiones, anillados ×3, empastados ×4, movilidad). Imprevistos 10–20 %.
Los precios de OpenAI y Meta cambian: consultarlos con WebFetch al momento y citar la
página con fecha de consulta.
