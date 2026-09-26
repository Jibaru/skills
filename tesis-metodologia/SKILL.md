---
name: tesis-metodologia
description: Redacta el Capítulo IV (Metodología) de un plan de tesis o tesis UNTELS de Ingeniería de Sistemas en LaTeX — diseño de investigación (enfoque, tipo, nivel, diseño pre-experimental, método), cómo obtener la pre-prueba, descripción de la metodología de desarrollo del software separada del diseño, población, muestra y muestreo, técnicas e instrumentos, validez por juicio de expertos, confiabilidad, plan de análisis de datos, ética, cronograma y presupuesto. Usar cuando el usuario diga "capítulo 4", "metodología", "diseño de investigación", "pre-experimental", "población y muestra", "tamaño de muestra", "instrumentos", "juicio de expertos", "validez y confiabilidad", "cronograma", "presupuesto", o cuando la skill tesis delegue la fase de metodología.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-metodologia

Esta skill escribe `capitulos/04-metodologia.tex` y llena `metodologia`, `cronograma` y `presupuesto` en `tesis.yaml`. En la rúbrica la metodología pesa 2 de 20 puntos, las etapas de desarrollo 1,5, la población 1, las técnicas e instrumentos 1,5, el plan de análisis 1, el cronograma 1 y el presupuesto 1. Es el capítulo con más puntos en juego.

Lee antes:
- `../tesis/references/reglas-curso.md`, sección Metodología.
- `../tesis/references/estructura.md`, para la numeración 4.x en plan y en tesis.
- `references/diseno.md` de esta skill: fórmulas, tablas de decisión y textos modelo.

## Requisitos

- `variables` e `hipotesis` completas en `tesis.yaml` (salen de `tesis-variables`). Cada indicador debe tener su `instrumento` y su fuente de datos.
- Si es "software primero", conocer el repositorio del sistema.

## Flujo

1. Lee `ESTADO.md` y `tesis.yaml`.
2. **Grilling de la fase.** Formato `❓ Qn` / `➡️`. El orden importa, porque cada decisión depende de la anterior.
   - **Estado del sistema.** ¿El sistema ya está construido? ¿Ya está en uso real? ¿Desde cuándo? ¿Existen registros del proceso antes del sistema? Esta pregunta va primero: de ella depende la ruta de la pre-prueba.
   - **Ruta de la pre-prueba (O1).** Presenta las tres rutas con sus riesgos (ver abajo) y recomienda una. Se guarda en `metodologia.ruta_pre_prueba`.
   - **Unidad de análisis.** Conversación, consulta, cliente o día. Tiene que coincidir con cómo están definidos los indicadores.
   - **Población y muestra.** Qué hay en el periodo, si es finita, qué fórmula aplica, y si el muestreo es probabilístico o censal. Si la población es pequeña (por ejemplo, 30 días o 40 agentes) se recomienda trabajar con la población completa, como censo.
   - **Metodología de desarrollo.** Scrum, XP o RUP. Número de sprints o iteraciones, y la arquitectura y herramientas reales. Si es "software primero", esto sale del repositorio y se confirma con la persona.
   - **Instrumentos.** Ficha de registro, cuestionario o guía. Quiénes serán los 3 expertos validadores (nombre, grado y especialidad los aporta la persona).
   - **Solo en modo plan:** fechas de inicio del cronograma y montos del presupuesto. **Nunca supongas montos.** Pregunta o cotiza. Para los costos de la API de OpenAI y de la WhatsApp Business Platform, consulta sus páginas oficiales de precios con WebFetch en el momento, y anota la fecha de consulta en la *Nota.* de la tabla.
3. Actualiza `tesis.yaml` y ejecuta `generar.py`.
4. Redacta `04-metodologia.tex` (ver secciones).
5. Pide a `tesis-figuras` las figuras de arquitectura, de flujo y el esquema del diseño si hacen falta.
6. **Autorrevisión** con el checklist y los criterios 8 a 14 de la rúbrica.
7. Actualiza `ESTADO.md`, en particular el plan de recolección: qué dato, de dónde sale, cuándo y quién lo recoge.

