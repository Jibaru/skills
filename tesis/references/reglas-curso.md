# Reglas del curso de tesis por fase

Fuentes: sílabo y sesiones de Tesis I y Tesis II (EPIS UNTELS), guía de elaboración de
tesis V.1, talleres 01 y 02. Donde el curso se contradice se indica la regla adoptada.

## Contradicciones resueltas

| Tema | Fuentes en conflicto | Regla adoptada |
|---|---|---|
| Antigüedad de antecedentes | 5 años (norma, Tesis II) vs 6 (Tesis I) | `meta.antecedentes_ventana_anios` = 5 |
| Número de antecedentes | 8 vs 3 nacionales + 5 internacionales | mínimo 5 internacionales + 3 nacionales |
| Umbral de normalidad | n > 50 K-S (curso) vs 35 (Malhotra) | Shapiro-Wilk si n ≤ 50, Kolmogorov-Smirnov (Lilliefors) si n > 50 |
| Subtítulos en la realidad problemática | "sin subtítulos" vs ejemplo con ámbitos | prosa continua de lo internacional a lo local; subtítulos solo si el usuario lo pide |
| Interlineado | 1,5 (norma) vs doble (APA, tesis aprobadas) | 1,5 (parámetro) |

## 1. Revisión de literatura

**Flujo (talleres 01–02):**

1. Preguntas de investigación: tabla `PI | Descripción | Dimensiones`.
2. Palabras clave: `Palabra clave | En inglés | Palabras relacionadas`.
3. Cadena de búsqueda booleana: sinónimos con `OR` dentro de paréntesis, conceptos con
   `AND`. Búsqueda en inglés (la mayoría de fuentes está en inglés) y en español para
   antecedentes nacionales.
4. Criterios de inclusión (temáticos, temporales, espaciales, tipo de investigación, tipo
   de documento) y de exclusión (retiran lo que entró pero no califica: sin metodología,
   sin marco teórico, sin la información requerida). La exclusión **no** es la negación
   de la inclusión.
5. Embudo: filtro por título → por abstract → por texto completo (0/1 en cada uno).
6. Tabla "Distribución de artículos": `Fuente | Encontrados | Filtrados por título |
   Filtrados por abstract | Filtrados por texto | % por fuente` + fila Total.
7. Matriz de revisión: `N° | AÑO | TÍTULO | AUTOR | REPOSITORIO DE DATOS | ENLACE (DOI) |
   OBJETIVO | METODOLOGÍA | RESULTADOS | CONCLUSIÓN | APORTE A LA TESIS`.

- Usar **artículos originales** de revistas indexadas (no editoriales, cartas ni reseñas).
  Tesis de posgrado aceptables, sobre todo para antecedentes nacionales.
- De cada fuente: autor, año, tipo, método, población/muestra, resultados,
  conclusiones, limitaciones, relación con la tesis.
- Bases citadas en el curso: Scopus, IEEE, ScienceDirect, ACM, Springer, MDPI, SciELO,
  EBSCO, LATINDEX, Google Académico. Impacto de la revista: scimagojr.com.
- La revisión escrita **no es una sucesión de resúmenes**: se organiza por temas o de
  lo general a lo específico.

## 2. Descripción del problema (1.1)

- Hechos no deseados, concretos y objetivos, sustentados en fuentes recientes; cada
  afirmación citada.
- De lo general a lo particular (internacional → nacional → local), tercera persona,
  método deductivo.
- Secuencia: contexto (tema, lugar, tiempo) → situación ideal (antecedentes, teoría)
  → "Sin embargo…" situación real → causas y efectos.
- Cuadro diagnóstico (Méndez Álvarez): **Síntomas → Causas → Pronóstico → Control al
  pronóstico**. El control al pronóstico es la propuesta que cierra la brecha.
- El problema es la brecha entre la situación real y la ideal.
- Integrar la motivación y el estado del arte (criterio 2 de la rúbrica).
- Redacción argumentada, ordenada, objetiva, sin figuras literarias.

## 3. Formulación (1.2)

- Interrogativa, derivada de la descripción, contiene el objeto de estudio y las
  variables del título.
- Patrones para estudios aplicados:
  - "¿En qué medida [VI] [mejora/reduce/incrementa] [VD] en [unidad] de [lugar]?"
  - "¿Cuál es el efecto de [VI] en [VD] de [unidad]?"
