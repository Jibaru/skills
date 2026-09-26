---
name: tesis-literatura
description: Revisión de literatura para la tesis UNTELS. Arma preguntas de investigación y la cadena booleana, busca artículos y tesis en fuentes abiertas (OpenAlex, Semantic Scholar, Crossref, ALICIA, La Referencia, y arXiv, CORE, Scopus e IEEE de forma opcional), filtra por título, abstract y texto completo, descarga los PDF de acceso abierto, analiza cada PDF en paralelo con subagentes y genera las fichas, la matriz de revisión y la tabla de distribución de artículos. Úsala cuando el usuario diga "busca papers", "busca antecedentes", "revisión de literatura", "estado del arte", "busca tesis sobre", "descarga los PDFs", "analiza estos papers", "matriz de revisión", "cadena de búsqueda", "ya conseguí el PDF", o cuando tesis-marco necesite antecedentes o bases teóricas.
metadata:
  author: Jibaru
  version: 1.0.0
---

# tesis-literatura

Implementa el flujo de los Talleres 01 y 02 del curso: preguntas → palabras clave → cadena → criterios → embudo → lectura → matriz. Todo queda en `literatura/` del proyecto de tesis. Así la búsqueda se puede reproducir y la tabla de distribución sale de datos reales.

Antes de empezar, lee `tesis.yaml` (variables, dimensiones e indicadores) y las reglas de la fase de literatura en `../tesis/references/reglas-curso.md`.

## Archivos que produce

| Ruta | Qué es |
|---|---|
| `literatura/busquedas.md` | preguntas de investigación, palabras clave, cadenas, criterios y registro de cada búsqueda con sus conteos |
| `literatura/candidatos.csv` | todo lo encontrado, deduplicado, con `filtro_titulo`, `filtro_abstract`, `filtro_texto`, `motivo` |
| `literatura/pdfs/` | PDFs (descargados o puestos a mano) con nombre `AAAA-apellido-slug.pdf` |
| `literatura/PENDIENTES.md` | lo que no tiene versión abierta, con enlaces para conseguirlo |
| `literatura/indice.csv` | PDFs indexados: DOI, páginas, estrategia de lectura, ficha |
| `literatura/texto/` | texto por páginas de los PDFs largos (`=== p N ===`) |
| `literatura/fichas/*.md` | una ficha por documento ([references/ficha.md](references/ficha.md)) |
| `literatura/matriz-revision.csv/.xlsx` | matriz de revisión del Taller 02 |
| `literatura/distribucion.md/.tex` | Tabla "Distribución de artículos" por fuente |

Los scripts están en `scripts/` de esta skill y se ejecutan con `--proyecto <ruta-de-la-tesis>`. Leen las API keys del entorno o de `<proyecto>/.env` (ignorado por git; el entorno tiene prioridad). Ver Paso 0.

## Fuentes y acceso

Solo se usan fuentes legales de metadatos y de acceso abierto. Esta skill **no usa ni enlaza Sci-Hub, LibGen ni ningún espejo de contenido no autorizado**, ni para buscar ni para descargar, aunque el usuario lo pida. La búsqueda no pierde cobertura por eso: OpenAlex y Semantic Scholar indexan lo que está en Scopus, IEEE y WoS, y los detectan por DOI. Lo que no tenga versión abierta va a `PENDIENTES.md`. El usuario lo consigue por su cuenta, lo deja en `literatura/pdfs/` y `indexar.py` lo integra.

| Fuente (`--fuentes`) | Cubre | Requisito |
|---|---|---|
| `openalex` | artículos, conferencias y capítulos de todo el índice; búsqueda booleana en título y abstract | ninguno |
| `s2` | Semantic Scholar (bulk, booleano). Límite de tasa bajo sin clave | `S2_API_KEY` opcional |
| `crossref` | metadatos de editoriales. Sin booleanos: se filtra localmente con la cadena | ninguno |
| `alicia` | ALICIA-CONCYTEC: tesis y artículos peruanos | ninguno |
| `lareferencia` | La Referencia: tesis y artículos latinoamericanos | ninguno |
| `arxiv` | preprints. Limita la tasa con 406, así que no está por defecto | ninguno |
| `core`, `scopus`, `ieee` | búsqueda directa en esas bases | `CORE_API_KEY`, `SCOPUS_API_KEY` (+ `SCOPUS_INSTTOKEN` fuera de la red de la universidad), `IEEE_API_KEY` |

Con `--fuentes auto` (por defecto) se usan las cinco abiertas más `core`, `scopus` e `ieee` cuando su key existe. Las que no tienen key se omiten, y tanto la salida del script como `busquedas.md` dicen qué fuentes se usaron, cuáles fallaron y cuáles se omitieron y por qué.

