# Esquema de `tesis.yaml`

`tesis.yaml` es la fuente única de verdad de lo estructural de la tesis. Las skills lo
leen y lo editan; `scripts/generar.py` produce desde él los `.tex` de `generado/`
(carátula, formulación, objetivos, hipótesis, operacionalización, matriz de
consistencia, cronograma y presupuesto). Nunca edites `generado/` a mano.

## Regla de alineación

`problema.especificos[i]`, `objetivos.especificos[i]` e `hipotesis.especificos[i]`
son la misma fila de la matriz de consistencia. Deben tener la misma longitud.
`generar.py` falla si no la tienen. Si `meta.con_hipotesis` es `false`, `hipotesis`
se omite.

## Esquema completo

```yaml
meta:
  modo: plan                 # plan | tesis  (cambia \modoplan / \modotesis y los tiempos verbales)
  con_hipotesis: true
  titulo: "TÍTULO EN MAYÚSCULAS"   # máximo 15 palabras sin contar artículos, preposiciones ni conectores
  autores:                   # máximo 2
    - apellidos: "Rueda Boada"
      nombres: "Ignacio Raúl"
      orcid: ""
      dni: ""
  asesor:
    grado: "Mg."             # Mg. | Dr. | Ing.
    apellidos: ""
    nombres: ""
    orcid: ""
  universidad: "UNIVERSIDAD NACIONAL TECNOLÓGICA DE LIMA SUR"
  facultad: "FACULTAD DE INGENIERÍA Y GESTIÓN"
  escuela: "ESCUELA PROFESIONAL DE INGENIERÍA DE SISTEMAS"
  carrera: "INGENIERÍA DE SISTEMAS"
  titulo_profesional: "INGENIERO DE SISTEMAS"
  ciudad: "Villa El Salvador"
  anio: 2026
  caratula: facultad         # facultad (formato FIG, por defecto) | reglamento (Anexo 03 RCU 009-2024, con ORCID)
  antecedentes_ventana_anios: 5
  interlineado: 1.5          # 1.5 (norma UNTELS) | 2 (APA puro)
  alineacion: justificado    # justificado | izquierda
  palabras_clave: []         # para resumen
  keywords: []               # para abstract

delimitacion:
  espacial: ""
  temporal: ""

problema:
  general: "¿...?"
  especificos:
    - "¿...?"

objetivos:
  general: "Determinar ..."          # verbo en infinitivo
  especificos:
    - "..."

hipotesis:
  general: "..."                     # afirmativa, verificable con el diseño
  especificos:
    - "..."

variables:
  independiente:
    nombre: "Sistema web ..."
    tipo: "Cualitativa"               # según su naturaleza
    definicion_conceptual: "... (Autor, año)."
    definicion_operacional: "..."
    dimensiones: []                   # la VI (tratamiento) puede no tener dimensiones medibles
  dependiente:
    nombre: "..."
    tipo: "Cuantitativa"
    definicion_conceptual: "..."
    definicion_operacional: "..."
    dimensiones:
      - nombre: "..."
        definicion: "... (Autor, año)."
        indicadores:
          - nombre: "Tiempo promedio de respuesta"
            simbolo: "TPR"
            formula: "TPR = \\frac{\\sum t_i}{n}"   # LaTeX matemático
            unidad: "minutos"
            escala: "De razón"                      # Nominal | Ordinal | De intervalo | De razón
            instrumento: "Ficha de registro"
            sentido: baja                            # baja | sube  (define H0/Ha de la contrastación)
            especifico: 1                            # índice (1-based) del problema/objetivo/hipótesis específico que mide

metodologia:
  enfoque: "Cuantitativo"
  tipo: "Aplicada"
  nivel: "Explicativo"
  diseno: "Pre-experimental con pre-prueba y post-prueba"
  esquema: "GE: O1 X O2"
  metodo: "Deductivo"
  metodologia_desarrollo: "Scrum"     # del software, separado del diseño de investigación
  unidad_analisis: "..."
  poblacion: "..."
  muestra: "..."
  muestreo: "..."
  criterios_inclusion: []
  criterios_exclusion: []
  tecnicas: ["Observación"]
  instrumentos: ["Ficha de registro"]
  ruta_pre_prueba: historicos          # historicos | medicion_previa | solo_post (ver tesis-metodologia)

cronograma:                            # semanas relativas al inicio
  - actividad: "..."
    inicio: 1
    fin: 4

presupuesto:
  moneda: "S/"
  imprevistos_pct: 10
  items:
    - rubro: "Bienes"                  # Personal | Bienes | Servicios | Otros
      descripcion: "..."
      cantidad: 1
      costo_unitario: 0.0
```

## Qué genera `generar.py`

| Archivo en `generado/` | Contenido |
|---|---|
| `meta.tex` | macros `\TituloTesis`, `\Autores`, `\Asesor`, `\Anio`, flags `\ifconhipotesis` |
| `caratula.tex` | carátula según `meta.caratula` y `meta.modo` |
| `formulacion.tex` | 1.2.1 Problema general, 1.2.2 Problemas específicos |
| `objetivos.tex` | 1.3.1 Objetivo general, 1.3.2 Objetivos específicos |
| `hipotesis.tex` | 3.2.1 Hipótesis general, 3.2.2 Hipótesis específicas |
| `operacionalizacion.tex` | Tabla APA de operacionalización (longtable, horizontal si hace falta) |
| `matriz-consistencia.tex` | Anexo 1, en página horizontal |
| `cronograma.tex` | Tabla tipo Gantt por semanas (solo en modo plan) |
| `presupuesto.tex` | Tabla por rubros con subtotales, imprevistos y total (solo en modo plan) |
| `estructura.tex` | Orden y títulos de capítulos según `meta.modo` y `meta.con_hipotesis`; incluye `capitulos/*.tex` |
| `instrumentos.tex` | Anexo 2: una ficha de registro por indicador |
| `validacion-expertos.tex` | Anexo 3: formato de validación por juicio de expertos |

Los `\chapter` los pone `estructura.tex`. `capitulos/01`–`04` traen sus `\section`;
`00-introduccion`, `05-resultados`, `06-discusion` y `07-conclusiones` traen solo
contenido (sin título de capítulo ni la sección 4.6).
