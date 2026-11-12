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

// --- Prefill Logger from Timetable Block (Including Subcategories & Planned Splits) ---
function prefillLogFromBlock(dateStr, startTime, endTime, categoryId, note, blockId = null) {
    let endDateStr = dateStr;
    if (endTime === '00:00' && startTime !== '00:00') {
        const [y, m, d] = dateStr.split('-').map(Number);
        const nextDay = new Date(y, m - 1, d + 1);
        endDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    }

    document.getElementById('logFromTime').value = `${dateStr}T${startTime}`;
    document.getElementById('logToTime').value = `${endDateStr}T${endTime}`;
    document.getElementById('logCategory').value = categoryId;

    // Look up the template block to check for subcategoryId and splits
    let matchedBlock = null;
    const tplId = appData.dayMappings[dateStr];
    if (tplId && blockId) {
        const tpl = appData.templates.find(t => t.id === tplId);
        if (tpl && tpl.blocks) {
            matchedBlock = tpl.blocks.find(b => b.id === blockId);
        }
    }

    const subId = (matchedBlock && matchedBlock.subcategoryId) ? matchedBlock.subcategoryId : 'sub_general';
    populateSubcategorySelect(document.getElementById('logSubcategory'), categoryId, subId);

    if (document.getElementById('logTitle')) {
        document.getElementById('logTitle').value = note;
        document.getElementById('logNote').value = '';
    } else {
        document.getElementById('logNote').value = note;
    }

    const splitToggle = document.getElementById('enableSplitToggle');
    const splitSection = document.getElementById('splitSection');
    const userSplits = (matchedBlock && Array.isArray(matchedBlock.splits))
        ? matchedBlock.splits.filter(s => !s.isRemainder)
        : [];
    const hasCustomSplits = userSplits.length > 1 || (userSplits.length === 1 && userSplits[0].percentage < 99.9);

    if (hasCustomSplits) {
        splitToggle.checked = true;
        splitSection.classList.remove('hidden');
        rebuildSplitRows(userSplits);
    } else {
        splitToggle.checked = false;
        splitSection.classList.add('hidden');
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

let currentCategoryDraftSubcategories = [];
let editingDraftSubcategoryId = null;

function openSubcategoryEntryBox(editSubId = null) {
    const box = document.getElementById('catSubcategoryEntryBox');
    const inp = document.getElementById('subCatNameInput');
    const btn = document.getElementById('saveSubCatBtn');
    if (!box || !inp) return;

    box.classList.remove('hidden');
    if (editSubId) {
        const sub = currentCategoryDraftSubcategories.find(s => s.id === editSubId);
        if (sub) {
            editingDraftSubcategoryId = editSubId;
            inp.value = sub.name;
            btn.innerText = 'Update Subcategory ✓';
        }
    } else {
        editingDraftSubcategoryId = null;
        inp.value = '';
        btn.innerText = 'Add Subcategory ✓';
    }
    inp.focus();
}

function closeSubcategoryEntryBox() {
    const box = document.getElementById('catSubcategoryEntryBox');
    if (box) box.classList.add('hidden');
    editingDraftSubcategoryId = null;
    const inp = document.getElementById('subCatNameInput');
    if (inp) inp.value = '';
}

function saveDraftSubcategory() {
    const inp = document.getElementById('subCatNameInput');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) {
        alert('Please enter a subcategory name.');
        return;
    }

    if (editingDraftSubcategoryId) {
        const sub = currentCategoryDraftSubcategories.find(s => s.id === editingDraftSubcategoryId);
        if (sub) sub.name = name;
    } else {
        currentCategoryDraftSubcategories.push({
            id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
            name
        });
    }
    closeSubcategoryEntryBox();
    renderCategoryDraftSubcategories();
}

function deleteDraftSubcategory(subId) {
    if (subId === 'sub_general') return;
    currentCategoryDraftSubcategories = currentCategoryDraftSubcategories.filter(s => s.id !== subId);
    if (editingDraftSubcategoryId === subId) closeSubcategoryEntryBox();
    renderCategoryDraftSubcategories();
}

function cancelCategoryEdit() {
    editingCategoryId = null;
    currentCategoryDraftSubcategories = [];
    closeSubcategoryEntryBox();
    renderCategoryDraftSubcategories();
    document.getElementById('categoryForm').reset();
    syncCatColorText('#9333ea');
    setFormEditMode('categoryForm', false, 'Update Category ✓', 'Add Category');
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('catName').value.trim();
    const descInput = document.getElementById('catDesc');
    const description = descInput ? descInput.value.trim() : '';
    const color = document.getElementById('catColorHex').value.trim();
    if (!name) return;
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
        alert('Invalid hex color format. Please use a valid hex code like #9333ea.');
        return;
    }

    // Auto-save any typed text in the open subcategory input box
    const pendingSubName = document.getElementById('subCatNameInput') ? document.getElementById('subCatNameInput').value.trim() : '';
    if (pendingSubName) {
        saveDraftSubcategory();
    }

    const finalSubcategories = [
        { id: 'sub_general', name: 'General' },
        ...currentCategoryDraftSubcategories.filter(s => s.id !== 'sub_general').map(s => ({ ...s }))
    ];

    if (editingCategoryId) {
        const cat = appData.categories.find(c => c.id === editingCategoryId);
        if (cat) {
            cat.name = name;
            cat.description = description;
            cat.color = color;
            cat.subcategories = finalSubcategories;
        }
        cancelCategoryEdit();
    } else {
        const id = 'cat_' + Date.now();
        appData.categories.push({ id, name, description, color, subcategories: finalSubcategories });
        currentCategoryDraftSubcategories = [];
        closeSubcategoryEntryBox();
        renderCategoryDraftSubcategories();
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
    if (document.getElementById('catDesc')) {
        document.getElementById('catDesc').value = cat.description || '';
    }
    document.getElementById('catColor').value = cat.color;
    document.getElementById('catColorHex').value = cat.color;

    currentCategoryDraftSubcategories = getCategorySubcategories(cat)
        .filter(s => s.id !== 'sub_general')
        .map(s => ({ ...s }));
    closeSubcategoryEntryBox();
    renderCategoryDraftSubcategories();

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
    const primarySubSelect = document.getElementById('splitPrimarySubSelect');
    if (primarySelect) {
        document.getElementById('logCategory').value = primarySelect.value;
        populateSubcategorySelect(document.getElementById('logSubcategory'), primarySelect.value);
        if (primarySubSelect && document.getElementById('logSubcategory')) {
            document.getElementById('logSubcategory').value = primarySubSelect.value;
        }
    }
    updateSplitMath();
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const from = document.getElementById('logFromTime').value;
    const to = document.getElementById('logToTime').value;
    const mainCategoryId = document.getElementById('logCategory').value;
    const mainSubcategoryId = document.getElementById('logSubcategory')
        ? document.getElementById('logSubcategory').value
        : 'sub_general';
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
        const primarySubSelect = document.getElementById('splitPrimarySubSelect');
        const secondaryCatSelects = document.querySelectorAll('.split-cat-select');
        const secondarySubSelects = document.querySelectorAll('.split-subcat-select');
        const pctInputs = document.querySelectorAll('.split-pct-input');

        if (primaryCatSelect && pctInputs.length > 0) {
            const pId = primaryCatSelect.value;
            const pSubId = primarySubSelect ? primarySubSelect.value : 'sub_general';
            const pVal = parseFloat(pctInputs[0].dataset.exactPct ?? pctInputs[0].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: pId, subcategoryId: pSubId, percentage: pVal });
                totalPct += pVal;
            }
        }

        for (let i = 0; i < secondaryCatSelects.length; i++) {
            const cId = secondaryCatSelects[i].value;
            const cSubId = secondarySubSelects[i] ? secondarySubSelects[i].value : 'sub_general';
            const pVal = parseFloat(pctInputs[i + 1].dataset.exactPct ?? pctInputs[i + 1].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: cId, subcategoryId: cSubId, percentage: pVal });
                totalPct += pVal;
            }
        }

        if (totalPct > 100.05) {
            alert("Total split percentage cannot exceed 100%. Please adjust your durations or sliders.");
            return;
        }

        const remainder = Math.max(0, 100 - totalPct);
        if (remainder > 0.05) {
            splits.push({ categoryId: 'cat-unassigned', subcategoryId: 'sub_general', percentage: remainder });
        }
    } else {
        splits.push({ categoryId: mainCategoryId, subcategoryId: mainSubcategoryId, percentage: 100 });
    }

    const taskId = 't_' + Date.now();
    appData.tasks.push({ id: taskId, categoryId: mainCategoryId, subcategoryId: mainSubcategoryId, from, to, title, note: label, splits });

    saveData();

    document.getElementById('taskLogForm').reset();
    document.getElementById('splitSection').classList.add('hidden');
    document.getElementById('logFromTime').value = to;
    populateSubcategorySelect(document.getElementById('logSubcategory'), document.getElementById('logCategory').value);
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

