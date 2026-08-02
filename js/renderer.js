let currentAppInfo = null; // for manual mode
let allApps = [];
let selectedApps = new Set();
let currentMode = 'detailed';

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// List Mode Elements
const appListBody = document.getElementById('app-list-body');
const searchInput = document.getElementById('search-input');
const btnRefresh = document.getElementById('btn-refresh');
const chkSelectAll = document.getElementById('chk-select-all');
const selectedCountEl = document.getElementById('selected-count');

// Manual Mode Elements
const btnSelectApp = document.getElementById('btn-select-app');
const appNameEl = document.getElementById('app-name');
const appPathEl = document.getElementById('app-path');
const appIconEl = document.getElementById('app-icon');

// Shared Elements
const modesContainer = document.getElementById('modes-container');
const detailsContainer = document.getElementById('details-container');
const modeCards = document.querySelectorAll('.mode-card');
const btnAction = document.getElementById('btn-action');

const chkRunUninstall = document.getElementById('chk-run-uninstall');
const chkRegedit = document.getElementById('chk-regedit');
const chkLeftovers = document.getElementById('chk-leftovers');

const logContainer = document.getElementById('log-container');
const logList = document.getElementById('log-list');
const btnClearLog = document.getElementById('btn-clear-log');

const modalSuccess = document.getElementById('modal-success');
const btnCloseSuccess = document.getElementById('btn-close-success');
const chkAutoStart = document.getElementById('chk-autostart');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadApps();
    
    // Initialize autostart checkbox
    window.api.getAutoStart().then(enabled => {
        chkAutoStart.checked = enabled;
    }).catch(() => {});
    
    chkAutoStart.addEventListener('change', async (e) => {
        try {
            await window.api.toggleAutoStart(e.target.checked);
        } catch(err) {}
    });
});

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btnAction.classList.contains('disabled') && btnAction.textContent.includes('İŞLEM')) return; // block during uninstall
        
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        
        updateActionState();
    });
});

// Load Apps
async function loadApps() {
    appListBody.innerHTML = `<tr><td colspan="4" class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Uygulamalar yükleniyor, lütfen bekleyin...</td></tr>`;
    btnRefresh.disabled = true;
    
    try {
        const result = await window.api.getInstalledApps();
        if (result.success) {
            allApps = result.apps;
            
            // Kullanıcının kararı: Listeyi anında yükle (0 saniye bekleme).
            renderApps(allApps);
        } else {
            appListBody.innerHTML = `<tr><td colspan="4" class="loading-text" style="color:var(--danger)">Uygulamalar yüklenirken hata oluştu: ${result.error}</td></tr>`;
        }
    } catch (err) {
        appListBody.innerHTML = `<tr><td colspan="4" class="loading-text" style="color:var(--danger)">Hata: ${err.message}</td></tr>`;
    }
    
    btnRefresh.disabled = false;
}

btnRefresh.addEventListener('click', () => {
    selectedApps.clear();
    chkSelectAll.checked = false;
    loadApps();
});

// Render Apps
function renderApps(apps) {
    appListBody.innerHTML = '';
    
    if (apps.length === 0) {
        appListBody.innerHTML = `<tr><td colspan="4" class="loading-text">Uygulama bulunamadı.</td></tr>`;
        return;
    }

    apps.forEach(app => {
        const tr = document.createElement('tr');
        if (selectedApps.has(app.id)) tr.classList.add('selected');
        
        tr.innerHTML = `
            <td>
                <label class="checkbox-container small">
                    <input type="checkbox" class="app-checkbox" data-id="${app.id}" ${selectedApps.has(app.id) ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
            <td>
                <div class="app-name-cell">
                    <strong>${app.name}</strong>
                </div>
            </td>
            <td style="color:var(--text-muted)">${app.publisher}</td>
            <td style="color:var(--text-muted)">${app.version}</td>
        `;

        // Row click to toggle checkbox
        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL' && e.target.tagName !== 'SPAN') {
                const cb = tr.querySelector('.app-checkbox');
                cb.checked = !cb.checked;
                handleAppSelection(app.id, cb.checked);
            }
        });

        // Checkbox change
        const checkbox = tr.querySelector('.app-checkbox');
        checkbox.addEventListener('change', (e) => {
            handleAppSelection(app.id, e.target.checked);
        });

        appListBody.appendChild(tr);
    });
    
    updateActionState();
}



