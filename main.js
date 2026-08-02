const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// --- YÖNETİCİ İZNİ KONTROLÜ ---
function isAdmin() {
    try {
        execSync('fsutil dirty query %systemdrive%', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

if (!app.isPackaged && !isAdmin()) {
    // Argümanları tek tırnak içine alıyoruz. Ayrıca -WorkingDirectory ekliyoruz çünkü Yönetici olarak başlayınca varsayılan dizin System32 oluyor!
    const args = process.argv.slice(1).map(a => a).join(' ');
    const psCommand = `Start-Process -FilePath '${process.execPath}' -ArgumentList '${args}' -WorkingDirectory '${process.cwd()}' -Verb RunAs`;
    try {
        execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`);
    } catch (e) {
        console.error("Yönetici izni reddedildi veya hata oluştu:", e);
    }
    app.quit();
    process.exit(0);
}
// ------------------------------

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 750,
        icon: path.join(__dirname, 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0d1117',
            symbolColor: '#ffffff'
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function getTempFilePath(ext) {
    const rand = crypto.randomBytes(8).toString('hex');
    return path.join(os.tmpdir(), `voldena_uninstaller_${rand}.${ext}`);
}

// IPC Handler: Get Installed Applications
ipcMain.handle('app:getInstalledApps', async () => {
    return new Promise((resolve) => {
        const scriptPath = getTempFilePath('ps1');
        const jsonPath = getTempFilePath('json');
        
        const psScript = `
$paths = @(
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)
$apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and $_.UninstallString } |
        Select-Object DisplayName, DisplayVersion, Publisher, UninstallString, QuietUninstallString, InstallLocation, InstallDate, DisplayIcon |
        Sort-Object DisplayName -Unique

$apps | ConvertTo-Json -Depth 2 -Compress | Out-File -FilePath "${jsonPath}" -Encoding UTF8
`;
        fs.writeFileSync(scriptPath, psScript, 'utf8');

        exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`, (error) => {
            if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
            
            if (error) {
                resolve({ success: false, error: error.message });
                return;
            }

            try {
                if (fs.existsSync(jsonPath)) {
                    let data = fs.readFileSync(jsonPath, 'utf8');
                    fs.unlinkSync(jsonPath);
                    
                    data = data.replace(/^\\uFEFF/, '').trim();
                    const apps = JSON.parse(data);
                    
                    const filteredApps = apps.filter(app => 
                        app.DisplayName && 
                        !app.DisplayName.includes('KB') && 
                        !app.DisplayName.startsWith('Update for')
                    ).map((app, index) => ({
                        id: `app_${index}`,
                        name: app.DisplayName,
                        version: app.DisplayVersion || '',
                        publisher: app.Publisher || 'Bilinmiyor',
                        uninstallString: app.UninstallString,
                        quietUninstallString: app.QuietUninstallString || null,
                        installLocation: app.InstallLocation || '',
                        displayIcon: app.DisplayIcon || null
                    }));

                    resolve({ success: true, apps: filteredApps });
                } else {
                    resolve({ success: false, error: 'JSON dosyası bulunamadı.' });
                }
            } catch (err) {
                resolve({ success: false, error: 'JSON ayrıştırma hatası: ' + err.message });
            }
        });
    });
});



// IPC Handler: Select an application (Manual Mode)
ipcMain.handle('dialog:selectApp', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['exe'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath, '.exe');
        const fileDir = path.dirname(filePath);
        return { id: 'manual', name: fileName, filePath, fileDir, isManual: true };
    }
    return null;
});

