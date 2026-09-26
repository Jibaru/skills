---
name: tesis-resultados
description: Analiza los datos de la pre-prueba y la post-prueba de la tesis (normalidad, t de Student o Wilcoxon, Mann-Whitney, prueba contra un valor de referencia), genera las tablas APA y los gráficos, y redacta 4.6 Resultados, V. Discusión de resultados, VI. Conclusiones y las recomendaciones de una tesis UNTELS. Úsala cuando el usuario diga "ya tengo los datos", "analiza los resultados", "prueba de hipótesis", "contrastación de hipótesis", "prueba de normalidad", "t de student", "wilcoxon", "redacta la discusión", "escribe las conclusiones" o "recomendaciones".
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-resultados

Esta skill convierte mediciones reales en el cierre de la tesis: 4.6 Resultados,
V. Discusión de resultados, VI. Conclusiones y recomendaciones. La estadística la
calcula un script. Tú interpretas y redactas.

**Regla absoluta: nunca inventes, completes ni "suavices" datos.** Si no hay datos
reales en `datos/`, detente y dile al usuario qué debe medir, con qué instrumento y en
qué formato, según `tesis.yaml` y el capítulo IV. Los datos sintéticos solo se usan para
probar el script y nunca entran al proyecto.

## Antes de empezar

1. Lee `ESTADO.md` y `tesis.yaml`: indicadores de la VD (`simbolo`, `nombre`, `unidad`,
   `sentido`, `especifico`, `referencia`), hipótesis, `metodologia.ruta_pre_prueba` y
   `meta.modo`. Si `meta.modo` es `plan`, esta fase no corresponde. En el plan solo se
   describe el plan de análisis, que es tarea de `tesis-metodologia`.
2. Lee `../tesis/references/reglas-curso.md` (sección de análisis de datos),
   `../tesis/references/apa7-es.md` (tablas y cifras) y
   `../tesis/references/estilo-ignacio.md` (voz).
3. Lee los antecedentes de `capitulos/02-marco.tex` y las fichas de
   `literatura/fichas/`: la discusión se construye contra ellos.

## Ronda de preguntas de esta fase

Usa el formato del skill `grilling`, con preguntas numeradas y tu recomendación en cada una.
Solo pregunta lo que no puedas averiguar en el proyecto:

```
❓ **Q1** - **Origen de los datos**: ...
➡️ <recomendación>
```

Preguntas típicas:

- De dónde salen los datos y en qué fechas se midieron (O1 y O2), y quién los registró.
- Si pre y post son **la misma unidad** medida dos veces (pareado) o **unidades
  distintas** (independiente), por ejemplo conversaciones del mes anterior frente a
  conversaciones del mes posterior.
- En `solo_post`: cuál es el valor de referencia de cada indicador y de dónde sale
  (meta de la organización, norma o antecedente citado). Sin una fuente citable no hay
  contraste defendible.
- Si el asesor exige capturas de SPSS o acepta tablas propias.
- Si quiere recomendaciones. La estructura oficial no las pide, pero los jurados suelen
  valorarlas.

## Formato de los datos

Guarda en `datos/pre_post.csv` (UTF-8, punto decimal en el CSV). El campo `indicador`
es el `simbolo` de `tesis.yaml`.

| Diseño (`--diseno`) | Cuándo | Columnas |
|---|---|---|
| `pareado` | GE: O1 X O2 con la misma unidad antes y después | `id,indicador,pre,post` |
| `independiente` | O1 y O2 son unidades distintas (históricos frente a nuevos) | `indicador,grupo,valor` con `grupo` = `pre` o `post` |
| `solo_post` | G: X O2, sin pre-prueba (`ruta_pre_prueba: solo_post`) | `indicador,valor` (`id` opcional) |

Con `--diseno auto`, que es el valor por defecto, el script decide así: si
`ruta_pre_prueba` es `solo_post`, usa ese diseño. Si no, lo deduce de las columnas del
CSV. Los valores de referencia para `solo_post` salen del campo `referencia` de cada
indicador o de `--referencia TPR=10`.

## Correr el análisis