function handleAppSelection(id, isSelected) {
    if (isSelected) {
        selectedApps.add(id);
    } else {
        selectedApps.delete(id);
    }
    
    const tr = document.querySelector(`input[data-id="${id}"]`)?.closest('tr');
    if (tr) {
        if (isSelected) tr.classList.add('selected');
        else tr.classList.remove('selected');
    }
    
    selectedCountEl.textContent = selectedApps.size;
    chkSelectAll.checked = (selectedApps.size === allApps.length && allApps.length > 0);
    
    updateActionState();
}

// Search
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allApps.filter(a => 
        a.name.toLowerCase().includes(term) || 
        a.publisher.toLowerCase().includes(term)
    );
    renderApps(filtered);
});

// Select All
chkSelectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    
    // Sadece şu an görünenleri seç/kaldır
    const visibleCheckboxes = document.querySelectorAll('.app-checkbox');
    visibleCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        const id = cb.getAttribute('data-id');
        if (isChecked) {
            selectedApps.add(id);
            cb.closest('tr').classList.add('selected');
        } else {
            selectedApps.delete(id);
            cb.closest('tr').classList.remove('selected');
        }
    });
    
    selectedCountEl.textContent = selectedApps.size;
    updateActionState();
});

// Manual Mode: Select App
btnSelectApp.addEventListener('click', async () => {
    const appInfo = await window.api.selectApp();
    if (appInfo) {
        currentAppInfo = appInfo;
        appNameEl.textContent = appInfo.name;
        appPathEl.textContent = appInfo.filePath;
        
        appIconEl.classList.remove('fa-file-code');
        appIconEl.classList.add('fa-box-open');
        appIconEl.style.color = 'var(--accent-1)';

        updateActionState();
    }
});

// Mode Selection Logic
modeCards.forEach(card => {
    card.addEventListener('click', () => {
        if (modesContainer.classList.contains('disabled')) return;

        modeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentMode = card.getAttribute('data-mode');

        updateCheckboxesByMode(currentMode);
    });
});

function updateCheckboxesByMode(mode) {
    if (mode === 'basic') {
        chkRunUninstall.checked = true;
        chkRegedit.checked = false;
        chkLeftovers.checked = false;
        chkRegedit.classList.remove('danger-check');
        chkLeftovers.classList.remove('danger-check');
        
        btnAction.classList.remove('danger-mode');
        btnAction.textContent = "BASİT TEMİZLİĞİ BAŞLAT";
    } else if (mode === 'detailed') {
        chkRunUninstall.checked = true;
        chkRegedit.checked = true;
        chkLeftovers.checked = false;
        
        chkRegedit.classList.remove('danger-check');
        chkLeftovers.classList.remove('danger-check');
        
        btnAction.classList.remove('danger-mode');
        btnAction.textContent = "DETAYLI TEMİZLİĞİ BAŞLAT";
    } else if (mode === 'annihilation') {
        chkRunUninstall.checked = true;
        chkRegedit.checked = true;
        chkLeftovers.checked = true;
        
        chkRegedit.classList.add('danger-check');
        chkLeftovers.classList.add('danger-check');
        
        btnAction.classList.add('danger-mode');
        btnAction.textContent = "TAMAMEN YOK ET!";
    }
}

// Action Button State Management
function updateActionState() {
    const isListTab = document.getElementById('tab-list').classList.contains('active');
    
    let canAction = false;
    if (isListTab) {
        if (selectedApps.size > 0) canAction = true;
    } else {
        if (currentAppInfo) canAction = true;
    }

    if (canAction) {
        modesContainer.classList.remove('disabled');
        detailsContainer.classList.remove('disabled');
        btnAction.classList.remove('disabled');
        updateCheckboxesByMode(currentMode);
        
        if (isListTab && currentMode === 'annihilation') {
            btnAction.textContent = `${selectedApps.size} UYGULAMAYI YOK ET`;
        } else if (isListTab) {
            btnAction.textContent = `${selectedApps.size} UYGULAMAYI KALDIR`;
        }
    } else {
        modesContainer.classList.add('disabled');
        detailsContainer.classList.add('disabled');
        btnAction.classList.add('disabled');
        btnAction.textContent = "KALDIRMAYA BAŞLA";
    }
}