// IPC Handler: Uninstall Multiple Apps
ipcMain.handle('app:uninstallMultiple', async (event, data) => {
    const { apps, options } = data;
    
    return new Promise((resolve) => {
        const scriptPath = getTempFilePath('ps1');
        const logPath = getTempFilePath('log');
        
        let psScript = `
$LogPath = "${logPath}"
function Write-Log {
    param([string]$Message)
    $Line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Add-Content -Path $LogPath -Value $Line
}
Write-Log "Toplu Kaldırma İşlemi Başlatıldı."

`;

        apps.forEach(app => {
            psScript += `Write-Log "====================================="\n`;
            psScript += `Write-Log "İşlem yapılıyor: ${app.name}"\n`;
            
            if (app.isManual) {
                if (options.runUninstallExe) {
                    const uninsPath1 = path.join(app.fileDir, 'unins000.exe');
                    const uninsPath2 = path.join(app.fileDir, 'uninstall.exe');
                    psScript += `
$uninsPath1 = "${uninsPath1}"
$uninsPath2 = "${uninsPath2}"
if (Test-Path $uninsPath1) {
    Write-Log "Manuel Kaldırıcı bulundu: $uninsPath1"
    Start-Process -FilePath $uninsPath1 -Wait -NoNewWindow
} elseif (Test-Path $uninsPath2) {
    Write-Log "Manuel Kaldırıcı bulundu: $uninsPath2"
    Start-Process -FilePath $uninsPath2 -Wait -NoNewWindow
} else {
    Write-Log "UYARI: Klasörde kaldırma aracı bulunamadı."
}
`;
                }
            } else {
                if (options.runUninstallExe) {
                    let cmd = app.quietUninstallString || app.uninstallString;
                    if (cmd) {
                        cmd = cmd.replace(/\\/g, '\\\\');
                        psScript += `
Write-Log "Kaldırma komutu çalıştırılıyor..."
try {
    $uninstallCmd = '${cmd}'
    Write-Log "Komut: $uninstallCmd"
    cmd.exe /c $uninstallCmd
    Start-Sleep -Seconds 2
} catch {
    Write-Log "HATA: Kaldırma komutu çalıştırılamadı."
}
`;
                    }
                }
            }

            if (options.deleteRegistry) {
                psScript += `
$regPath = "HKCU:\\Software\\${app.name}"
if (Test-Path $regPath) { 
    Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log "Regedit temizlendi: $regPath"
}
`;
            }

            if (options.deleteLeftovers) {
                let dirToDelete = app.isManual ? app.fileDir : app.installLocation;
                
                psScript += `
$appName = "${app.name}"
$appNameNoSpace = $appName -replace '\\s',''
$pathsToClean = @(
    "$env:APPDATA\\$appName",
    "$env:LOCALAPPDATA\\$appName",
    "$env:LOCALAPPDATA\\Programs\\$appName",
    "$env:LOCALAPPDATA\\$appName-updater",
    "$env:LOCALAPPDATA\\$appNameNoSpace-updater",
    "$env:USERPROFILE\\Desktop\\*$appName*.lnk",
    "$env:USERPROFILE\\OneDrive*\\Masaüstü\\*$appName*.lnk",
    "$env:USERPROFILE\\OneDrive*\\Desktop\\*$appName*.lnk",
    "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\*$appName*.lnk",
    "$env:APPDATA\\Microsoft\\Windows\\Recent\\*$appName*.lnk",
    "$env:WINDIR\\Prefetch\\*$appName*.pf",
    "$env:WINDIR\\Prefetch\\*$appNameNoSpace*.pf"
)
if ("${dirToDelete}" -ne "") { $pathsToClean += "${dirToDelete}" }

foreach ($p in $pathsToClean) {
    if (Test-Path $p) {
        Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "Kalıntı temizlendi: $p"
    } else {
        # Bazen Test-Path wildcard ile sorun yapabilir, doğrudan silmeyi deneyelim
        Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue
    }
}
`;
            }
            psScript += `Write-Log "${app.name} işlemi tamamlandı."\n\n`;
        });

        psScript += `Write-Log "BİTTİ"`;
        
        fs.writeFileSync(scriptPath, psScript, 'utf8');
        fs.writeFileSync(logPath, 'İşlem başlatılıyor...\n', 'utf8');

        // Uygulama zaten Yönetici olduğu için Start-Process'e gerek yok, exec yeterli!
        // Bu sayede PowerShell ekranı tamamen gizli (WindowStyle Hidden) olarak arka planda çalışır.
        exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`, (error) => {
            let logs = [];
            if (fs.existsSync(logPath)) {
                logs = fs.readFileSync(logPath, 'utf8').split('\\n').filter(l => l.trim() !== '');
                fs.unlinkSync(logPath);
            }
            if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

            if (error) {
                resolve({ success: false, log: logs, error: error.message });
            } else {
                resolve({ success: true, log: logs });
            }
        });
    });
});