```bash
pip install pandas scipy statsmodels matplotlib pyyaml
python ../tesis-resultados/scripts/estadistica.py --proyecto . \
  [--datos datos/pre_post.csv] [--diseno auto] [--referencia SIM=VALOR] \
  [--decimal coma] [--alfa 0.05] [--umbral-normalidad 50]
```

Qué hace el script:

| Paso | Regla | Fuente |
|---|---|---|
| Descriptivos | n, M, Mdn, DE, mínimo, máximo, asimetría, curtosis e IC 95 % por momento | reglas del curso (Sesión X) |
| Normalidad | Shapiro-Wilk si n ≤ 50; Kolmogorov-Smirnov con corrección de Lilliefors si n > 50 | curso, Sesión 08 (umbral 50; algunos textos usan 35, ajustable con `--umbral-normalidad`) |
| Qué se prueba | Pareado: las **diferencias**. Independiente: cada grupo. Solo post: la post-prueba | la prueba pareada asume normalidad de las diferencias, no de cada momento |
| Pareado | Normal → t de Student para muestras relacionadas; no normal → Wilcoxon | Presentación de diseños pre-experimentales |
| Independiente | Ambos normales → Levene, luego t de Student o t de Welch; si no → U de Mann-Whitney | ídem |
| Solo post | Normal → t para una muestra contra la referencia; no normal → Wilcoxon contra la referencia | ídem |
| Hipótesis | Unilateral según `sentido`. `baja`: H0 μpre ≤ μpost, Ha μpre > μpost. `sube`: al revés | curso, Sesión X |
| Efecto | d de Cohen (t) o r = z/√n (no paramétricas), con magnitud | APA 7 exige tamaño de efecto |

Salidas:

- `generado/resultados/descriptivos.tex`, `normalidad.tex`, `contrastacion.tex` (resumen)
  y `contrastacion-<SIM>.tex` (una por indicador). Son tablas APA con booktabs y `\nota{}`.
- `generado/resultados/resumen.json` con todas las cifras, y `resumen.md` con una redacción
  sugerida por indicador.
- `figuras/out/boxplot-<SIM>.pdf` y `medias.pdf` (gris, sans-serif, sin título interno).
- `datos/spss_import.csv` para replicar en SPSS. Los menús están en
  `references/spss.md`.

**Coma decimal.** El valor por defecto es `--decimal coma`, que es lo que exige la RAE y
lo que usa el ejemplo APA del curso: "t(24); p = ,000". Si el asesor pide punto, usa
`--decimal punto` y hazlo igual en todo el documento. En APA, los valores de p van sin
cero inicial (`p = ,032`, `p < ,001`), porque p no puede ser mayor que 1.

Verifica siempre la salida antes de redactar:

- n por indicador igual al declarado en 4.3.
- Sin indicadores faltantes (el script avisa con `AVISO: sin datos`).
- Que el sentido de la hipótesis sea el de `tesis.yaml`.

## Redactar 4.6 Resultados (`capitulos/05-resultados.tex`)

`05`, `06` y `07` traen solo contenido: el `\chapter` y la `\section{Resultados}` los pone
`generado/estructura.tex`. Dentro de `05` usa `\subsection`; en `06` y `07`, `\section`.

El orden sale de la plantilla y de la tesis modelo:

1. Párrafo de apertura: qué se midió, a cuántas unidades, cuándo y con qué instrumento.
2. **Resultados descriptivos**: `\input{generado/resultados/descriptivos.tex}`. Interpreta
   la tabla, no la repitas. Ejemplo: "la media del tiempo de respuesta disminuyó de 11,17
   a 8,18 minutos (−26,8 %)". Interpreta la asimetría si es relevante. Añade el boxplot
   o las medias como figura.
3. **Prueba de normalidad**: `\input{generado/resultados/normalidad.tex}`. Declara el
   criterio con cita, por ejemplo "Como n ≤ 50, se usó Shapiro-Wilk". Interpreta por
   indicador con H0 "los datos siguen una distribución normal".