// Perform Uninstall
btnAction.addEventListener('click', async () => {
    const isListTab = document.getElementById('tab-list').classList.contains('active');
    let appsToUninstall = [];

    if (isListTab) {
        if (selectedApps.size === 0) return;
        appsToUninstall = allApps.filter(a => selectedApps.has(a.id));
    } else {
        if (!currentAppInfo) return;
        appsToUninstall = [currentAppInfo];
    }

    const options = {
        runUninstallExe: chkRunUninstall.checked,
        deleteRegistry: chkRegedit.checked,
        deleteLeftovers: chkLeftovers.checked
    };

    btnAction.textContent = "İŞLEM YAPILIYOR... LÜTFEN BEKLEYİN";
    btnAction.classList.add('disabled');
    modesContainer.classList.add('disabled');
    detailsContainer.classList.add('disabled');
    document.querySelector('.tab-content-wrapper').style.display = 'none'; // hide list/manual
    document.querySelector('.tabs').style.display = 'none';
    
    logContainer.style.display = 'block';
    btnClearLog.style.display = 'none'; // Hide clear button while processing

    try {
        const result = await window.api.uninstallMultiple({ apps: appsToUninstall, options });

        if (result.success) {
            result.log.forEach(msg => {
                let color = "white";
                if (msg.includes("HATA")) color = "var(--danger)";
                else if (msg.includes("UYARI")) color = "#f0ad4e";
                else if (msg.includes("temizlendi") || msg.includes("tamamlandı") || msg.includes("BİTTİ")) color = "#0f0";
                else if (msg.includes("başlatıldı") || msg.includes("çalıştırılıyor") || msg.includes("=====================")) color = "var(--primary)";
                
                logList.innerHTML += `<li><span style="color:${color}">${msg}</span></li>`;
            });
            logList.innerHTML += `<li><strong style="color:#0f0">[BİTTİ] Tüm işlemler başarıyla tamamlandı.</strong></li>`;
            
            btnAction.textContent = "BAŞARIYLA TAMAMLANDI";
            btnAction.style.background = "green";
            btnAction.style.boxShadow = "0 0 20px rgba(0,255,0,0.4)";
            btnAction.classList.remove('danger-mode');
            
            // Show Success Modal
            modalSuccess.classList.add('active');
            
            // Success Modal Close Handler
            btnCloseSuccess.onclick = () => {
                modalSuccess.classList.remove('active');
                
                // Restore UI
                document.querySelector('.tab-content-wrapper').style.display = 'block';
                document.querySelector('.tabs').style.display = 'flex';
                btnAction.style.background = '';
                btnAction.style.boxShadow = '';
                logContainer.style.display = 'none';
                logList.innerHTML = '';
                
                if (isListTab) {
                    selectedApps.clear();
                    chkSelectAll.checked = false;
                    loadApps();
                } else {
                    currentAppInfo = null;
                    appNameEl.textContent = "Uygulama Seçilmedi";
                    appPathEl.textContent = "Silmek istediğiniz uygulamanın ana .exe dosyasını seçin";
                    appIconEl.classList.remove('fa-box-open');
                    appIconEl.classList.add('fa-file-code');
                    appIconEl.style.color = 'var(--primary)';
                }
                updateActionState();
            };
            
        } else {
            logList.innerHTML += `<li style="color:var(--danger)">[HATA] İşlem sırasında bir hata oluştu: ${result.error}</li>`;
            if(result.log && result.log.length > 0) {
                 result.log.forEach(msg => {
                    logList.innerHTML += `<li>${msg}</li>`;
                 });
            }
            btnAction.textContent = "HATA OLUŞTU";
            btnAction.style.background = "var(--danger)";
            btnAction.classList.remove('danger-mode');
            
            // Restore UI immediately on error so logs are visible
            document.querySelector('.tab-content-wrapper').style.display = 'block';
            document.querySelector('.tabs').style.display = 'flex';
            btnAction.style.background = '';
            btnAction.style.boxShadow = '';
            updateActionState();
        }
    } catch (err) {
        logList.innerHTML += `<li style="color:var(--danger)">[SİSTEM HATASI] Beklenmeyen bir hata oluştu: ${err.message}</li>`;
        btnAction.textContent = "HATA OLUŞTU";
        btnAction.style.background = "var(--danger)";
        
        // Restore UI immediately on error
        document.querySelector('.tab-content-wrapper').style.display = 'block';
        document.querySelector('.tabs').style.display = 'flex';
        btnAction.style.background = '';
        btnAction.style.boxShadow = '';
        updateActionState();
    }
    
    btnClearLog.style.display = 'block'; // Show clear button after processing
    // Auto scroll down log
    logContainer.scrollTop = logContainer.scrollHeight;
});

// Clear Log Button
btnClearLog.addEventListener('click', () => {
    logContainer.style.display = 'none';
    logList.innerHTML = '';
});
