param([string]$OutputFile = 'LumaMusic.exe')
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$outputDir = [System.IO.Path]::GetFullPath((Join-Path $projectDir 'dist'))
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$arguments = @('/nologo','/target:winexe','/optimize+','/platform:x64','/utf8output',('/win32manifest:'+(Join-Path $projectDir 'app.manifest')),('/out:' + (Join-Path $outputDir $OutputFile)),'/reference:System.Windows.Forms.dll','/reference:System.Web.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll','/reference:System.Drawing.dll')
$vendorDir = Join-Path $projectDir 'vendor\webview2'
foreach($name in @('Windows.Foundation.winmd','Windows.Media.winmd','Windows.Storage.winmd')){$arguments += '/reference:'+(Join-Path $env:WINDIR ('System32\WinMetadata\'+$name))}
$arguments += '/reference:'+(Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll')
$arguments += '/reference:'+(Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\System.Runtime.InteropServices.WindowsRuntime.dll')
$runtimeFacade=Get-ChildItem (Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Runtime') -Recurse -Filter System.Runtime.dll | Select-Object -First 1 -ExpandProperty FullName
$arguments += '/reference:'+$runtimeFacade
$arguments += '/win32icon:' + (Join-Path $projectDir 'web\luma.ico')
$arguments += '/resource:' + (Join-Path $projectDir 'web\luma.ico') + ',luma.ico'
$arguments += '/resource:' + (Join-Path $projectDir 'web\app-icon.png') + ',app-icon.png'
$arguments += '/resource:'+(Join-Path $projectDir 'web\media-session.js')+',media-session.js'
$arguments += '/resource:'+(Join-Path $projectDir 'web\playback-ui.js')+',playback-ui.js'
$arguments += '/resource:'+(Join-Path $projectDir 'web\playback-core.js')+',playback-core.js'
$arguments += '/resource:'+(Join-Path $projectDir 'web\modal-ui.js')+',modal-ui.js'
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) { $arguments += '/reference:' + (Join-Path $vendorDir $name) }
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')) { $arguments += '/resource:' + (Join-Path $vendorDir $name) + ',runtime.' + $name }
foreach ($name in @('index.html','style.css','glass.css','features.css','discovery.css','services.css','artists.css','artists-core.js','artists.js','core.js','features-core.js','discovery-core.js','services-core.js','i18n.js','app.js','features.js','discovery.js','services.js','icon.svg')) { $arguments += '/resource:' + (Join-Path $projectDir ('web\' + $name)) + ',' + $name }
$arguments += Join-Path $projectDir 'Program.cs'
$arguments += Join-Path $projectDir 'PublicMetadata.cs'
$arguments += Join-Path $projectDir 'PublicSearch.cs'
$arguments += Join-Path $projectDir 'SoundCloudPublic.cs'
$arguments += Join-Path $projectDir 'WebViewBootstrap.cs'
$arguments += Join-Path $projectDir 'MainWindow.cs'
$arguments += Join-Path $projectDir 'DesktopLinks.cs'
$arguments += Join-Path $projectDir 'WindowChrome.cs'
$arguments += Join-Path $projectDir 'GeniusLyrics.cs'
$arguments += Join-Path $projectDir 'PublicArtist.cs'
$arguments += Join-Path $projectDir 'NativeMediaSession.cs'
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Write-Output (Join-Path $outputDir $OutputFile)