// --- Draft Checklist State for Block Form ---
let currentBlockDraftChecklist = [];
let editingDraftChecklistId = null;

function openChecklistEntryBox(editItemId = null) {
    const box = document.getElementById('blockChecklistEntryBox');
    const titleInp = document.getElementById('chkItemTitle');
    const descInp = document.getElementById('chkItemDesc');
    const saveBtn = document.getElementById('saveChkItemBtn');
    if (!box) return;

    box.classList.remove('hidden');

    if (editItemId) {
        const item = currentBlockDraftChecklist.find(c => c.id === editItemId);
        if (item) {
            editingDraftChecklistId = editItemId;
            titleInp.value = item.title || '';
            descInp.value = item.description || '';
            saveBtn.innerText = 'Update Entry ✓';
        }
    } else {
        editingDraftChecklistId = null;
        titleInp.value = '';
        descInp.value = '';
        saveBtn.innerText = 'Add Entry ✓';
    }
    titleInp.focus();
}

function closeChecklistEntryBox() {
    const box = document.getElementById('blockChecklistEntryBox');
    if (box) box.classList.add('hidden');
    editingDraftChecklistId = null;
    document.getElementById('chkItemTitle').value = '';
    document.getElementById('chkItemDesc').value = '';
}

function saveDraftChecklistItem() {
    const titleInp = document.getElementById('chkItemTitle');
    const descInp = document.getElementById('chkItemDesc');
    const title = titleInp.value.trim();
    const description = descInp.value.trim();

    if (!title) {
        alert('Please enter a checklist title.');
        return;
    }

    if (editingDraftChecklistId) {
        const existing = currentBlockDraftChecklist.find(c => c.id === editingDraftChecklistId);
        if (existing) {
            existing.title = title;
            existing.description = description;
        }
    } else {
        currentBlockDraftChecklist.push({
            id: 'chk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
            title,
            description,
            completedDates: []
        });
    }

    closeChecklistEntryBox();
    renderBlockDraftChecklist();
}