- Específicos: uno por dimensión o indicador de la VD. Ejemplo: "¿En qué medida [VI]
  reduce el tiempo promedio de respuesta en [unidad]?". Nunca "¿Cómo implementar…?".
- Sin términos ambiguos o abstractos.

## 4. Objetivos (1.3)

- Verbo en infinitivo. Fórmula: verbo + evento + en quiénes + ámbito + tiempo.
- Correspondencia 1:1: problema general ↔ objetivo general; problema específico n ↔
  objetivo específico n.
- Claros, medibles, alcanzables. Responden a "¿qué se pretende?", no a "¿para qué?".
- Verbos recomendados: analizar, calcular, comprobar, describir, determinar, diseñar,
  establecer, evaluar, examinar, formular, identificar, verificar.
- Nivel explicativo: determinar, probar, demostrar, verificar, evaluar.
- Verbos a evitar: capacitar, conocer, saber, creer, orientar, motivar, cambiar,
  enseñar, hacer. **"Mejorar"** e **"implementar"** como verbo principal de un objetivo
  de investigación son actividades o resultados finales, no objetivos medibles. El
  objetivo mide el efecto: "Determinar en qué medida el sistema web reduce…".

## 5. Delimitación y justificación (1.4–1.5)

- Delimitación espacial (dónde: organización, distrito, ciudad) y temporal (periodo de
  estudio). Opcional: metodológica o de contenido.
- Alcance: precisar hasta dónde llega y qué NO pretende el estudio.
- Justificación: teórica (amplía o contrasta conocimiento), práctica/tecnológica
  (resuelve un problema concreto), metodológica (instrumento o método reutilizable),
  social (a quién beneficia) y económica (ahorro, costo), según corresponda, **con cifras
  citadas**. Cierre típico: "La presente investigación contribuirá a…".

## 6. Marco teórico (II)

**Antecedentes:**

- Un párrafo por antecedente, parafraseado, sin número de página, cita narrativa.
- Mismo objetivo y mismas variables que la tesis.
- Plantilla: Autor (año) + lugar + objetivo + muestra/diseño + instrumentos +
  resultados principales con cifras + conclusión. Para tesis: "en su tesis para optar el
  título de…".
- Mínimo 5 internacionales y 3 nacionales.

**Bases teóricas:**

- Por variable: al menos 3 definiciones de 3 autores distintos, luego características,
  tipos, dimensiones e indicadores con definición citada.
- Estructura X: a, b, c / Y: d, e, f. Incluir elementos legales si aplican.
- Nada de historia irrelevante. No es un glosario: integra con análisis propio.
- Esquemas y figuras permitidos (con nota).

**Definición de términos básicos:** 10 a 20 términos, orden alfabético, cada uno citado.

## 7. Variables e hipótesis (III)

**Hipótesis:**

- Respuesta provisional, afirmativa, verificable. Nivel explicativo → hipótesis causal.
- Componentes: unidad de análisis, variables, conector lógico ("reduce", "incrementa")
  y referencia espacio-temporal.
- Estadísticas: H1 (Ha) y H0 por indicador.

**Variables:**

- Solo en nivel explicativo hay VI (tratamiento) y VD.
- Variable compleja: mínimo 2 dimensiones × 2 indicadores.
- Indicadores fundamentados en el marco teórico y en antecedentes, nunca "sacados de la
  cabeza"; observables y medibles.
- Escalas: nominal, ordinal, de intervalo, de razón (tiempos, conteos y porcentajes son
  de razón).
- Matriz de operacionalización: `Variable | Tipo | Definición conceptual | Definición
  operacional | Dimensiones | Indicadores | Ítems/Fórmula | Escala | Instrumento`.
- KPIs típicos en tesis de sistemas: `Indicador | Índice | Unidad de medida | Unidad de
  observación`. Se miden en pre y post, excepto encuestas de satisfacción si se decide
  lo contrario.

## 8. Metodología (IV)

**Clasificación estándar para Sistemas:**

| Aspecto | Valor |
|---|---|
| Enfoque | Cuantitativo |
| Tipo | Aplicada |
| Nivel | Explicativo |
| Diseño | Experimental, subtipo pre-experimental con pre-prueba y post-prueba |
| Método | Hipotético-deductivo |

Justificar cada uno con cita (Hernández-Sampieri y Mendoza, 2018, es la base del sílabo).

**Diseños:**

