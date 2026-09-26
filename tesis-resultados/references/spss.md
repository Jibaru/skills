# Replicar el análisis en SPSS

Solo si el asesor o el jurado exigen capturas de SPSS. Las cifras deben coincidir con
`generado/resultados/resumen.json`. Si no coinciden, revisa primero que el CSV importado
sea el mismo.

## Importar

1. Archivo > Importar datos > Datos CSV > `datos/spss_import.csv`.
2. En Vista de variables, pon a cada variable su **etiqueta** (nombre del indicador) y la
   **medida** "Escala".

`spss_import.csv` tiene formato ancho en el diseño pareado (`TPR_pre`, `TPR_post`, …) y
formato largo en los demás (`indicador`, `grupo`, `valor`). Para el formato largo:
Datos > Seleccionar casos > Si `indicador = "TPR"` antes de cada análisis.

## Normalidad

- Pareado: primero crea la diferencia con Transformar > Calcular variable,
  `DIF_TPR = TPR_pre - TPR_post`.
- Analizar > Estadísticos descriptivos > Explorar > variable dependiente
  (`DIF_TPR`, o `valor` con factor `grupo`) > Gráficos > marca "Gráficos de normalidad con
  pruebas".
- La tabla "Pruebas de normalidad" trae las columnas Kolmogorov-Smirnov (con corrección de
  Lilliefors) y Shapiro-Wilk. Lee la que corresponda a n (≤ 50: Shapiro-Wilk).

## Contrastes

| Diseño | Paramétrica | No paramétrica |
|---|---|---|
| Pareado | Analizar > Comparar medias > Prueba T para muestras relacionadas (par `TPR_pre`–`TPR_post`) | Analizar > Pruebas no paramétricas > Cuadros de diálogo antiguos > 2 muestras relacionadas > Wilcoxon |
| Independiente | Analizar > Comparar medias > Prueba T para muestras independientes (variable `valor`, agrupación `grupo` con los valores pre/post). Lee la fila según Levene | … > 2 muestras independientes > U de Mann-Whitney |
| Solo post | Analizar > Comparar medias > Prueba T para una muestra, "Valor de prueba" = referencia | … > Prueba binomial / de una muestra: en SPSS 25+ usa Pruebas no paramétricas > Una muestra > Wilcoxon, con la mediana hipotética = referencia |

**Una cola.** SPSS reporta la significación bilateral (versiones antiguas) o las dos
(SPSS 27+, "p de un factor"). Si solo muestra la bilateral y el efecto va en el sentido de
Ha, p unilateral = p bilateral / 2. Así lo calcula el script.

**Tamaño del efecto.** SPSS 27+ lo da en "Tamaños del efecto de muestras…" (d de Cohen).
Para Wilcoxon o Mann-Whitney, calcula r = |Z| / √n a partir del Z de la tabla.

## Capturas

Recorta solo la tabla (clic derecho > Copiar como imagen) y guárdala en
`figuras/out/spss-<SIM>-<prueba>.png`. En la tesis va como **Figura** con
`\nota{Resultado obtenido en IBM SPSS Statistics.}`. Aun así, APA prefiere tablas
propias, así que usa las capturas solo si las exigen.
