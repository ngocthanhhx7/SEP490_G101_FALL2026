[CmdletBinding()]
param([string]$BaseUrl='http://localhost:3000', [Parameter(Mandatory=$true)][string]$Email, [switch]$CreateSamplePets)
$ErrorActionPreference='Stop'
$uri=[Uri]$BaseUrl
if ($uri.Scheme -notin @('http','https') -or $uri.AbsolutePath -ne '/') { throw 'Use an origin-only BaseUrl' }
$origin=$uri.GetLeftPart([UriPartial]::Authority)
$webSession=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers=@{Origin=$origin}
$challenge=Invoke-RestMethod -Uri ($origin+'/api/v1/otp-challenges') -Method Post -WebSession $webSession -ContentType 'application/json' -Headers $headers -Body (@{channel='EMAIL';contact=$Email;purpose='LOGIN'} | ConvertTo-Json)
$otp=Read-Host 'OTP from your verified email (register the Customer account first)'
$login=Invoke-RestMethod -Uri ($origin+'/api/v1/sessions') -Method Post -WebSession $webSession -ContentType 'application/json' -Headers $headers -Body (@{challengeId=$challenge.data.challengeId;channel='EMAIL';contact=$Email;purpose='LOGIN';code=$otp;rememberDevice=$false} | ConvertTo-Json)
$otp=$null
if (-not $login.data.authenticated) { throw 'Login failed. Register via the website first.' }
$headers['X-CSRF-Token']=$login.data.csrfToken
function Invoke-Ai([string]$Path,[string]$Method='GET',$Body=$null) {
 $parameters=@{Uri=$origin+'/api/v1/'+$Path;Method=$Method;WebSession=$webSession;Headers=$headers}
 if($null -ne $Body){$parameters.ContentType='application/json';$parameters.Body=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12))}
 Invoke-RestMethod @parameters
}
$catalog=Invoke-Ai 'pet-care/catalog'
Write-Output ('Breed catalog: '+$catalog.data.breeds.Count)
$pets=Invoke-Ai 'pet-care/pets'
if ($CreateSamplePets) {
 foreach($sample in @(@{name='Demo - cho Poodle';species='DOG';breedCode='dog-poodle';weightKg=6;traits=@();careNeedsConfirmed=$true},@{name='Demo - meo Anh long ngan';species='CAT';breedCode='cat-british-short';weightKg=4;traits=@();careNeedsConfirmed=$true})) {
  if(-not @($pets.data | Where-Object {$_.name -eq $sample.name}).Count){$null=Invoke-Ai 'pet-care/pets' 'POST' $sample}
 }
 $pets=Invoke-Ai 'pet-care/pets'
}
if (-not $pets.data.Count) { throw 'No owned pets. Run again with -CreateSamplePets or create one via the pet-care API.' }
$pet=$pets.data[0]
$services=Invoke-RestMethod -Uri ($origin+'/api/v1/services') -WebSession $webSession
$service=$services.data.services | Where-Object {$_.code -eq 'home-visit'} | Select-Object -First 1
if(-not $service){throw 'Run service-catalog provisioning first'}
$quote=Invoke-Ai 'pricing/quotes' 'POST' @{serviceId=$service.id;petIds=@($pet._id);durationMinutes=30;visitCount=1}
$quote.data | ConvertTo-Json -Depth 12
Write-Output 'Quote tested. For recommendations, supply a real confirmed address and approved sitter schedules as shown in doc/api/ai-pricing-matching-v1.md.'
$null=Invoke-RestMethod -Uri ($origin+'/api/v1/sessions/current') -Method Delete -WebSession $webSession -Headers $headers