function deleteDraftChecklistItem(itemId) {
    if (!confirm('Are you sure you want to delete this checklist item?')) return;
    currentBlockDraftChecklist = currentBlockDraftChecklist.filter(c => c.id !== itemId);
    if (editingDraftChecklistId === itemId) {
        closeChecklistEntryBox();
    }
    renderBlockDraftChecklist();
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

function toggleBlockSplitSection(checkbox) {
    const section = document.getElementById('blockSplitSection');
    if (!section) return;
    if (checkbox.checked) {
        section.classList.remove('hidden');
        rebuildBlockSplitRows();
    } else {
        section.classList.add('hidden');
    }
}

function syncBlockPrimaryCategoryDropdown() {
    const primaryCat = document.getElementById('blockSplitPrimaryCatSelect');
    const primarySub = document.getElementById('blockSplitPrimarySubSelect');
    if (primaryCat) {
        document.getElementById('blockCategorySelect').value = primaryCat.value;
        populateSubcategorySelect(document.getElementById('blockSubcategorySelect'), primaryCat.value);
        if (primarySub && document.getElementById('blockSubcategorySelect')) {
            document.getElementById('blockSubcategorySelect').value = primarySub.value;
        }
    }
    updateBlockSplitMath();
}

function duplicateTemplate(id) {
    const tpl = appData.templates.find(t => t.id === id);
    if (!tpl) return;

    const clonedBlocks = (tpl.blocks || []).map((b, index) => ({
        ...b,
        id: 'b_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substring(2, 5),
        splits: Array.isArray(b.splits) ? b.splits.map(s => ({ ...s })) : undefined,
        checklist: (b.checklist || []).map((chk, cIdx) => ({
            ...chk,
            id: 'chk_' + Date.now() + '_' + index + '_' + cIdx + '_' + Math.random().toString(36).substring(2, 5),
            completedDates: []
        }))
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
    currentBlockDraftChecklist = [];
    closeChecklistEntryBox();
    renderBlockDraftChecklist();
    document.getElementById('blockLabel').value = '';
    const splitToggle = document.getElementById('enableBlockSplitToggle');
    const splitSection = document.getElementById('blockSplitSection');
    if (splitToggle) splitToggle.checked = false;
    if (splitSection) splitSection.classList.add('hidden');
    setFormEditMode('blockForm', false, 'Update Schedule Block ✓', '+ Add Schedule Block');
}

function handleBlockSubmit(e) {
    e.preventDefault();
    const tplId = document.getElementById('blockTemplateSelect').value;
    const start = document.getElementById('blockStartTime').value;
    const end = document.getElementById('blockEndTime').value;
    const categoryId = document.getElementById('blockCategorySelect').value;
    const subcategoryId = document.getElementById('blockSubcategorySelect')
        ? document.getElementById('blockSubcategorySelect').value
        : 'sub_general';
    const label = document.getElementById('blockLabel').value.trim();
    const isSplitEnabled = document.getElementById('enableBlockSplitToggle') && document.getElementById('enableBlockSplitToggle').checked;

    const pendingChkTitle = document.getElementById('chkItemTitle') ? document.getElementById('chkItemTitle').value.trim() : '';
    if (pendingChkTitle) {
        saveDraftChecklistItem();
    }

    let splits = [];
    let totalPct = 0;

    if (isSplitEnabled) {
        const primaryCatSelect = document.getElementById('blockSplitPrimaryCatSelect');
        const primarySubSelect = document.getElementById('blockSplitPrimarySubSelect');
        const secondaryCatSelects = document.querySelectorAll('#dynamicBlockSplitRows .block-split-cat-select');
        const secondarySubSelects = document.querySelectorAll('#dynamicBlockSplitRows .block-split-subcat-select');
        const pctInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-pct-input');

        if (primaryCatSelect && pctInputs.length > 0) {
            const pId = primaryCatSelect.value;
            const pSubId = primarySubSelect ? primarySubSelect.value : 'sub_general';
            const pVal = parseFloat(pctInputs[0].dataset.exactPct ?? pctInputs[0].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: pId, subcategoryId: pSubId, percentage: pVal });
                totalPct += pVal;
            }
        }

        for (let i = 0; i < secondaryCatSelects.length; i++) {
            const cId = secondaryCatSelects[i].value;
            const cSubId = secondarySubSelects[i] ? secondarySubSelects[i].value : 'sub_general';
            const pVal = parseFloat(pctInputs[i + 1].dataset.exactPct ?? pctInputs[i + 1].value) || 0;
            if (pVal > 0) {
                splits.push({ categoryId: cId, subcategoryId: cSubId, percentage: pVal });
                totalPct += pVal;
            }
        }

        if (totalPct > 100.05) {
            alert('Total block split percentage cannot exceed 100%. Please adjust your durations or sliders.');
            return;
        }

        const remainder = Math.max(0, 100 - totalPct);
        if (remainder > 0.05) {
            splits.push({ categoryId: 'cat-unassigned', subcategoryId: 'sub_general', percentage: remainder, isRemainder: true });
        }
    } else {
        splits.push({ categoryId, subcategoryId, percentage: 100 });
    }

    const targetTpl = appData.templates.find(t => t.id === tplId);
    if (!targetTpl) return;
    if (!targetTpl.blocks) targetTpl.blocks = [];

    const checklistToSave = currentBlockDraftChecklist.map(c => ({ ...c }));

    if (editingBlockState) {
        const sourceTpl = appData.templates.find(t => t.id === editingBlockState.tplId);
        const existingBlock = sourceTpl && sourceTpl.blocks
            ? sourceTpl.blocks.find(b => b.id === editingBlockState.blockId)
            : null;

        if (existingBlock) {
            if (editingBlockState.tplId !== tplId) {
                sourceTpl.blocks = sourceTpl.blocks.filter(b => b.id !== editingBlockState.blockId);
                targetTpl.blocks.push({ ...existingBlock, start, end, categoryId, subcategoryId, label, splits, checklist: checklistToSave });
            } else {
                existingBlock.start = start;
                existingBlock.end = end;
                existingBlock.categoryId = categoryId;
                existingBlock.subcategoryId = subcategoryId;
                existingBlock.label = label;
                existingBlock.splits = splits;
                existingBlock.checklist = checklistToSave;
            }
        }
        cancelBlockEdit();
    } else {
        const blockId = 'b_' + Date.now();
        targetTpl.blocks.push({ id: blockId, start, end, categoryId, subcategoryId, label, splits, checklist: checklistToSave });
        document.getElementById('blockLabel').value = '';
        document.getElementById('blockStartTime').value = end;
        currentBlockDraftChecklist = [];
        closeChecklistEntryBox();
        renderBlockDraftChecklist();
        const splitToggle = document.getElementById('enableBlockSplitToggle');
        const splitSection = document.getElementById('blockSplitSection');
        if (splitToggle) splitToggle.checked = false;
        if (splitSection) splitSection.classList.add('hidden');
    }

    saveData();
}

function editBlock(tplId, blockId, focusChecklistId = null) {
    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.blocks) return;
    const block = tpl.blocks.find(b => b.id === blockId);
    if (!block) return;

    editingBlockState = { tplId, blockId };
    document.getElementById('blockTemplateSelect').value = tplId;
    document.getElementById('blockStartTime').value = block.start;
    document.getElementById('blockEndTime').value = block.end;
    document.getElementById('blockCategorySelect').value = block.categoryId;
    populateSubcategorySelect(
        document.getElementById('blockSubcategorySelect'),
        block.categoryId,
        block.subcategoryId || 'sub_general'
    );
    document.getElementById('blockLabel').value = block.label;

    const splitToggle = document.getElementById('enableBlockSplitToggle');
    const splitSection = document.getElementById('blockSplitSection');
    const userSplits = Array.isArray(block.splits) ? block.splits.filter(s => !s.isRemainder) : [];
    const hasCustomSplits = userSplits.length > 1 || (userSplits.length === 1 && userSplits[0].percentage < 99.9);

    if (splitToggle && splitSection) {
        if (hasCustomSplits) {
            splitToggle.checked = true;
            splitSection.classList.remove('hidden');
            rebuildBlockSplitRows(userSplits);
        } else {
            splitToggle.checked = false;
            splitSection.classList.add('hidden');
        }
    }

    currentBlockDraftChecklist = (block.checklist || []).map(c => ({
        ...c,
        completedDates: Array.isArray(c.completedDates) ? [...c.completedDates] : []
    }));
    closeChecklistEntryBox();
    renderBlockDraftChecklist();

    setFormEditMode('blockForm', true, 'Update Schedule Block ✓', '+ Add Schedule Block', cancelBlockEdit);
    document.getElementById('blockForm').scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (focusChecklistId) {
        openChecklistEntryBox(focusChecklistId);
    } else {
        document.getElementById('blockLabel').focus();
    }
}

// --- Today's Checklist Actions (Check / Uncheck, Edit in Form, Delete) ---
function toggleChecklistItemToday(tplId, blockId, chkId, dateKey) {
    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.blocks) return;
    const block = tpl.blocks.find(b => b.id === blockId);
    if (!block || !block.checklist) return;
    const item = block.checklist.find(c => c.id === chkId);
    if (!item) return;

    if (!Array.isArray(item.completedDates)) item.completedDates = [];
    if (item.completedDates.includes(dateKey)) {
        item.completedDates = item.completedDates.filter(d => d !== dateKey);
    } else {
        item.completedDates.push(dateKey);
    }
    saveData();
}

