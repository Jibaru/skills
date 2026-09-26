# Exporta la tesis a Word (tesis.docx) con pandoc en Docker. El PDF de LaTeX sigue siendo la
# versión oficial; en el Word hay que revisar a mano carátula, tablas horizontales,
# numeración de páginas e índices.
# Uso: .\exportar-docx.ps1 [-Proyecto C:\ruta\tesis]
param([string]$Proyecto = '.')
$ErrorActionPreference = 'Stop'

$Scripts = $PSScriptRoot
$Assets = Join-Path $Scripts '..\assets'
$Proyecto = (Resolve-Path $Proyecto).Path
$Imagen = if ($env:TESIS_PANDOC_IMAGE) { $env:TESIS_PANDOC_IMAGE } else { 'pandoc/latex:latest' }
$py = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } else { 'python' }

& $py (Join-Path $Scripts 'generar.py') $Proyecto; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $py (Join-Path $Scripts 'exportar_docx.py') $Proyecto; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$docx = Join-Path $Proyecto '_docx'
foreach ($f in 'referencia-untels.docx', 'referencias.lua', 'apa-es.lua') { Copy-Item (Join-Path $Assets $f) $docx -Force }
$csl = Join-Path $docx 'apa.csl'
if (Test-Path (Join-Path $Proyecto 'apa.csl')) { Copy-Item (Join-Path $Proyecto 'apa.csl') $csl -Force }
elseif (Test-Path (Join-Path $Assets 'plantilla\apa.csl')) { Copy-Item (Join-Path $Assets 'plantilla\apa.csl') $csl -Force }
else {
    Write-Host '==> Descargando apa.csl'
    Invoke-WebRequest -UseBasicParsing -OutFile $csl 'https://raw.githubusercontent.com/citation-style-language/styles/master/apa.csl'
}

Write-Host "==> Convirtiendo con $Imagen"
# PowerShell 5.1 convierte las advertencias de pandoc (stderr) en errores; se muestran como texto.
$ErrorActionPreference = 'Continue'
docker run --rm -v "${Proyecto}:/tesis" -w /tesis $Imagen `
    _docx/tesis-pandoc.tex -f latex -o tesis.docx `
    --lua-filter=_docx/referencias.lua `
    --citeproc --bibliography=bib/referencias.bib --csl=_docx/apa.csl `
    --lua-filter=_docx/apa-es.lua `
    --reference-doc=_docx/referencia-untels.docx `
    --resource-path=.:figuras:figuras/out `
    -M lang=es-PE 2>&1 | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$ErrorActionPreference = 'Stop'

Write-Host "==> Listo: $(Join-Path $Proyecto 'tesis.docx')"
Write-Host '    Revisa a mano: carátula, tablas horizontales (operacionalización y matriz),'
Write-Host '    numeración de páginas e índices (en Word: Referencias > Actualizar tabla).'
