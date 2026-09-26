# Estructuras oficiales

Fuente: formatos del plan de tesis y tesis UNTELS (2023). Las plantillas oficiales
tienen errores de numeración (la tesis salta de IV a VI y pone 4.6.1/4.6.2 bajo 4.5);
aquí van corregidos como en las tesis aprobadas. `main.tex` arma cada una según
`meta.modo` y `meta.con_hipotesis`.

## Plan de tesis con hipótesis (por defecto)

```
CARÁTULA
ÍNDICE · ÍNDICE DE TABLAS · ÍNDICE DE FIGURAS
I.   PLANTEAMIENTO DEL PROBLEMA
     1.1 Descripción del problema        (incluye motivación y estado del arte: la rúbrica los evalúa)
     1.2 Formulación del problema
         1.2.1 Problema general
         1.2.2 Problemas específicos
     1.3 Objetivos de la investigación
         1.3.1 Objetivo general
         1.3.2 Objetivos específicos
     1.4 Delimitación de la investigación
         1.4.1 Delimitación espacial
         1.4.2 Delimitación temporal
     1.5 Justificación del problema      (1.5.1 teórica, 1.5.2 tecnológica, 1.5.3 social, 1.5.4 económica, según corresponda)
II.  MARCO TEÓRICO
     2.1 Antecedentes de la investigación
         2.1.1 Antecedentes internacionales
         2.1.2 Antecedentes nacionales
     2.2 Bases teóricas                  (una subsección por variable / tecnología)
     2.3 Definición de términos básicos
III. VARIABLES E HIPÓTESIS
     3.1 Definición operacional de las variables
     3.2 Hipótesis de la investigación
         3.2.1 Hipótesis general
         3.2.2 Hipótesis específicas
IV.  METODOLOGÍA
     4.1 Diseño de investigación         (tipo, nivel, diseño, enfoque, método)
     4.2 Descripción de la metodología
         4.2.1 Etapas del desarrollo del plan de tesis
     4.3 Población y muestra
     4.4 Técnicas e instrumentos de recolección de datos
V.   CRONOGRAMA DE ACTIVIDADES DE LA TESIS
VI.  PRESUPUESTO DE LA TESIS
VII. REFERENCIAS BIBLIOGRÁFICAS
ANEXOS
     Anexo 1. Matriz de consistencia
     Anexo 2. Instrumentos de recolección de datos
```

2.3 no figura en el formato 2023, pero el curso lo exige y los modelos lo incluyen.

## Plan de tesis sin hipótesis

I y II iguales. III. METODOLOGÍA (3.1 Diseño; 3.2 Descripción; 3.2.1 Etapas del
desarrollo). IV. CRONOGRAMA. V. PRESUPUESTO. VI. REFERENCIAS BIBLIOGRÁFICAS.
ANEXOS: Matriz de consistencia.

## Tesis con hipótesis

```
CARÁTULA
ACTAS
DECLARACIÓN DE AUTENTICIDAD
DEDICATORIA
AGRADECIMIENTOS
RESUMEN (Palabras clave:)
ABSTRACT (Keywords:)
ÍNDICE · ÍNDICE DE TABLAS · ÍNDICE DE FIGURAS
INTRODUCCIÓN
I.   PLANTEAMIENTO DEL PROBLEMA      (igual que el plan)
II.  MARCO TEÓRICO                   (igual que el plan)
III. VARIABLES E HIPÓTESIS           (igual que el plan)
IV.  METODOLOGÍA
     4.1 Diseño de investigación
     4.2 Descripción de la metodología
         4.2.1 Implementación del tema de investigación   (desarrollo del software: sprints/fases, arquitectura, capturas)
         4.2.2 Pruebas realizadas
     4.3 Población y muestra
     4.4 Técnicas de recolección de datos
     4.5 Instrumentos de recolección de datos
         4.5.1 Validez
         4.5.2 Confiabilidad
     4.6 Resultados
V.   DISCUSIÓN DE RESULTADOS
VI.  CONCLUSIONES                    (recomendaciones al final, si se incluyen)
VII. REFERENCIAS BIBLIOGRÁFICAS
ANEXOS
     Anexo 1. Matriz de consistencia
     Anexo 2. Instrumentos de recolección de datos
     Anexo 3. Formato de validación de expertos
     Otros (carta de autorización de la organización, arquitectura, actas de sprint, etc.)
```

## Tesis sin hipótesis

I y II iguales. III. METODOLOGÍA (3.1 Diseño; 3.2 Descripción; 3.2.1 Implementación
de la investigación; 3.2.2 Pruebas realizadas). IV. CONCLUSIONES. V. REFERENCIAS
BIBLIOGRÁFICAS. ANEXOS.

## Del plan a la tesis

Al pasar `meta.modo` de `plan` a `tesis`:

1. Tiempo verbal: futuro → pasado en I–IV ("se aplicará" → "se aplicó").
2. 4.2.1 "Etapas del desarrollo del plan de tesis" → "Implementación del tema de
   investigación" con lo que realmente se hizo; aparece 4.2.2 Pruebas realizadas.
3. Cronograma y presupuesto salen del cuerpo.
4. Aparecen preliminares, introducción, 4.5 validez/confiabilidad con evidencia,
   4.6 Resultados, V Discusión, VI Conclusiones y Anexo 3.
5. Revisar que lo prometido en el plan (diseño, muestra, instrumentos) coincide con
   lo hecho; si cambió, explicarlo.

## Resumen y abstract

- Resumen de hasta 250 palabras, un párrafo: objetivo, metodología (diseño, muestra,
  instrumentos), resultados principales con cifras y conclusión.
- 3 a 5 palabras clave; el abstract es su traducción fiel con keywords.

## Introducción (solo tesis)

Sin número. 1–2 páginas: contexto y problema, objetivo, justificación breve,
metodología en una frase y cómo está organizado el documento (qué contiene cada
capítulo).
