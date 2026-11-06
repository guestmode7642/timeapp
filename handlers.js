// ==========================================================================
// EVENT HANDLERS, CRUD ACTIONS & INITIALIZATION
// ==========================================================================

// --- Tab Navigation ---
function switchTab(tabId) {
    ['dashboard', 'tasks', 'setup', 'templates'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.getElementById(`btn-${t}`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById(`btn-${tabId}`).classList.add('active');

    if (tabId === 'templates') {
        renderCalendarMatrix();
    }
}

// --- Prefill Logger from Timetable Block ---
function prefillLogFromBlock(dateStr, startTime, endTime, categoryId, note) {
    let endDateStr = dateStr;
    if (endTime === '00:00' && startTime !== '00:00') {
        const [y, m, d] = dateStr.split('-').map(Number);
        const nextDay = new Date(y, m - 1, d + 1);
        endDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    }

    document.getElementById('logFromTime').value = `${dateStr}T${startTime}`;
    document.getElementById('logToTime').value = `${endDateStr}T${endTime}`;
    document.getElementById('logCategory').value = categoryId;

    if (document.getElementById('logTitle')) {
        document.getElementById('logTitle').value = note;
        document.getElementById('logNote').value = '';
    } else {
        document.getElementById('logNote').value = note;
    }

    if (document.getElementById('enableSplitToggle').checked && typeof window.syncSplitInput === 'function') {
        document.querySelectorAll('.split-pct-input').forEach((inp, idx) => {
            window.syncSplitInput(inp, idx);
        });
    }

    document.getElementById('logSection').scrollIntoView({ behavior: 'smooth' });
}

// --- Tenure & Category Handlers ---
function handleTenureSubmit(e) {
    e.preventDefault();
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;

    if (new Date(end) <= new Date(start)) {
        alert('End date must be after start date.');
        return;
    }

    appData.tenure = { start, end };
    saveData();
    alert('Tenure saved successfully!');
    switchTab('dashboard');
}

function syncCatColorText(val) {
    document.getElementById('catColorHex').value = val;
}
function syncCatColorPicker(val) {
    if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
        document.getElementById('catColor').value = val;
    }
}
function syncTplColorText(val) {
    document.getElementById('tplColorHex').value = val;
}
function syncTplColorPicker(val) {
    if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
        document.getElementById('tplColor').value = val;
    }
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('catName').value.trim();
    const color = document.getElementById('catColorHex').value;
    if (!name) return;

    const id = 'cat_' + Date.now();
    appData.categories.push({ id, name, color });
    document.getElementById('categoryForm').reset();
    saveData();
}

function editCategory(id) {
    const cat = appData.categories.find(c => c.id === id);
    if (!cat) return;

    const newName = prompt('Edit category name:', cat.name);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert('Category name cannot be empty.');
        return;
    }

    const newColor = prompt('Edit color theme (Hex code, e.g. #9333ea):', cat.color);
    if (newColor === null) return;
    const trimmedColor = newColor.trim();
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(trimmedColor)) {
        alert('Invalid hex color format. Please use a valid hex code like #9333ea.');
        return;
    }

    cat.name = trimmedName;
    cat.color = trimmedColor;
    saveData();
}

function deleteCategory(id) {
    if (confirm('Are you sure you want to delete this category? Any logs, tasks, or schedule blocks using it will be moved to Unassigned.')) {
        appData.categories = appData.categories.filter(c => c.id !== id);
        appData.tasks.forEach(t => {
            if (t.categoryId === id) t.categoryId = 'cat-unassigned';
            if (t.splits) {
                t.splits.forEach(s => {
                    if (s.categoryId === id) s.categoryId = 'cat-unassigned';
                });
            }
        });
        (appData.tasksQueue || []).forEach(tq => {
            if (tq.categoryId === id) tq.categoryId = 'cat-unassigned';
        });
        appData.templates.forEach(tpl => {
            (tpl.blocks || []).forEach(b => {
                if (b.categoryId === id) b.categoryId = 'cat-unassigned';
            });
        });
        saveData();
    }
}

