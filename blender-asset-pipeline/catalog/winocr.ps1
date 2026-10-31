# Windows built-in OCR (Windows.Media.Ocr) for one image. Writes a JSON array of lines:
#   [{ "text": "...", "words": [{ "text", "x", "y", "w", "h" }, ...] }, ...]
# Coordinates are in pixels of the input image. Requires an installed en-US OCR language.
param([Parameter(Mandatory)] [string]$ImagePath, [Parameter(Mandatory)] [string]$OutJson)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait() | Out-Null
    $task.Result
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $ImagePath).Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
    if ($null -eq $engine) { throw 'Windows OCR: en-US recognizer is not installed' }
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
} finally {
    $stream.Dispose()
}

$lines = @(foreach ($line in $result.Lines) {
    $words = @(foreach ($w in $line.Words) {
        [pscustomobject]@{ text = $w.Text; x = $w.BoundingRect.X; y = $w.BoundingRect.Y
                           w = $w.BoundingRect.Width; h = $w.BoundingRect.Height }
    })
    [pscustomobject]@{ text = $line.Text; words = $words }
})
ConvertTo-Json -InputObject $lines -Depth 5 | Out-File -FilePath $OutJson -Encoding utf8
