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

// --- In-Form Edit State & UI Helper ---
let editingCategoryId = null;
let editingQueueTaskId = null;
let editingTemplateId = null;
let editingBlockState = null; // { tplId, blockId }

function setFormEditMode(formId, isEditing, updateText, defaultText, onCancel) {
    const form = document.getElementById(formId);
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const actionsDiv = form.querySelector('.form-actions');
    if (submitBtn) submitBtn.innerText = isEditing ? updateText : defaultText;

    const existingCancel = form.querySelector('.cancel-edit-btn');
    if (existingCancel) existingCancel.remove();

    if (isEditing && actionsDiv) {
        actionsDiv.style.gap = '0.5rem';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary cancel-edit-btn';
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = onCancel;
        actionsDiv.insertBefore(cancelBtn, submitBtn);
    }
}

function cancelCategoryEdit() {
    editingCategoryId = null;
    document.getElementById('categoryForm').reset();
    syncCatColorText('#9333ea');
    setFormEditMode('categoryForm', false, 'Update Category ✓', 'Add Category');
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('catName').value.trim();
    const color = document.getElementById('catColorHex').value.trim();
    if (!name) return;
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
        alert('Invalid hex color format. Please use a valid hex code like #9333ea.');
        return;
    }

    if (editingCategoryId) {
        const cat = appData.categories.find(c => c.id === editingCategoryId);
        if (cat) {
            cat.name = name;
            cat.color = color;
        }
        cancelCategoryEdit();
    } else {
        const id = 'cat_' + Date.now();
        appData.categories.push({ id, name, color });
        document.getElementById('categoryForm').reset();
        syncCatColorText('#9333ea');
    }
    saveData();
}

function editCategory(id) {
    const cat = appData.categories.find(c => c.id === id);
    if (!cat) return;

    editingCategoryId = id;
    document.getElementById('catName').value = cat.name;
    document.getElementById('catColor').value = cat.color;
    document.getElementById('catColorHex').value = cat.color;

    setFormEditMode('categoryForm', true, 'Update Category ✓', 'Add Category', cancelCategoryEdit);
    document.getElementById('categoryForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('catName').focus();
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
function cancelQueueTaskEdit() {
    editingQueueTaskId = null;
    document.getElementById('queueTaskTitle').value = '';
    document.getElementById('queueTaskText').value = '';
    document.getElementById('queueTaskCustomDeadline').value = '';
    setFormEditMode('taskQueueForm', false, 'Update Task ✓', '+ Add Action Task');
}

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

    if (editingQueueTaskId) {
        const task = appData.tasksQueue.find(t => t.id === editingQueueTaskId);
        if (task) {
            task.title = title;
            task.text = title;
            task.description = description;
            task.categoryId = catSelect.value;
            task.deadline = deadlineIso;
        }
        cancelQueueTaskEdit();
    } else {
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
    }

    saveData();
}

function editQueueTask(id) {
    const task = (appData.tasksQueue || []).find(t => t.id === id);
    if (!task) return;

    editingQueueTaskId = id;
    document.getElementById('queueTaskTitle').value = task.title || task.text || '';
    document.getElementById('queueTaskText').value = task.description || '';
    document.getElementById('queueTaskCategory').value = task.categoryId;
    document.getElementById('queueTaskHorizon').value = getEffectiveHorizon(task.deadline);
    document.getElementById('queueTaskCustomDeadline').value = toLocalDatetimeString(task.deadline);

    setFormEditMode('taskQueueForm', true, 'Update Task ✓', '+ Add Action Task', cancelQueueTaskEdit);
    document.getElementById('taskQueueForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('queueTaskTitle').focus();
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

function cancelTemplateEdit() {
    editingTemplateId = null;
    document.getElementById('templateForm').reset();
    syncTplColorText('#3b82f6');
    setFormEditMode('templateForm', false, 'Update Template ✓', 'Save Template');
}

function handleTemplateSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('tplName').value.trim();
    const color = document.getElementById('tplColorHex').value.trim();
    if (!name) return;
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
        alert('Invalid hex color format. Please use a valid hex code like #3b82f6.');
        return;
    }

    if (editingTemplateId) {
        const tpl = appData.templates.find(t => t.id === editingTemplateId);
        if (tpl) {
            tpl.name = name;
            tpl.color = color;
        }
        cancelTemplateEdit();
    } else {
        const id = 'tpl_' + Date.now();
        appData.templates.push({ id, name, color, blocks: [] });
        document.getElementById('templateForm').reset();
        syncTplColorText('#3b82f6');
    }
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

    editingTemplateId = id;
    document.getElementById('tplName').value = tpl.name;
    document.getElementById('tplColor').value = tpl.color;
    document.getElementById('tplColorHex').value = tpl.color;

    setFormEditMode('templateForm', true, 'Update Template ✓', 'Save Template', cancelTemplateEdit);
    document.getElementById('templateForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('tplName').focus();
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

function cancelBlockEdit() {
    editingBlockState = null;
    document.getElementById('blockLabel').value = '';
    setFormEditMode('blockForm', false, 'Update Schedule Block ✓', '+ Add Schedule Block');
}

function handleBlockSubmit(e) {
    e.preventDefault();
    const tplId = document.getElementById('blockTemplateSelect').value;
    const start = document.getElementById('blockStartTime').value;
    const end = document.getElementById('blockEndTime').value;
    const categoryId = document.getElementById('blockCategorySelect').value;
    const label = document.getElementById('blockLabel').value.trim();

    const targetTpl = appData.templates.find(t => t.id === tplId);
    if (!targetTpl) return;
    if (!targetTpl.blocks) targetTpl.blocks = [];

    if (editingBlockState) {
        const sourceTpl = appData.templates.find(t => t.id === editingBlockState.tplId);
        const existingBlock = sourceTpl && sourceTpl.blocks
            ? sourceTpl.blocks.find(b => b.id === editingBlockState.blockId)
            : null;

        if (existingBlock) {
            if (editingBlockState.tplId !== tplId) {
                sourceTpl.blocks = sourceTpl.blocks.filter(b => b.id !== editingBlockState.blockId);
                targetTpl.blocks.push({ ...existingBlock, start, end, categoryId, label });
            } else {
                existingBlock.start = start;
                existingBlock.end = end;
                existingBlock.categoryId = categoryId;
                existingBlock.label = label;
            }
        }
        cancelBlockEdit();
    } else {
        const blockId = 'b_' + Date.now();
        targetTpl.blocks.push({ id: blockId, start, end, categoryId, label });
        document.getElementById('blockLabel').value = '';
        document.getElementById('blockStartTime').value = end;
    }

    saveData();
}

function editBlock(tplId, blockId) {
    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.blocks) return;
    const block = tpl.blocks.find(b => b.id === blockId);
    if (!block) return;

    editingBlockState = { tplId, blockId };
    document.getElementById('blockTemplateSelect').value = tplId;
    document.getElementById('blockStartTime').value = block.start;
    document.getElementById('blockEndTime').value = block.end;
    document.getElementById('blockCategorySelect').value = block.categoryId;
    document.getElementById('blockLabel').value = block.label;

    setFormEditMode('blockForm', true, 'Update Schedule Block ✓', '+ Add Schedule Block', cancelBlockEdit);
    document.getElementById('blockForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('blockLabel').focus();
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
