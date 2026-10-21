$ErrorActionPreference = "Stop"
$ProjectDirectory = $PSScriptRoot
Push-Location $ProjectDirectory
try {
    python -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --windowed `
        --name StreamDesk `
        --paths (Join-Path $ProjectDirectory "streamdesk") `
        (Join-Path $ProjectDirectory "streamdesk\app.py")
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }
    Write-Output "Executable created at $(Join-Path $ProjectDirectory 'dist\StreamDesk.exe')"
}
finally {
    Pop-Location
}