## Rutas para la pre-prueba (O1)

| Ruta | Cuándo | Diseño | Riesgo ante el jurado |
|---|---|---|---|
| `historicos` | Existen registros del proceso anterior: historial de WhatsApp Business, Excel, cuaderno, reportes | GE: O1 X O2, con O1 retrospectivo | Hay que demostrar que O1 y O2 se miden con la misma definición y fórmula. Se justifica como "análisis documental" de los registros previos |
| `medicion_previa` | El sistema no está en uso todavía, o se puede desactivar o evitar en un periodo | GE: O1 X O2 | Es la más sólida. Hay que registrar O1 manualmente con la misma ficha. Requiere tiempo y autorización de la organización |
| `solo_post` | No hay datos previos ni forma de medirlos | G: X O2 (pre-experimental solo con post-prueba) | Es la más débil. No permite afirmar "reduce" o "mejora" frente a un antes. Las hipótesis deben reformularse a comparar con un valor de referencia (meta, estándar o dato de un antecedente), usando una prueba t de una muestra o Wilcoxon de rango con signo contra una mediana. Avisa a `tesis-variables` |

Si el sistema **existe pero aún no está en uso**, la ruta natural es `medicion_previa`: se mide el proceso actual y luego se pone el sistema en marcha.

## Secciones (modo tesis con hipótesis; en modo plan ver `estructura.md`)

### 4.1 Diseño de investigación

Subsecciones 4.1.1 a 4.1.5: enfoque, tipo, nivel, diseño y método. Cada una lleva su definición parafraseada con cita metodológica (Hernández-Sampieri y Mendoza, 2018; Ramos-Galarza, 2021, etc.) y **por qué aplica a esta tesis**.

Lo estándar es:
- Enfoque cuantitativo.
- Tipo aplicada.
- Nivel explicativo.
- Diseño **pre-experimental con pre-prueba y post-prueba**, esquema `GE: O1 X O2` presentado en tabla APA con su "Donde:". Se trabaja con **un solo grupo**. **Nunca escribas "grupo de control"**: fue un error real del proyecto anterior.
- Método hipotético-deductivo.

### 4.2 Descripción de la metodología

Aquí se **separa** el desarrollo del software de la comprobación de la hipótesis. Esta separación es una observación típica del jurado.

- **4.2.1 Implementación** (en plan: "Etapas del desarrollo"):
  - La metodología de desarrollo y por qué se eligió, con cita.
  - Las fases o sprints, cada uno con objetivo, entregables y duración.
  - La arquitectura (figura: WhatsApp Cloud API → webhook → backend → API de OpenAI → base de datos → panel web).
  - Las herramientas y versiones reales.
  - En modo tesis, además, evidencia por sprint: capturas y fragmentos de código relevantes en `listings`, sin volcar código entero.
- **4.2.2 Pruebas realizadas** (en modo tesis): cómo se midió O1 y O2, en qué periodo, cómo se extrajeron los datos (consulta SQL o script, descritos con palabras y con el código en anexo), y las pruebas funcionales del sistema.

### 4.3 Población y muestra
- Se define la unidad de análisis, la población con sus características (finita o no) y su tamaño.
- La muestra lleva la fórmula en `equation`, el "Donde:", los valores sustituidos (Z = 1,96; e = 0,05; p = q = 0,5 salvo que haya justificación) y el resultado redondeado hacia arriba.
- Se indica el muestreo con su tipo y justificación.
- **Criterios de inclusión y exclusión.** Los de exclusión **no** pueden ser la negación de los de inclusión. "No desear participar" tampoco es un criterio de exclusión.
- Hay que verificar que el n declarado coincida con los datos que realmente se analizarán. En el proyecto anterior se declaró n = 379 y luego se analizaron unos 4600 casos.

### 4.4 Técnicas e instrumentos de recolección de datos

En el plan es una sola sección (4.4). En la tesis se divide: 4.4 Técnicas de
recolección de datos y 4.5 Instrumentos (4.5.1 Validez, 4.5.2 Confiabilidad).

