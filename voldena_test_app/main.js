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
    
    // Create Registry Key
    const regCmd = `
        $regPath = 'HKCU:\\Software\\${appName}'
        if (-not (Test-Path $regPath)) {
            New-Item -Path $regPath -Force | Out-Null
            New-ItemProperty -Path $regPath -Name 'DummyData' -Value 'I am a trace!' -PropertyType String -Force | Out-Null
        }
        
        # Create AppData Dummy File
        $appDataDir = Join-Path $env:APPDATA '${appName}'
        if (-not (Test-Path $appDataDir)) {
            New-Item -ItemType Directory -Force -Path $appDataDir | Out-Null
        }
        Set-Content -Path (Join-Path $appDataDir 'trace.log') -Value 'This is a garbage log file left by the test app.'
        
        # Create LocalAppData Dummy File
        $localAppDataDir = Join-Path $env:LOCALAPPDATA '${appName}'
        if (-not (Test-Path $localAppDataDir)) {
            New-Item -ItemType Directory -Force -Path $localAppDataDir | Out-Null
        }
        Set-Content -Path (Join-Path $localAppDataDir 'cache.txt') -Value 'Garbage cache file.'
    `;

    exec(`powershell.exe -Command "& {${regCmd}}"`, (err) => {
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