4. **Contrastación de hipótesis**, **una subsección por hipótesis específica**, en el
   orden de `hipotesis.especificos` y usando el campo `especifico` de cada indicador:
   - Planteamiento: Ha y H0 en palabras, iguales a 3.2.2.
   - Nivel de significancia: α = 0,05.
   - Prueba elegida y por qué (resultado de normalidad).
   - Tabla `contrastacion-<SIM>.tex`.
   - Decisión: "Como p < ,001 < 0,05, se rechaza H0 y se acepta Ha…".
5. **Hipótesis general**: se sostiene si se aceptaron las específicas que la componen.
   Dilo con la cifra ("en 3 de 3 indicadores se rechazó H0") y sin inflar.

Tiempo verbal: **pasado** ("se obtuvo", "se aplicó"). Voz impersonal. Cifras con la
misma cantidad de decimales que la tabla. Toda tabla y figura se menciona en el texto
antes de aparecer (`en la Tabla~\ref{tab:descriptivos}`).

## Redactar V. Discusión de resultados (`capitulos/06-discusion.tex`)

Un bloque por hipótesis específica, en el mismo orden, siguiendo este patrón:

1. **Resultado propio** en una oración, con la cifra y la prueba.
2. **Contraste con los antecedentes de 2.1**, citándolos con `\textcite{}`: si
   **coinciden** o **difieren**, en qué magnitud y en qué contexto (muestra, tecnología,
   sector). Usa las cifras de sus fichas en `literatura/fichas/`, nunca de memoria.
3. **Explicación teórica** con las bases de 2.2: por qué ocurrió.
4. Cuando corresponda, una **limitación** concreta: tamaño de muestra, periodo corto,
   diseño sin grupo control, efecto novedad, sesgo del registro histórico.

Cierra con un párrafo de limitaciones generales del diseño. Si el diseño es
pre-experimental, dilo con honestidad: sin grupo control no se descartan del todo
factores externos. **No afirmes causalidad más fuerte que la que permite el diseño.**
Si un antecedente no es comparable (otra métrica, otro contexto), no lo fuerces.

## Redactar VI. Conclusiones (`capitulos/07-conclusiones.tex`)

- **Una conclusión por objetivo específico**, en el mismo orden, más **una conclusión
  general** que responde al objetivo general. Numeradas o en párrafos, pero sin mezclar
  los dos estilos.
- Cada una lleva la **cifra y la prueba**. Ejemplo: "Se comprobó que la implementación del
  sistema web redujo el tiempo promedio de respuesta de 11,17 a 8,18 minutos (−26,8 %;
  t(29) = 12,05; p < ,001)".
- Verbos del curso: "se comprobó", "se determinó", "existe", "es". Nada de "se espera" ni
  "podría".
- Deben ser **fidedignas**: nada que los datos no muestren y ninguna conclusión sin un
  objetivo que la respalde. Si una hipótesis no se aceptó, la conclusión lo dice.

**Recomendaciones**, si el usuario las quiere: una por conclusión o hallazgo, dirigidas a
alguien concreto (la organización, futuros investigadores, la escuela), factibles y
breves. Por ejemplo: "Se recomienda a la empresa X extender el sistema a…" o "Para futuras
investigaciones se recomienda un diseño cuasi-experimental con grupo control…". Van en
`\section*{Recomendaciones}\addcontentsline{toc}{section}{Recomendaciones}`.

## Autorrevisión antes de mostrar

- [ ] Las cifras del texto coinciden con `resumen.json` (revisa cada una).
- [ ] Cada hipótesis específica tiene su subsección, su tabla y su decisión.
- [ ] La discusión cita solo antecedentes que existen en `bib/referencias.bib` y en 2.1.
- [ ] Hay una conclusión por objetivo y todas tienen cifra.
- [ ] Tablas y figuras con `\nota{}`, mencionadas en el texto y con la etiqueta arriba.
- [ ] Coma o punto decimal consistente en todo el documento.
- [ ] Criterios de la rúbrica 7, 8 y 12 de `../tesis/references/jurado.md`.

Después actualiza `ESTADO.md`: fase completada, diseño usado, indicadores aceptados o
rechazados, pendientes (por ejemplo, "capturas SPSS si el asesor las pide").
