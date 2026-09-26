---
name: tesis-jurado
description: Revisa el plan de tesis o la tesis UNTELS como lo haría el jurado. Aplica la rúbrica oficial de 15 criterios sobre 20 puntos y la guía de revisión del jurado, audita la coherencia vertical (título → problema → objetivo → variables → indicadores → hipótesis → diseño → instrumento → matriz), corre un chequeo de originalidad tipo Turnitin contra los PDFs de la literatura y un linter de errores de forma, y emite observaciones CRÍTICA/IMPORTANTE/MENOR con la corrección propuesta y un dictamen. Úsala cuando el usuario diga "revisa mi tesis", "revisa el plan", "qué observaría el jurado", "simula al jurado", "cuánto sacaría", "chequeo de plagio", "similitud", "Turnitin", "originalidad", "parafrasea" o "antes de presentar".
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-jurado

Esta skill actúa como el jurado de Plan de Tesis y de Tesis de la Escuela Profesional de
Ingeniería de Sistemas de UNTELS. No corrige estilo por corregir: **prioriza la coherencia
metodológica sobre la redacción**. Todo lo que dice lo apoya en la norma (la cita) o lo
etiqueta como "recomendación metodológica".

Fuente de los criterios: `../tesis/references/jurado.md`, que contiene la rúbrica,
la cadena de coherencia, qué revisa el jurado por sección, los niveles de observación,
los errores comunes y la sustentación. Estructura oficial:
`../tesis/references/estructura.md`. Formato: `../tesis/references/formato-untels.md`.
APA: `../tesis/references/apa7-es.md`.

## Reglas del revisor (no negociables)

- No inventes referencias, DOI, autores, resultados ni conclusiones. Si una referencia no
  se puede verificar, márcala **"REFERENCIA POR VERIFICAR"** y pásala a
  `tesis-referencias`.
- No aceptes el diseño metodológico que declara el texto: evalúalo por lo que realmente se
  hace. Un "cuasi-experimental" con un solo grupo es pre-experimental.
- Separa desarrollar el software (Scrum/RUP) de comprobar la hipótesis. Desarrollar un
  sistema no es, por sí solo, una metodología de investigación.
- No cambies el tema central ni elimines una variable sin explicar la consecuencia
  metodológica.
- No conviertas una recomendación en exigencia de UNTELS si la norma no la establece.
- Si falta información para evaluar una sección, di exactamente qué falta.
- Si un aspecto visual no se puede verificar desde el `.tex` o el texto, escribe "No
  verificable con el contenido disponible" o compila y mira el PDF.

## Procedimiento

### 1. Contexto

Lee `ESTADO.md` y `tesis.yaml`. En `meta.modo`, `plan` se evalúa con la rúbrica del plan
y `tesis` añade resultados, discusión, conclusiones y los criterios de sustentación.
Ubica el PDF compilado más reciente (`main.pdf`). Si no existe o está desactualizado,
compílalo con el script de la skill `tesis`.

### 2. Revisión automática (antes de leer)

```bash
python ../tesis-jurado/scripts/lint.py --proyecto .
python ../tesis-jurado/scripts/originalidad.py --proyecto . [--fuente carpeta_extra/]
python ../tesis-referencias/scripts/bib.py check      # citas ↔ referencias, DOI (si existe)
```

- `lint.py` revisa lo mecánico: título de más de 15 palabras, "et. al.", "&" en citas en
  español, primera persona, tiempo verbal según el modo, antecedentes fuera de la ventana
  de años, tablas y figuras sin `\nota{}` o sin `\ref`, citas sin entrada en el `.bib`,
  referencias no citadas y específicos desalineados en `tesis.yaml`.
- `originalidad.py` compara los capítulos contra `literatura/pdfs/` con n-gramas de 8
  palabras, excluyendo citas entre comillas y la bibliografía, igual que el filtro de
  Turnitin. Genera `revisiones/AAAA-MM-DD-originalidad.md` con el % global, el % por
  fuente y los pasajes coincidentes con su `archivo:línea` y la página del PDF.
  - **Es una cota inferior.** Turnitin también compara contra internet y trabajos
    entregados. Como regla práctica, apunta a menos del 8 % aquí para quedar por debajo
    del 15 % en Turnitin.

### 3. Revisión de fondo

Divide el trabajo en paralelo con subagentes, uno por capítulo o bloque:

1. Título, cap. I (1.1–1.5).
2. Cap. II (antecedentes y bases teóricas).
3. Cap. III (variables, operacionalización, hipótesis).
4. Cap. IV (diseño, etapas, población, técnicas e instrumentos), cronograma y presupuesto.
5. En modo tesis: resultados, discusión y conclusiones.

A cada subagente pásale:

- el `.tex` de su bloque;
- `tesis.yaml`;
- la sección correspondiente de `../tesis/references/jurado.md`;
- la instrucción de devolver observaciones en el formato de abajo y la puntuación de sus
  criterios de la rúbrica.

Luego **consolida tú**: elimina duplicados y verifica cada observación contra el texto.
Las contradicciones *entre* capítulos, como un problema específico 2 que no coincide con
la hipótesis 2 o un indicador de la matriz que no aparece en 3.1, solo se ven al
consolidar. Búscalas explícitamente.

Revisa por sección lo que lista `jurado.md`. Los focos que más se observan en Sistemas
son estos:

- **Coherencia vertical.** Construye la tabla de auditoría completa (Elemento / Debe
  corresponder con / ¿Existe? / ¿Es coherente? / Observación) y la tabla Problema
  específico / Objetivo específico / Hipótesis específica / Indicador / Correspondencia.
