$dest = "D:\backups\akeru"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "D:\data\docs\project\akeru\config\chars.db" "$dest\chars-$(Get-Date -Format yyyy-MM-dd-HHmm).db"
Write-Host "Backup saved to $dest"