function jumpToEditChecklistItem(tplId, blockId, chkId) {
    switchTab('templates');
    editBlock(tplId, blockId, chkId);
}

function deleteChecklistItemFromToday(tplId, blockId, chkId) {
    if (!confirm('Remove this item from the template checklist?')) return;
    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.blocks) return;
    const block = tpl.blocks.find(b => b.id === blockId);
    if (!block || !block.checklist) return;
    block.checklist = block.checklist.filter(c => c.id !== chkId);
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
    populateSubcategorySelect(document.getElementById('logSubcategory'), this.value);
    const primarySplitSelect = document.getElementById('splitPrimaryCatSelect');
    const primarySplitSubSelect = document.getElementById('splitPrimarySubSelect');
    if (primarySplitSelect) {
        primarySplitSelect.value = this.value;
        if (primarySplitSubSelect) {
            populateSubcategorySelect(primarySplitSubSelect, this.value);
        }
    }
});

const logSubSelectEl = document.getElementById('logSubcategory');
if (logSubSelectEl) {
    logSubSelectEl.addEventListener('change', function () {
        const primarySplitSubSelect = document.getElementById('splitPrimarySubSelect');
        if (primarySplitSubSelect) {
            primarySplitSubSelect.value = this.value;
        }
    });
}

['logFromTime', 'logToTime'].forEach(inputId => {
    document.getElementById(inputId).addEventListener('change', function () {
        if (document.getElementById('enableSplitToggle').checked && typeof window.syncSplitInput === 'function') {
            document.querySelectorAll('.split-pct-input').forEach((inp, idx) => {
                window.syncSplitInput(inp, idx);
            });
        }
    });
});
const blockCatSelectEl = document.getElementById('blockCategorySelect');
if (blockCatSelectEl) {
    blockCatSelectEl.addEventListener('change', function () {
        populateSubcategorySelect(document.getElementById('blockSubcategorySelect'), this.value);
        const primarySplitCat = document.getElementById('blockSplitPrimaryCatSelect');
        const primarySplitSub = document.getElementById('blockSplitPrimarySubSelect');
        if (primarySplitCat) {
            primarySplitCat.value = this.value;
            if (primarySplitSub) {
                populateSubcategorySelect(primarySplitSub, this.value);
            }
        }
    });
}

