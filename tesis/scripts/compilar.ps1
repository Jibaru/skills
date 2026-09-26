# Compila un proyecto de tesis: generar.py + latexmk/biber dentro de Docker (TeX Live).
# Uso: .\compilar.ps1 [-Proyecto C:\ruta\tesis]   (por defecto, el directorio actual)
param([string]$Proyecto = '.')
$ErrorActionPreference = 'Stop'

$Scripts = $PSScriptRoot
$Proyecto = (Resolve-Path $Proyecto).Path
$Imagen = if ($env:TESIS_TEXLIVE_IMAGE) { $env:TESIS_TEXLIVE_IMAGE } else { 'texlive/texlive:latest' }
$py = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } else { 'python' }

Write-Host '==> Generando desde tesis.yaml'
& $py (Join-Path $Scripts 'generar.py') $Proyecto
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker no está instalado. Instálalo o compila en Overleaf (generado/ ya está listo).'; exit 1
}

Write-Host "==> Compilando con $Imagen"
# PowerShell 5.1 convierte el stderr de latexmk en errores: se silencia y se revisa main.log.
$ErrorActionPreference = 'Continue'
docker run --rm -v "${Proyecto}:/tesis" -w /tesis $Imagen `
    latexmk -pdf -interaction=nonstopmode -halt-on-error -file-line-error main.tex 2>&1 | Out-Null
$estado = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$log = Join-Path $Proyecto 'main.log'

if ($estado -ne 0) {
    Write-Host 'ERROR: la compilación falló. Primeros errores de main.log:' -ForegroundColor Red
    if (Test-Path $log) { Select-String -Path $log -Pattern ':\d+: |^! ' -Context 0, 3 | Select-Object -First 10 | ForEach-Object { $_.ToString() } }
    exit $estado
}

$paginas = '?'
$m = Select-String -Path $log -Pattern 'Output written on main.pdf \((\d+) pages' | Select-Object -Last 1
if ($m) { $paginas = $m.Matches[0].Groups[1].Value }
Write-Host "==> Listo: $(Join-Path $Proyecto 'main.pdf') ($paginas páginas)"
Select-String -Path $log -Pattern 'Citation .* undefined|Reference .* undefined|There were undefined' |
    ForEach-Object { $_.Line } | Sort-Object -Unique | Select-Object -First 10