RENATI (SUNEDU) está detrás de una protección anti-bots y no se puede consultar desde scripts. Las tesis peruanas se cubren con ALICIA, que cosecha los repositorios universitarios, y con La Referencia.

## Paso 0. API keys (una vez por proyecto, y cuando el usuario lo pida)

1. Corre `python scripts/claves.py --proyecto P`. Muestra qué variables están, cuáles faltan, qué fuente activa cada una y, en «Cómo conseguir las que faltan», los pasos y URLs verificadas para cada una. **Muéstrale al usuario esos pasos tal cual**, con las URLs completas, solo de las keys que decida configurar. Nunca imprimas el valor de una key.
2. Si falta alguna, pregúntale al usuario en una ronda (formato ❓/➡️) cuáles quiere configurar. Recomendación por defecto:
   - `TESIS_MAILTO`: **siempre**. Es su correo, sin registro, y sin él no hay Unpaywall.
   - `CORE_API_KEY`, `IEEE_API_KEY` y `S2_API_KEY`: gratis con registro; vale la pena.
   - `SCOPUS_API_KEY`: solo si UNTELS tiene suscripción a Scopus. La key es gratis, pero la API no responde fuera de la red de una institución suscrita sin `SCOPUS_INSTTOKEN`, que se pide a la biblioteca.
   - Deja claro que ninguna es obligatoria: OpenAlex ya indexa lo que está en Scopus e IEEE por DOI.
3. Si quiere configurarlas: `python scripts/claves.py --proyecto P --env` crea `<proyecto>/.env` con las variables vacías y, encima de cada una, los mismos pasos y URLs. **El usuario pega las keys él mismo**; no le pidas que las escriba en el chat. Si igual las pega en el chat, escríbelas en `.env` y no las repitas en ningún otro archivo ni mensaje.
4. Verifica con `python scripts/claves.py --proyecto P --probar`, que hace una consulta mínima con cada key y dice si funciona o si fue rechazada (401/403).
5. Confirma que `.env` está en el `.gitignore` del proyecto antes de seguir.

## Paso 1. Protocolo (con el usuario)

Escribe en `literatura/busquedas.md`, con este formato:

1. **Preguntas de investigación.** Tabla `PI | Descripción | Dimensiones`, de 3 a 5 filas, derivadas de las variables y dimensiones de `tesis.yaml`. Ejemplo: PI-1 "¿Qué efecto tiene un chatbot con IA en WhatsApp sobre el tiempo de respuesta al cliente?".
2. **Palabras clave.** Tabla `Palabra clave | En inglés | Palabras relacionadas`, con los sinónimos que usa la literatura.
3. **Cadena de búsqueda.** Sinónimos con `OR` dentro de paréntesis y conceptos con `AND` entre ellos: `(chatbot OR "conversational agent") AND (whatsapp) AND ("customer service" OR "customer satisfaction")`. Haz una cadena para artículos (en inglés) y otra para tesis (en español).
4. **Criterios de inclusión**, que definen qué entra:
   - Años: desde `año actual − meta.antecedentes_ventana_anios` (5 por defecto) hasta el año actual.
   - Artículos originales en revistas indexadas, o tesis.
   - Idioma inglés o español.
   - Que el trabajo trate la VI o la VD de la tesis.
5. **Criterios de exclusión**, que retiran lo que entró pero no sirve. No deben ser la negación de la inclusión. Por ejemplo: sin metodología descrita, sin resultados medibles, texto completo inaccesible, duplicado, o editorial o carta.

Muestra el protocolo al usuario y ajústalo con él antes de buscar.

## Paso 2. Búsqueda

```bash
python scripts/buscar.py --proyecto P --cadena '<cadena artículos>' --max 50 --etiqueta "Artículos"
python scripts/buscar.py --proyecto P --cadena '<cadena tesis>' --tesis --fuentes alicia,lareferencia,openalex --max 30 --etiqueta "Tesis"
```

Las fuentes se consultan una por una. Si alguna falla, el script sigue con las demás e imprime el error. Al terminar, dile al usuario qué fuentes se usaron y cuáles se omitieron; si una key fue rechazada, sugiere `claves.py --probar`. Cada búsqueda deja en `busquedas.md` su tabla de conteos. Si salen menos de 30 candidatos, amplía los sinónimos. Si salen más de 300, añade un concepto con `AND`.

## Paso 3. Embudo (título → abstract → texto)