| Diseño | Esquema |
|---|---|
| Pre-experimental pre/post | GE: O1 X O2 |
| Pre-experimental solo post | G: X O2 |
| Cuasi-experimental | GE: O1 X O2 / GC: O3 – O4 |
| Experimental puro | RGE: O1 X O2 / RGC: O3 – O4 |

- O1 = medición de la VD antes, X = implementación de la VI, O2 = después.
- **Pre-experimental = un solo grupo, sin grupo control.**

**Población y muestra:**

- Definir población (finita/infinita), unidad de análisis, unidad de muestreo, marco
  muestral, criterios de inclusión y exclusión, tamaño y muestreo.

| Caso | Fórmula |
|---|---|
| Proporción, N conocida | n = N·Z²·p·q / [e²(N−1) + Z²·p·q] |
| Proporción, N desconocida | n = Z²·p·q / e² |
| Media, N conocida | n = N·Z²·S² / [(N−1)e² + Z²·S²] |
| Media, N desconocida | n = Z²·S² / e² |

- Z = 1,96 (95 %), e = 0,05, p = q = 0,5.
- Muestreo probabilístico (aleatorio simple, sistemático, estratificado, conglomerados)
  o no probabilístico (conveniencia, intencional). Con poblaciones pequeñas se usa
  población censal.

**Técnicas e instrumentos:**

| Técnica | Instrumento |
|---|---|
| Observación | Ficha de registro / lista de cotejo |
| Encuesta | Cuestionario |
| Entrevista | Guía de entrevista |
| Análisis documental | Ficha de registro de datos |

- Validez por juicio de 3 expertos: claridad, pertinencia, relevancia.
- Confiabilidad: Alfa de Cronbach > 0,7 para cuestionarios.

**Análisis de datos:**

- Descriptivos: n, media, mediana, DE, mín, máx, asimetría, curtosis, IC 95 %.
- Normalidad de las diferencias pre/post: Shapiro-Wilk (n ≤ 50) o K-S (n > 50). p > 0,05
  → normal → paramétrica.

| Muestras | Paramétrica | No paramétrica |
|---|---|---|
| 2 relacionadas (pre/post) | t de Student para muestras relacionadas | Wilcoxon |
| 2 independientes | t de Student independientes | U de Mann-Whitney |
| 3+ independientes | ANOVA | Kruskal-Wallis |
| Cualitativa relacionada | — | McNemar |

**Contrastación por indicador (α = 0,05, una cola):**

- Indicador que debe bajar: H0: μpre ≤ μpost; Ha: μpre > μpost.
- Indicador que debe subir: H0: μpre ≥ μpost; Ha: μpre < μpost.
- Decisión: "Como p = 0,000 < 0,05, se rechaza H0 y se acepta Ha".
- Reporte APA: t(gl) = x,xx; p < ,001; IC 95 %.

**Producto tecnológico (Tesis II):** factibilidad técnica, operativa y económica;
metodología de desarrollo (Scrum, RUP, XP); arquitectura; demostración de
funcionamiento.

**Cronograma y presupuesto:**

- Presupuesto con tabla `Rubros | Costo parcial | Costo total`, imprevistos del 10–20 %.
  **Nunca suponer montos**: cotizar.
- Cronograma ligado a las etapas.

## 9. Resultados, discusión y conclusiones

- **Resultados:** descriptivos → normalidad → contrastación por hipótesis específica →
  hipótesis general. Cada tabla o figura interpretada en el texto.
- **Discusión:** contrastar cada resultado con los antecedentes (coincide / difiere y
  por qué), limitaciones.
- **Conclusiones:** una por objetivo específico + la general, con cifras; esenciales,
  fidedignas (no afirmar más allá de los datos), coherentes con problemas, hipótesis y
  objetivos. Fórmulas: "Se comprobó que…", "Se determinó que…".
- **Recomendaciones:** originales, factibles, dirigidas a quien decide, precisas.

## Errores comunes que señala el curso

- Revisión de literatura como lista de resúmenes.
- Copiar sin parafrasear; similitud ≥ 15 %.
- Historia irrelevante en bases teóricas.
- Antecedentes que no comparten objetivo y variables.
- Indicadores inventados.
- Verbos finales ("mejorar", "enseñar") en los objetivos.
- Exclusión = negación de la inclusión, o "no desear participar" como exclusión (eso lo
  cubre el consentimiento informado).
- Presupuesto supuesto.
- "Calidad, no cantidad; bien citado y referenciado."