- **Problemas y objetivos que son actividades.** "Implementar…" y "¿Cómo implementar…?"
  no son objetivos medibles. Propón la forma medible usando el indicador.
- **Hipótesis.** Deben ser comprobables con el diseño. Si dicen "reduce", "mejora" o
  "incrementa", debe existir O1 y O2, o una referencia, y una prueba estadística.
- **Variables.** No pueden ser herramientas ni productos. Revisa la cadena completa:
  variable → definición conceptual → operacional → dimensión → indicador (con fórmula) →
  escala → instrumento.
- **Diseño y muestra.** Pre-experimental quiere decir un solo grupo. La unidad de análisis
  debe coincidir con lo que se mide. El n declarado en 4.3 debe ser el n que se analiza.
- **Validez y confiabilidad.** Deben estar respaldadas con evidencia: juicio de expertos
  (anexo), prueba piloto o alfa de Cronbach cuando aplique. No sirve decir "es válido
  porque otros lo usaron".
- **Antecedentes.** Tienen que ser de la ventana de años de `tesis.yaml`, al menos 3
  nacionales y 5 internacionales, y cada uno con objetivo, metodología, muestra,
  resultados y **conclusión resaltada**.

### 4. Formato de cada observación

```
OBSERVACIÓN N.° X
Sección: 1.2.1 Problema general
Nivel: CRÍTICA | IMPORTANTE | MENOR
Texto actual: "…" (archivo:línea)
Problema identificado: qué está mal y por qué.
Corrección propuesta: "…" (texto listo para reemplazar)
Justificación metodológica: por qué mejora la coherencia (cita la norma o marca "recomendación metodológica").
```

- **CRÍTICA**: impide la aprobación. Ejemplos: variables incompatibles con el título,
  hipótesis no comprobable, diseño incompatible, problema y objetivo general sin
  correspondencia, población indefinida, instrumento que no mide los indicadores, matriz
  contradictoria, similitud de 15 % o más.
- **IMPORTANTE**: debe corregirse antes de presentar.
- **MENOR**: redacción, formato o APA.

### 5. Puntuación y dictamen

- Puntúa los **15 criterios de la rúbrica** en pasos de 0,5 con una línea de
  justificación cada uno. Total sobre 20 y escala (Deficiente … Sobresaliente).
- Condiciones mínimas: promedio ≥ 14, similitud < 15 %, estructura completa, coherencia y
  ética. Si falla alguna, el plan no se aprueba aunque la nota sea alta.
- **Veredicto académico** (guía del jurado): APTO PARA PRESENTACIÓN / APTO CON
  OBSERVACIONES / REQUIERE REFORMULACIÓN METODOLÓGICA.
- En modo tesis agrega una **simulación de la sustentación** (RCU 009-2024, art. 57): las
  10 preguntas más probables del jurado sobre lo expuesto y lo redactado, con los puntos
  débiles a preparar. No puntúes la exposición oral, porque no es verificable.

### 6. Informe

Guárdalo en `revisiones/AAAA-MM-DD-revision.md` con este orden:

A. Diagnóstico general.
B. Fortalezas.
C. Observaciones críticas.
D. Observaciones importantes.
E. Observaciones menores.
F. Matriz de coherencia.
G. Revisión de variables e hipótesis.
H. Revisión de la metodología.
I. Resultado de originalidad (resumen y enlace al informe).
J. Puntuación por criterio.
K. Lista numerada de cambios obligatorios.
L. Veredicto.

Al usuario muéstrale solo el veredicto, la nota, las críticas y la lista de cambios. El
resto queda en el archivo. Actualiza `ESTADO.md` con la fecha de revisión, la nota
estimada, la similitud y los pendientes.

**No apliques las correcciones sin permiso.** Ofrece aplicarlas, por bloque o todas.
Cuando el usuario acepte, cada corrección la hace la skill de su fase (`tesis-problema`,
`tesis-marco`, …) para que respete las reglas de esa fase y actualice `tesis.yaml`.

## Parafraseo para bajar la similitud

Cuando `originalidad.py` marque pasajes, reescríbelos así:

1. **Entiende la idea** del pasaje original y **reconstrúyela** con la lógica del
   argumento de la tesis: qué aporta a *este* problema, *esta* variable o *este* contexto.
   Cambia la estructura de la oración, el orden de la información y el nivel de detalle.
2. **Integra** la idea con otra fuente o con el contexto propio, por ejemplo "a diferencia
   de lo reportado por…" o "en el caso de la atención por WhatsApp…". Una síntesis de dos
   fuentes casi nunca coincide con ninguna.
3. **Cita siempre**: parafrasear sin cita también es plagio.
4. Si el texto literal es imprescindible (una definición normativa, una cifra oficial), va
   **entre comillas con número de página**. Turnitin lo excluye con el filtro de citas,
   pero úsalo poco.
5. Las definiciones de libro son lo que más se detecta, sobre todo en las bases teóricas y
   la metodología (enfoque, tipo, diseño, población). Para esas, combina dos autores y
   aplica la definición al estudio.

**Antipatrones** (degradan el texto y el jurado los nota):

- Sustituir sinónimos palabra por palabra ("investigación" → "estudio", "sistema web" →
  "plataforma virtual") manteniendo la sintaxis del original.
- Partir palabras o meter espacios para engañar al detector: "con lleva", "entre lazar",
  "En este con texto". Es un error ortográfico visible y además es una conducta
  deshonesta.
- Traducir literalmente un paper en inglés. Turnitin detecta traducciones y la redacción
  queda forzada.
- Cambiar tiempos o personas verbales sin necesidad ("se conduje").

Después de reescribir, vuelve a correr `originalidad.py` y `lint.py`, y confirma que la
cita y el sentido se mantienen.