- Tabla técnica → instrumento → indicadores que cubre. Por ejemplo: análisis documental u observación → ficha de registro; encuesta → cuestionario.
- **Validez:** juicio de **3 expertos** que evalúan claridad, pertinencia y relevancia de cada ítem. El formato va en el Anexo 3 y el resultado se resume en una tabla (experto, grado, opinión de aplicabilidad). **No afirmes validez sin evidencia.** En modo plan, se describe el procedimiento que se aplicará.
- **Confiabilidad:**
  - Cuestionario: Alfa de Cronbach > 0,7 sobre una prueba piloto.
  - Ficha de registro con datos extraídos automáticamente del sistema: se justifica por la naturaleza objetiva y automatizada del registro (timestamps) y por la verificación de consistencia de una submuestra (test-retest o doble extracción), con evidencia.

  "El instrumento demuestra su confiabilidad en los estudios mencionados" **no sirve**. Es un error real.

### Plan de análisis de datos (última subsección de 4.4)
La estructura oficial no le da número propio, pero la rúbrica lo evalúa (criterio 12).
Va como subsección final de 4.4 (p. ej. 4.4.3 en el plan, 4.4.2 en la tesis). No crees
una sección 4.5 propia: en la tesis 4.5 es Instrumentos.
- Estadística descriptiva: media, mediana, desviación estándar, mínimo y máximo por indicador, en pre y post.
- Normalidad: **Shapiro-Wilk si n ≤ 50, Kolmogorov-Smirnov (Lilliefors) si n > 50**.
- Contraste: **t de Student para muestras relacionadas** si hay normalidad; **Wilcoxon** si no la hay. α = 0,05, una cola según el `sentido`.
- Software: Python (scipy o pingouin). Opcionalmente SPSS.
- En modo tesis, la sección 4.6 Resultados la escribe `tesis-resultados`.

### Consideraciones éticas
Pueden ir en 4.4 o en un párrafo propio. El sistema procesa conversaciones de WhatsApp, así que hay que cubrir:
- Consentimiento informado de los clientes o usuarios, o aviso de uso de datos.
- Autorización de la organización mediante carta, que va como anexo.
- Anonimización de números telefónicos y nombres.
- Cumplimiento de la **Ley N.° 29733, Ley de Protección de Datos Personales**, y de su reglamento.
- Almacenamiento seguro de los datos.

La rúbrica lo evalúa en los criterios 11 y 15.

### Solo en modo plan: V. Cronograma y VI. Presupuesto
- El cronograma sale de `tesis.yaml` y se genera como Gantt por semanas. Debe cubrir el plan, el desarrollo por sprints, O1, la implementación, O2, el análisis, la redacción y la sustentación, de forma coherente con 4.2.
- El presupuesto sale de `tesis.yaml` y va por rubros (Personal, Bienes, Servicios, Otros) con imprevistos del 10 al 20 % y el total. Lleva una *Nota.* con las fuentes de los precios y la fecha de consulta.

## Checklist antes de mostrar

- [ ] Enfoque, tipo, nivel, diseño y método están declarados, cada uno con cita y justificación, y coinciden con la matriz de consistencia.
- [ ] El diseño tiene un solo grupo, sin "grupo de control", y un esquema coherente con `ruta_pre_prueba`.
- [ ] Las hipótesis se pueden contrastar con el diseño elegido. Con `solo_post`, se reformularon junto con `tesis-variables`.
- [ ] El desarrollo del software (4.2.1) está separado de la medición (4.2.2 y el plan de análisis).
- [ ] La unidad de análisis coincide con los indicadores, y la muestra declarada coincide con la analizada.
- [ ] Los criterios de exclusión no son la negación de los de inclusión.
- [ ] La validez y la confiabilidad tienen procedimiento o evidencia, no solo afirmaciones.
- [ ] El plan de análisis tiene normalidad, prueba y α, más la ética con la Ley 29733.
- [ ] En modo plan, cronograma y presupuesto están completos y sin montos supuestos, con la fecha de los precios.
- [ ] El tiempo verbal es el que corresponde (plan en futuro, tesis en pasado) y el texto está en tercera persona.
