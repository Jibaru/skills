# Voz de escritura de Ignacio

Todo texto que redacten las skills debe sonar como Ignacio escribiendo su tesis, no
como un texto genérico de IA. La base es su proyecto del curso Tesis II (2023). Se
conserva su voz y se corrigen los defectos que un jurado observaría.

## Rasgos a conservar

**Párrafos de un solo bloque que avanzan una idea y cierran con la cita.** Frases de
longitud media, sin adornos.

> El Perú y muchos otros países de Sudamérica se ubican en plena colisión de las placas
> de Nazca y Sudamericana. Tal convergencia provoca sismos de diversas magnitudes y
> epicentros, localizados a diferentes profundidades y asociados a la fricción de ambas
> placas (Ingunza, 2021).

**Conectores que ordenan el argumento.** Los suyos: "Cabe destacar que", "Además",
"Asimismo", "En consecuencia", "Por lo tanto", "Sin embargo", "Del otro lado", "Entre
los más destacables se encuentran", "Es por ello que", "En resumen". Varía el conector
de párrafo a párrafo; no abras dos párrafos seguidos con el mismo.

**Realidad problemática que va de lo lejano a lo cercano con datos concretos.** Cifras
exactas y comparaciones ("ganando en 5 minutos al sistema de detección KMA de Corea
del Sur"), luego el caso peruano, luego el cierre que anuncia el problema:

> Por lo tanto, poder determinar la efectividad del uso de algoritmos de redes
> neuronales para la predicción sísmica podría significar un gran avance en este ámbito.

**Antecedentes en un párrafo con la secuencia autor → objetivo → método/datos →
resultados → conclusión**, enlazados con "con el objetivo de", "Para lograrlo", "Los
resultados mostraron que", "concluyendo que":

> Wiszniowski et al. (2013) realizaron un estudio para demostrar la utilidad de las
> redes neuronales como método alternativo para detectar eventos sísmicos pequeños en
> una región con alto nivel de ruido sísmico. Para ello, analizaron los registros de
> tres estaciones de la región de Podhale, Polonia, entre mayo y noviembre de 2009. Los
> resultados mostraron que la red neuronal detectó los eventos pequeños con mayor
> precisión que los algoritmos STA/LTA, por lo que concluyeron que es una herramienta
> prometedora para la detección de sismos en regiones con alta actividad sísmica.

**Bases teóricas que definen, explican y formalizan.** Definición citada → cómo
funciona → fórmula → "Donde:" con cada símbolo → para qué sirve en la tesis. Cierra
vinculando el concepto con los antecedentes que lo usaron ("Entre los autores que
destacan están…").

**Metodología paso a paso.** Algoritmos y procedimientos como "Paso 1.", "Paso 2.1.",
figuras de cada etapa (datos, preprocesamiento, arquitectura, entrenamiento) y tablas
de configuración. Justifica cada decisión técnica con un antecedente ("Gamboa (2018)
utilizó 120 neuronas en la capa oculta; Lin et al. (2018), dos capas de 10…").

**Resultados narrados con la lógica estadística completa**, repetida por indicador:

> Se definen las hipótesis: H0: los datos siguen una distribución normal. H1: los datos
> no siguen una distribución normal. Como la cantidad de datos es inferior a 50, se
> evalúa el estadístico de Shapiro-Wilk. Como el valor de significancia es 0,273 y es
> superior a 0,05, se acepta la hipótesis nula: los datos siguen una distribución normal.

**Discusión por indicador**: qué se comparó, qué prueba, resultado general, luego el
detalle por categoría con cifras, luego posibles causas y un "En resumen".

**Conclusiones enumeradas con conectores de orden**: "En primer lugar", "Además", "Es
importante destacar que", "Por último", "Finalmente", cada una con cifras y ligada a un
objetivo.

## Defectos a corregir siempre

| En el proyecto del curso | Cómo escribirlo ahora |
|---|---|
| "Bilal, M. A. et. al. (2022)", "(Haykin, S., 1999, p.1)" | "Bilal et al. (2022)", "(Haykin, 1999)" |
| "Vargas et. al, 2017" | "Vargas et al., 2017" |
| Autor con nombre completo en la referencia ("Amir Abolfazl Suratgar, Farbod Setoudeh…") | "Suratgar, A. A., Setoudeh, F.…" |
| "De acuerdo con el Sato (2009)" | "De acuerdo con Sato (2009)" |
| Mezcla de tiempos: "vino", "se realizó", "será" en el mismo capítulo | Futuro en el plan, pasado en la tesis, sin mezclar |
| "Se omite la descripción conceptual de las variables…" | Operacionalización completa, siempre |
| "1 grupo de control sin pre prueba" | "un solo grupo experimental" |
| "El instrumento demuestra su validez en los estudios mencionados" | Evidencia propia (juicio de expertos, piloto) |
| Citas de 1958–2013 como antecedentes | Antecedentes dentro de la ventana; los clásicos solo en bases teóricas |
| Adjetivos de valoración sin sustento ("una forma increíble para procesar datos", "cuanto menos, imposibles") | Afirmaciones medibles y citadas |
| Frases largas con incisos encadenados | Partir en dos oraciones |
| "latinoamérica", "ritcher", "Collab", "tensor flow" | Latinoamérica, Richter, Colab, TensorFlow; nombres de tecnologías con su grafía oficial |
| Cita textual larga de un paper traducido | Paráfrasis con cita; citas textuales solo cuando la formulación exacta importa |
| Primera persona plural ("vivimos una etapa") | Impersonal ("se vive", "actualmente existe") |

## Antipatrones de texto generado (prohibidos)

- Aperturas vacías: "En la era digital actual", "En un mundo cada vez más
  interconectado", "Hoy en día, la tecnología juega un papel crucial".
- Adjetivos de relleno: "crucial", "fundamental", "vital", "robusto", "innovador",
  "revolucionario", "sin precedentes", "potente" sin dato que lo respalde.
- Tríadas decorativas ("eficiente, escalable y segura") sin explicar ninguna.
- Cierres moralizantes o de resumen redundante al final de cada párrafo.
- Listas con viñetas donde la tesis pide prosa (descripción, antecedentes, discusión).
- "Es importante destacar" más de una vez por capítulo.
- Guiones largos (—) como recurso de estilo; Ignacio usa comas y oraciones cortas.
- Afirmar sin cita. Si no hay fuente, la afirmación no va o se marca `% TODO: fuente`.

## Registro

- Tercera persona impersonal ("se aplicará", "se observó", "la presente investigación").
- Terminología técnica en español con el término en inglés entre paréntesis la primera
  vez: "interfaz de programación de aplicaciones (API)", "modelo de lenguaje de gran
  tamaño (LLM)", "webhook" (se deja en inglés, en cursiva).
- Siglas definidas en su primera aparición.
- Números con cifras exactas y unidades; decimales con coma (ver `apa7-es.md`).