// --- Task Queue Handlers ---
function handleTaskQueueSubmit(e) {
    e.preventDefault();
    const titleInput = document.getElementById('queueTaskTitle');
    const textInput = document.getElementById('queueTaskText');
    const catSelect = document.getElementById('queueTaskCategory');
    const horizonSelect = document.getElementById('queueTaskHorizon');
    const customDeadlineInput = document.getElementById('queueTaskCustomDeadline');

    const title = titleInput.value.trim();
    const description = textInput.value.trim();
    if (!title) return;

    if (!appData.tasksQueue) appData.tasksQueue = [];

    let deadlineIso;
    const customVal = customDeadlineInput.value;
    if (customVal) {
        deadlineIso = new Date(customVal).toISOString();
    } else {
        deadlineIso = calculateDeadlineDate(horizonSelect.value);
    }

    appData.tasksQueue.push({
        id: 'tq_' + Date.now(),
        title: title,
        description: description,
        text: title,
        categoryId: catSelect.value,
        deadline: deadlineIso,
        createdAt: new Date().toISOString(),
        completed: false,
        completedAt: null
    });

    titleInput.value = '';
    textInput.value = '';
    customDeadlineInput.value = '';
    saveData();
}

function editQueueTask(id) {
    const task = (appData.tasksQueue || []).find(t => t.id === id);
    if (!task) return;

    const currentTitle = task.title || task.text || '';
    const newTitle = prompt('Edit task title:', currentTitle);
    if (newTitle === null) return;
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
        alert('Task title cannot be empty.');
        return;
    }

    const currentDesc = task.description || '';
    const newDesc = prompt('Edit task description (optional):', currentDesc);
    if (newDesc === null) return;

    task.title = trimmedTitle;
    task.text = trimmedTitle;
    task.description = newDesc.trim();
    saveData();
}

function completeQueueTaskDirectly(id) {
    const task = (appData.tasksQueue || []).find(t => t.id === id);
    if (!task) return;

    const localTimestamp = toLocalDatetimeString(new Date());
    task.completed = true;
    task.completedAt = localTimestamp;

    const taskTitle = task.title || task.text;
    const completionLogId = 'log_' + Date.now();
    appData.tasks.push({
        id: completionLogId,
        from: localTimestamp,
        to: localTimestamp,
        title: `[Completed Task] ${taskTitle}`,
        note: task.description || '',
        splits: [{ categoryId: task.categoryId, percentage: 100 }]
    });

    saveData();
}

function deleteQueueTask(id) {
    if (confirm('Are you sure you want to delete this action task?')) {
        appData.tasksQueue = (appData.tasksQueue || []).filter(t => t.id !== id);
        saveData();
    }
}

// --- Time Logging & Split Handlers ---
function toggleSplitSection(checkbox) {
    const section = document.getElementById('splitSection');
    if (checkbox.checked) {
        section.classList.remove('hidden');
        rebuildSplitRows();
    } else {
        section.classList.add('hidden');
    }
}

function syncPrimaryCategoryDropdown() {
    const primarySelect = document.getElementById('splitPrimaryCatSelect');
    if (primarySelect) {
        document.getElementById('logCategory').value = primarySelect.value;
    }
    updateSplitMath();
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const from = document.getElementById('logFromTime').value;
    const to = document.getElementById('logToTime').value;
    const mainCategoryId = document.getElementById('logCategory').value;
    const title = document.getElementById('logTitle').value.trim();
    const label = document.getElementById('logNote').value.trim();
    const isSplitEnabled = document.getElementById('enableSplitToggle').checked;

    const fDate = new Date(from);
    const tDate = new Date(to);
    if (isNaN(fDate) || isNaN(tDate) || tDate <= fDate) {
        alert("Please enter valid start and end times.");
        return;
    }

    let splits = [];
    let totalPct = 0;

    if (isSplitEnabled) {
        const primaryCatSelect = document.getElementById('splitPrimaryCatSelect');
        const secondaryCatSelects = document.querySelectorAll('.split-cat-select');
        const pctInputs = document.querySelectorAll('.split-pct-input');

        if (primaryCatSelect && pctInputs.length > 0) {
            const pId = primaryCatSelect.value;
            const pVal = parseInt(pctInputs[0].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: pId, percentage: pVal });
                totalPct += pVal;
            }
        }

        for (let i = 0; i < secondaryCatSelects.length; i++) {
            const cId = secondaryCatSelects[i].value;
            const pVal = parseInt(pctInputs[i + 1].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: cId, percentage: pVal });
                totalPct += pVal;
            }
        }

        if (totalPct > 100) {
            alert("Total split percentage cannot exceed 100%. Please adjust your sliders.");
            return;
        }

        const remainder = 100 - totalPct;
        if (remainder > 0) {
            splits.push({ categoryId: 'cat-unassigned', percentage: remainder });
        }
    } else {
        splits.push({ categoryId: mainCategoryId, percentage: 100 });
    }

    const taskId = 't_' + Date.now();
    appData.tasks.push({ id: taskId, from, to, title, note: label, splits });

    saveData();

    document.getElementById('taskLogForm').reset();
    document.getElementById('splitSection').classList.add('hidden');
    document.getElementById('logFromTime').value = to;
}

