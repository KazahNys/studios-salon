# Studio S - génère les PNG de texte avec Edge (déjà installé sur Windows), sans rien d'autre.
#   Generer_les_textes.bat              -> toutes les conférences qui n'ont pas encore leurs PNG
#   Generer_les_textes.bat B11400 L11730 -> refait ces conférences (toujours)
# Sortie : Documents\StudioS\Textes\<CODE>\TITRE.png, SYNTHE_1.png, SYNTHE_2.png ...
param([string[]]$Codes)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$ici = $PSScriptRoot
$sortie = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "StudioS\Textes"
New-Item -ItemType Directory -Force $sortie | Out-Null

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "Edge introuvable."; exit 1 }
# Profil à part : ne touche pas à l'Edge ouvert de l'utilisateur.
$profil = Join-Path $env:TEMP "studios-edge"

$texte = Get-Content (Join-Path $ici "conferences.js") -Raw -Encoding UTF8
$confs = ($texte -replace '^\s*CONFS\s*=\s*', '' -replace ';\s*$', '') | ConvertFrom-Json
if ($Codes) { $confs = $confs | Where-Object { $Codes -contains $_.code } }
else { $confs = $confs | Where-Object { -not (Test-Path (Join-Path $sortie "$($_.code)\TITRE.png")) } }

$page = [Uri]::new((Join-Path $ici "rendu.html")).AbsoluteUri
$brut = Join-Path $env:TEMP "studios-brut.png"

function Cliche([string]$requete, [string]$fichier) {
    if (Test-Path $brut) { Remove-Item $brut }
    # Fenêtre plus haute que 1080 : Edge sans écran rogne le bas de sa fenêtre. On recadre ensuite.
    $arguments = @("--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--user-data-dir=`"$profil`"",
                   "--default-background-color=00000000", "--window-size=1920,1400", "--virtual-time-budget=3000",
                   "--screenshot=`"$brut`"", "`"$page`?$requete`"")
    Start-Process -FilePath $edge -ArgumentList $arguments -Wait -WindowStyle Hidden
    if (-not (Test-Path $brut)) { throw "Edge n'a pas produit d'image pour $requete" }
    $image = [System.Drawing.Bitmap]::FromFile($brut)
    try {
        $coupe = $image.Clone([System.Drawing.Rectangle]::new(0, 0, 1920, 1080), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $coupe.Save($fichier, [System.Drawing.Imaging.ImageFormat]::Png)
        $coupe.Dispose()
    } finally { $image.Dispose() }
}

$n = 0
foreach ($c in $confs) {
    $n++
    $dossier = Join-Path $sortie $c.code
    if (Test-Path $dossier) { Remove-Item (Join-Path $dossier "*.png") }  # un absent ne doit pas garder son synthé
    New-Item -ItemType Directory -Force $dossier | Out-Null
    $code = [Uri]::EscapeDataString($c.code)
    Cliche "code=$code&carton=titre" (Join-Path $dossier "TITRE.png")
    $presents = @($c.intervenants | Where-Object { $_.present -ne $false })
    for ($i = 1; $i -le $presents.Count; $i++) {
        Cliche "code=$code&carton=synthe&n=$i" (Join-Path $dossier "SYNTHE_$i.png")
    }
    Write-Host ("[{0}/{1}] {2} : titre + {3} synthé(s)" -f $n, $confs.Count, $c.code, $presents.Count)
}
# Repère pour le panneau Premiere : la passe est finie.
Set-Content (Join-Path $sortie "derniere-passe.txt") (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Encoding UTF8
Write-Host "Terminé : $($confs.Count) conférence(s) dans $sortie"
