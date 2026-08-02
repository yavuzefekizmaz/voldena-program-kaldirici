const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');

function createWindow() {
    const win = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

function leaveTraces() {
    const appName = "voldena_test_app";
    const installDir = app.getAppPath();
    const escapedInstallDir = installDir.replace(/\\/g, '\\\\');
    
    const regCmd = [
        `$regPath = 'HKCU:\\Software\\${appName}'`,
        `if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null; New-ItemProperty -Path $regPath -Name 'DummyData' -Value 'I am a trace!' -PropertyType String -Force | Out-Null }`,
        
        // Add to Uninstall list so it shows up in Voldena Uninstaller
        `$uninstallRegPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}'`,
        `if (-not (Test-Path $uninstallRegPath)) {`,
        `    New-Item -Path $uninstallRegPath -Force | Out-Null`,
        `    New-ItemProperty -Path $uninstallRegPath -Name 'DisplayName' -Value 'Voldena Test App' -PropertyType String -Force | Out-Null`,
        `    New-ItemProperty -Path $uninstallRegPath -Name 'UninstallString' -Value 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ''Remove-Item -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName} -Force; Remove-Item -Path HKCU:\\Software\\${appName} -Force''' -PropertyType String -Force | Out-Null`,
        `    New-ItemProperty -Path $uninstallRegPath -Name 'DisplayVersion' -Value '1.0.0' -PropertyType String -Force | Out-Null`,
        `    New-ItemProperty -Path $uninstallRegPath -Name 'Publisher' -Value 'Voldena' -PropertyType String -Force | Out-Null`,
        `    New-ItemProperty -Path $uninstallRegPath -Name 'InstallLocation' -Value '${escapedInstallDir}' -PropertyType String -Force | Out-Null`,
        `}`,
        
        `$appDataDir = Join-Path $env:APPDATA '${appName}'`,
        `if (-not (Test-Path $appDataDir)) { New-Item -ItemType Directory -Force -Path $appDataDir | Out-Null }`,
        `Set-Content -Path (Join-Path $appDataDir 'trace.log') -Value 'This is a garbage log file left by the test app.'`,
        `$localAppDataDir = Join-Path $env:LOCALAPPDATA '${appName}'`,
        `if (-not (Test-Path $localAppDataDir)) { New-Item -ItemType Directory -Force -Path $localAppDataDir | Out-Null }`,
        `Set-Content -Path (Join-Path $localAppDataDir 'cache.txt') -Value 'Garbage cache file.'`
    ].join('; ');

    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& {${regCmd}}"`, (err) => {
        if (err) {
            console.error("Traces could not be created:", err);
        } else {
            console.log("Successfully left traces!");
        }
    });
}

app.whenReady().then(() => {
    leaveTraces();
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