function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this logged task?')) {
        return;
    }
    const taskLog = appData.tasks.find(t => t.id === id);
    const logHeader = (taskLog && (taskLog.title || taskLog.note)) || '';
    if (logHeader.startsWith('[Completed Task] ')) {
        const originalTitle = logHeader.replace('[Completed Task] ', '');
        if (!appData.tasksQueue) appData.tasksQueue = [];
        const queuedTask = appData.tasksQueue.find(t => (t.title === originalTitle || t.text === originalTitle) && t.completed);
        if (queuedTask) {
            queuedTask.completed = false;
            queuedTask.completedAt = null;
        }
    }

    appData.tasks = appData.tasks.filter(t => t.id !== id);
    
    // Reset #logFromTime so renderApp() automatically grabs the latest remaining log's end time
    document.getElementById('logFromTime').value = '';
    saveData();
}

function clearLogs() {
    if (confirm('Are you sure you want to clear all logged time history?')) {
        appData.tasks = [];
        document.getElementById('logFromTime').value = '';
        saveData();
    }
}

// --- Template & Schedule Block Handlers ---
function handleTemplateSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('tplName').value.trim();
    const color = document.getElementById('tplColorHex').value;
    if (!name) return;

    const id = 'tpl_' + Date.now();
    appData.templates.push({ id, name, color, blocks: [] });
    document.getElementById('templateForm').reset();
    saveData();
    renderCalendarMatrix();
}

function duplicateTemplate(id) {
    const tpl = appData.templates.find(t => t.id === id);
    if (!tpl) return;

    const clonedBlocks = (tpl.blocks || []).map((b, index) => ({
        ...b,
        id: 'b_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substring(2, 5)
    }));

    const newTemplate = {
        id: 'tpl_' + Date.now(),
        name: `${tpl.name} (Copy)`,
        color: tpl.color,
        blocks: clonedBlocks
    };

    appData.templates.push(newTemplate);
    saveData();
    renderCalendarMatrix();
}

function editTemplate(id) {
    const tpl = appData.templates.find(t => t.id === id);
    if (!tpl) return;

    const newName = prompt('Edit template name:', tpl.name);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert('Template name cannot be empty.');
        return;
    }

    const newColor = prompt('Edit template color theme (Hex code, e.g. #3b82f6):', tpl.color);
    if (newColor === null) return;
    const trimmedColor = newColor.trim();
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(trimmedColor)) {
        alert('Invalid hex color format. Please use a valid hex code like #3b82f6.');
        return;
    }

    tpl.name = trimmedName;
    tpl.color = trimmedColor;
    saveData();
    renderCalendarMatrix();
}

function deleteTemplate(id) {
    if (confirm('Are you sure you want to delete this schedule template and its mappings?')) {
        appData.templates = appData.templates.filter(t => t.id !== id);
        for (let date in appData.dayMappings) {
            if (appData.dayMappings[date] === id) delete appData.dayMappings[date];
        }
        saveData();
        renderCalendarMatrix();
    }
}

