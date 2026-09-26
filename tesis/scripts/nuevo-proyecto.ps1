# Crea un proyecto de tesis nuevo a partir de la plantilla UNTELS.
# Uso: .\nuevo-proyecto.ps1 -Destino C:\ruta\tesis
param([Parameter(Mandatory = $true)][string]$Destino)
$ErrorActionPreference = 'Stop'

$Scripts = $PSScriptRoot
$Assets = Join-Path $Scripts '..\assets'

if ((Test-Path $Destino) -and (Get-ChildItem -Force $Destino | Select-Object -First 1)) {
    Write-Error "$Destino ya existe y no está vacío."; exit 1
}
New-Item -ItemType Directory -Force $Destino | Out-Null
Copy-Item -Recurse -Force (Join-Path $Assets 'plantilla\*') $Destino
Copy-Item (Join-Path $Assets 'plantilla.gitignore') (Join-Path $Destino '.gitignore')

foreach ($d in 'figuras\src', 'figuras\out', 'literatura\pdfs', 'literatura\fichas', 'datos', 'anexos', 'generado\resultados') {
    $ruta = Join-Path $Destino $d
    New-Item -ItemType Directory -Force $ruta | Out-Null
    if (-not (Get-ChildItem -Force $ruta | Select-Object -First 1)) { New-Item -ItemType File (Join-Path $ruta '.gitkeep') | Out-Null }
}

$py = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } else { 'python' }
& $py (Join-Path $Scripts 'generar.py') $Destino
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Proyecto creado en $Destino"
Write-Host "    1. Edita tesis.yaml (datos reales; todo lo marcado EJEMPLO se reemplaza)."
Write-Host "    2. Compila: $Scripts\compilar.ps1 -Proyecto `"$Destino`""
Write-Host "    3. Versiona en un repositorio PRIVADO: cd `"$Destino`"; git init"
