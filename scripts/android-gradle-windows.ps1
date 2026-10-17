param(
	[Parameter(Mandatory = $true)]
	[string]$Task
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-JavaMajorVersion {
	param([string]$JavaExe)
	$versionOutput = & $env:ComSpec /c "`"$JavaExe`" -version 2>&1"
	$firstLine = ($versionOutput | Select-Object -First 1)
	$firstLine = [string]$firstLine
	if ($firstLine -notmatch '"([^"]+)"') {
		return $null
	}
	$rawVersion = $Matches[1]
	if ($rawVersion -like '1.*') {
		return [int]($rawVersion.Split('.')[1])
	}
	return [int]($rawVersion.Split('.')[0])
}

function Add-Candidate {
	param(
		[System.Collections.Generic.List[string]]$List,
		[string]$Path
	)
	if (-not $Path) { return }
	if (-not (Test-Path $Path)) { return }
	$resolved = (Resolve-Path $Path).Path
	if (-not $List.Contains($resolved)) {
		$null = $List.Add($resolved)
	}
}

$candidates = [System.Collections.Generic.List[string]]::new()

Add-Candidate -List $candidates -Path $env:JAVA_HOME
Add-Candidate -List $candidates -Path 'C:\Program Files\Android\Android Studio\jbr'
Add-Candidate -List $candidates -Path 'C:\Program Files\Android\Android Studio\jre'

foreach ($root in @('C:\Java', 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium')) {
	if (-not (Test-Path $root)) { continue }
	Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
		Where-Object { $_.Name -match 'jdk|temurin|zulu|corretto' } |
		ForEach-Object { Add-Candidate -List $candidates -Path $_.FullName }
}

$compatible = @()
foreach ($jdkHome in $candidates) {
	$javaExe = Join-Path $jdkHome 'bin\java.exe'
	if (-not (Test-Path $javaExe)) { continue }
	$major = Get-JavaMajorVersion -JavaExe $javaExe
	if ($null -eq $major) { continue }
	if ($major -ge 17 -and $major -le 21) {
		$compatible += [pscustomobject]@{
			Home  = $jdkHome
			Major = $major
		}
	}
}

if ($compatible.Count -eq 0) {
	Write-Error 'Kein kompatibles JDK (17-21) gefunden. Für Android/Gradle ist JDK 17-21 nötig. Installiere z. B. Temurin 17 oder 21 und setze JAVA_HOME darauf.'
}

$selected = $compatible | Sort-Object -Property @{ Expression = 'Major'; Descending = $true } | Select-Object -First 1
Write-Output "Using JDK $($selected.Major): $($selected.Home)"

Push-Location (Join-Path $PSScriptRoot '..\android')
try {
	& .\gradlew.bat "-Dorg.gradle.java.home=$($selected.Home)" $Task
	if ($LASTEXITCODE -ne 0) {
		exit $LASTEXITCODE
	}
}
finally {
	Pop-Location
}