function handleBlockSubmit(e) {
    e.preventDefault();
    const tplId = document.getElementById('blockTemplateSelect').value;
    const start = document.getElementById('blockStartTime').value;
    const end = document.getElementById('blockEndTime').value;
    const categoryId = document.getElementById('blockCategorySelect').value;
    const label = document.getElementById('blockLabel').value.trim();

    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl) return;

    if (!tpl.blocks) tpl.blocks = [];
    const blockId = 'b_' + Date.now();
    tpl.blocks.push({ id: blockId, start, end, categoryId, label });

    document.getElementById('blockLabel').value = '';
    document.getElementById('blockStartTime').value = end;

    saveData();
}

function editBlock(tplId, blockId) {
    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.blocks) return;
    const block = tpl.blocks.find(b => b.id === blockId);
    if (!block) return;

    const newLabel = prompt('Edit block label/description:', block.label);
    if (newLabel === null) return;
    const trimmedLabel = newLabel.trim();
    if (!trimmedLabel) {
        alert('Block label cannot be empty.');
        return;
    }

    const newStart = prompt('Edit start time (HH:MM 24h format):', block.start);
    if (newStart === null) return;

    const newEnd = prompt('Edit end time (HH:MM 24h format):', block.end);
    if (newEnd === null) return;

    block.label = trimmedLabel;
    block.start = newStart.trim();
    block.end = newEnd.trim();
    saveData();
}

function deleteBlock(tplId, blockId) {
    if (confirm('Remove this hourly block from the template?')) {
        const tpl = appData.templates.find(t => t.id === tplId);
        if (!tpl || !tpl.blocks) return;
        tpl.blocks = tpl.blocks.filter(b => b.id !== blockId);
        saveData();
    }
}

// --- Calendar Selection & Mapping Handlers ---
function assignSelectedDays(tplId) {
    if (selectedDatesSet.size === 0) {
        alert('Please click and select at least one day in the calendar grid first.');
        return;
    }

    selectedDatesSet.forEach(dateKey => {
        if (tplId === null) {
            delete appData.dayMappings[dateKey];
        } else {
            appData.dayMappings[dateKey] = tplId;
        }
    });

    selectedDatesSet.clear();
    saveData();
    renderCalendarMatrix();
}

function selectAllDays() {
    const startStr = appData.tenure.start;
    const endStr = appData.tenure.end;
    if (!startStr || !endStr) return;

    const startDate = new Date(startStr);
    let curr = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endStr);
    selectedDatesSet.clear();

    while (curr < end) {
        const year = curr.getFullYear();
        const month = String(curr.getMonth() + 1).padStart(2, '0');
        const day = String(curr.getDate()).padStart(2, '0');
        selectedDatesSet.add(`${year}-${month}-${day}`);
        curr.setDate(curr.getDate() + 1);
    }
    renderCalendarMatrix();
}

function clearDaySelection() {
    selectedDatesSet.clear();
    renderCalendarMatrix();
}

// --- DOM Listeners & App Bootstrap ---
document.getElementById('logCategory').addEventListener('change', function () {
    const primarySplitSelect = document.getElementById('splitPrimaryCatSelect');
    if (primarySplitSelect) {
        primarySplitSelect.value = this.value;
    }
});

['logFromTime', 'logToTime'].forEach(inputId => {
    document.getElementById(inputId).addEventListener('change', function () {
        if (document.getElementById('enableSplitToggle').checked && typeof window.syncSplitInput === 'function') {
            document.querySelectorAll('.split-pct-input').forEach((inp, idx) => {
                window.syncSplitInput(inp, idx);
            });
        }
    });
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swCode = `
            const CACHE_NAME = 'time-ledger-cache-v2';
            self.addEventListener('install', e => self.skipWaiting());
            self.addEventListener('activate', e => e.waitUntil(clients.claim()));
            self.addEventListener('fetch', e => {
                e.respondWith(
                    fetch(e.request)
                        .then(response => caches.open(CACHE_NAME).then(cache => {
                            cache.put(e.request, response.clone());
                            return response;
                        }))
                        .catch(() => caches.match(e.request))
                );
            });
        `;
        const blob = new Blob([swCode], { type: 'text/javascript' });
        const swUrl = URL.createObjectURL(blob);
        navigator.serviceWorker.register(swUrl).catch(err => {
            console.warn('Offline caching service worker skipped:', err);
        });
    });
}

// Initial render
renderApp();