```bash
python scripts/embudo.py ver --etapa titulo --proyecto P                  # lista compacta
python scripts/embudo.py marcar --etapa titulo --pasan C0001,C0005 --resto 0 --motivo "fuera del tema" --proyecto P
python scripts/embudo.py ver --etapa abstract --proyecto P                # imprime los abstracts
python scripts/embudo.py marcar --etapa abstract --pasan ... --resto 0 --motivo "..." --proyecto P
```

Decide tú aplicando los criterios, y resume al usuario qué entró y qué salió, con motivos. Apunta a unos 20–30 finalistas tras el abstract. Deben incluir al menos 5 internacionales y 3 nacionales que compartan objetivo y variables con la tesis, porque serán los antecedentes. El resto aporta teoría o indicadores.

## Paso 4. PDFs

```bash
python scripts/descargar.py --seleccionados --proyecto P   # los que pasaron el abstract
python scripts/indexar.py --proyecto P                     # también cuando el usuario suelta PDFs a mano
```

`descargar.py` prueba, en este orden: la URL abierta ya conocida, Unpaywall, OpenAlex, Semantic Scholar, arXiv, CORE y la etiqueta `citation_pdf_url` del repositorio o del editor. Verifica que el archivo sea realmente un PDF.

`indexar.py` hace tres cosas:
- Asocia cada PDF a su DOI y a su candidato, comprobando que el título aparezca en el propio PDF.
- Lo renombra.
- Lo saca de `PENDIENTES.md`.

Si marca `REVISAR`, no pudo identificar el documento. En ese caso, pide al usuario el DOI o el título y corrige `indice.csv`. No inventes metadatos.

Muéstrale al usuario el resumen de `PENDIENTES.md` y las vías legales para conseguir esos PDFs.

## Paso 5. Análisis en paralelo (subagentes)

Lanza **un subagente por PDF** con la herramienta Agent, en lotes de 5 a 8 en un mismo mensaje para que corran a la vez. Mientras trabajan, no leas tú los PDFs. A cada subagente pásale:

- la ruta absoluta del PDF, su `id`, su estrategia (`completa` o `por-secciones`) y sus páginas, según `indice.csv`;
- las variables, dimensiones e indicadores de `tesis.yaml` (cópialos en el prompt);
- la instrucción de leer `references/ficha.md` de esta skill y escribir `literatura/fichas/<nombre-del-pdf>.md` exactamente con ese formato;
- para `por-secciones`: usar `python scripts/extraer.py <pdf> --proyecto P` para ver el índice y `--paginas N-M` para leer cada tramo, sin cargar el PDF entero;
- la prohibición de inventar datos o páginas (si algo no está en el documento: `No reporta`) y la obligación de citar la página impresa;
- que responda solo con 3 líneas: archivo de la ficha, relevancia y si sirve como antecedente.

Cuando terminen, revisa 2 o 3 fichas al azar contra el PDF, sobre todo las citas y las páginas. Luego ejecuta:

```bash
python scripts/indexar.py --proyecto P          # marca qué PDFs ya tienen ficha
python scripts/embudo.py marcar --etapa texto --pasan <ids con ficha útil> --resto 0 --motivo "..." --proyecto P
python scripts/matriz.py --proyecto P           # matriz-revision.csv/.xlsx + avisos de ventana de años
python scripts/embudo.py distribucion --proyecto P
```

## Paso 6. Entrega

- Resume para el usuario: cuántos documentos hay por etapa, los antecedentes elegidos (internacionales y nacionales), los huecos (por ejemplo, "falta un antecedente nacional con pre/post") y los PDFs pendientes.
- Pasa a `tesis-referencias`: `python ../tesis-referencias/scripts/bib.py desde-fichas --proyecto P` crea las entradas del `.bib` y escribe `bibkey` en cada ficha.
- `tesis-marco` redacta los antecedentes a partir de `## Párrafo de antecedente` de cada ficha, reescritos con la voz del usuario (`../tesis/references/estilo-ignacio.md`), y las bases teóricas a partir de `## Citas textuales` y `## Indicadores y fórmulas`.
- `distribucion.tex` va en la tesis donde se describe la revisión de literatura, si el asesor lo pide.

## Reglas

- La matriz y las fichas son la evidencia de la revisión. Si un dato no está en una ficha, no se usa en la tesis.
- Los antecedentes deben estar dentro de la ventana de años. `matriz.py` avisa si alguno queda fuera. Las bases teóricas sí pueden citar clásicos.
- Cita la fuente primaria. Si una tesis cita a Hernández-Sampieri, busca y cita a Hernández-Sampieri, no a la tesis.
- Para reanudar una sesión, lee `busquedas.md`, `candidatos.csv` (con las columnas de filtro) e `indice.csv` para saber en qué paso quedó el trabajo.