const blockSubSelectEl = document.getElementById('blockSubcategorySelect');
if (blockSubSelectEl) {
    blockSubSelectEl.addEventListener('change', function () {
        const primarySplitSub = document.getElementById('blockSplitPrimarySubSelect');
        if (primarySplitSub) {
            primarySplitSub.value = this.value;
        }
    });
}

['blockStartTime', 'blockEndTime'].forEach(inputId => {
    const el = document.getElementById(inputId);
    if (el) {
        el.addEventListener('change', function () {
            const toggle = document.getElementById('enableBlockSplitToggle');
            if (toggle && toggle.checked && typeof window.syncBlockSplitInput === 'function') {
                document.querySelectorAll('#dynamicBlockSplitRows .block-split-pct-input').forEach((inp, idx) => {
                    window.syncBlockSplitInput(inp, idx, 'init');
                });
            }
        });
    }
});
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swCode = `
            const CACHE_NAME = 'time-ledger-cache-v6';
            self.addEventListener('install', e => self.skipWaiting());
            self.addEventListener('activate', e => e.waitUntil(clients.claim()));
            self.addEventListener('fetch', e => {
                if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
                    return;
                }
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
// --- Multi-User Auth Handlers (Persistent LocalStorage Session) ---
function toggleAuthMode() {
    const actionInput = document.getElementById('authActionInput');
    const titleEl = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchBtn = document.getElementById('authSwitchModeBtn');
    const errEl = document.getElementById('authErrorMsg');
    if (errEl) errEl.classList.add('hidden');

    if (actionInput.value === 'login') {
        actionInput.value = 'signup';
        titleEl.innerText = '✨ Create Time Ledger Account';
        submitBtn.innerText = 'Sign Up ➔';
        switchBtn.innerText = 'Have an account? Login';
    } else {
        actionInput.value = 'login';
        titleEl.innerText = '🔐 Sign In to Time Ledger';
        submitBtn.innerText = 'Login ➔';
        switchBtn.innerText = 'Need an account? Sign Up';
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const action = document.getElementById('authActionInput').value;
    const username = document.getElementById('authUsername').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authErrorMsg');
    const submitBtn = document.getElementById('authSubmitBtn');

    errEl.classList.add('hidden');
    submitBtn.disabled = true;

    try {
        const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, username, password })
        });
        const result = await res.json();

        if (!res.ok) {
            errEl.innerText = result.error || 'Authentication failed.';
            errEl.classList.remove('hidden');
            submitBtn.disabled = false;
            return;
        }

        // Save persistent session in localStorage so user never has to log in again on this device
        authSession = { username: result.username, token: result.token };
        localStorage.setItem('timeLedgerSession', JSON.stringify(authSession));

        if (result.data) {
            appData = result.data;
            localStorage.setItem(getActiveStorageKey(), JSON.stringify(appData));
        } else {
            // New account: if this device already had local schedule data, keep & upload it; otherwise start fresh
            const existingUserLocal = JSON.parse(localStorage.getItem(getActiveStorageKey()));
            if (existingUserLocal) {
                appData = existingUserLocal;
            }
            localStorage.setItem(getActiveStorageKey(), JSON.stringify(appData));
            await pushToCloud();
        }

        document.getElementById('authModal').classList.add('hidden');
        document.getElementById('authForm').reset();
        updateAccountHeaderUI();
        setSyncBadgeState('synced', '☁️ Synced');
        renderApp();
    } catch (err) {
        errEl.innerText = 'Network error. Please try again.';
        errEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
    }
}

function handleAccountButtonClick() {
    if (authSession && authSession.username) {
        if (confirm(`Logged in as "${authSession.username}". Do you want to log out on this device?`)) {
            authSession = null;
            localStorage.removeItem('timeLedgerSession');
            appData = getDefaultAppData();
            updateAccountHeaderUI();
            setSyncBadgeState('offline', '☁️ Logged Out');
            renderApp();
            document.getElementById('authModal').classList.remove('hidden');
        }
    } else {
        document.getElementById('authModal').classList.remove('hidden');
    }
}
// Initial local render + immediate cloud sync
renderApp();
pullFromCloud();

// Auto-pull latest data whenever you switch back to this tab on phone or laptop
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        pullFromCloud();
    }
});
