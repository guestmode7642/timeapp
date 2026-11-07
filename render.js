// ==========================================================================
// UI RENDER ENGINE
// ==========================================================================

function renderApp() {
    const metrics = calculateMetrics();

    if (appData.tenure.start && appData.tenure.end) {
        const startObj = new Date(appData.tenure.start);
        const endObj = new Date(appData.tenure.end);
        const displayEndObj = (endObj.getHours() === 0 && endObj.getMinutes() === 0 && endObj > startObj)
            ? new Date(endObj.getTime() - 1)
            : endObj;
        document.getElementById('headerTenureSub').innerText = `Tenure: ${startObj.toLocaleDateString()} to ${displayEndObj.toLocaleDateString()}`;
        document.getElementById('startDate').value = appData.tenure.start;
        document.getElementById('endDate').value = appData.tenure.end;
    }

    document.getElementById('statTotalHours').innerText = formatHours(metrics.totalHours);
    document.getElementById('statBurnedHours').innerText = formatHours(metrics.burnedHours);
    const burnedPct = metrics.totalHours > 0 ? ((metrics.burnedHours / metrics.totalHours) * 100).toFixed(1) : 0;
    document.getElementById('statBurnedPercent').innerText = `${burnedPct}% of tenure`;
    document.getElementById('statAvailableBalance').innerText = formatHours(metrics.availableBalance);

    const bufferEl = document.getElementById('statBufferHours');
    bufferEl.innerText = formatHours(metrics.bufferHours);
    if (metrics.bufferHours < 0) {
        bufferEl.classList.add('danger');
    } else {
        bufferEl.classList.remove('danger');
    }

    if (appData.tenure.start && appData.tenure.end) {
        document.getElementById('statTenureDates').innerText = `${metrics.daysCount.toFixed(1)} total days`;
    }

    renderTodayBanner();
    renderCategorySelectAndList();
    renderTasksTable();
    renderTemplatesList();
    renderTaskQueueList();

    const fromInput = document.getElementById('logFromTime');
    if (!fromInput.value && appData.tasks.length > 0) {
        const sortedTasks = [...appData.tasks].sort((a, b) => new Date(b.from) - new Date(a.from));
        const latestTask = sortedTasks[0];
        fromInput.value = toLocalDatetimeString(latestTask.to);
    } else if (!fromInput.value && appData.tenure.start) {
        fromInput.value = appData.tenure.start;
    }
}

function renderTodayBanner() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.getElementById('todayDateStr').innerText = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

    const timetableContainer = document.getElementById('todayTimetableList');
    timetableContainer.innerHTML = '';

    const tplId = appData.dayMappings[todayStr];
    if (tplId) {
        const tpl = appData.templates.find(t => t.id === tplId);
        if (tpl) {
            document.getElementById('todayTemplateName').innerHTML = `<span class="color-dot" style="background-color: ${tpl.color}"></span> ${tpl.name}`;

            if (!tpl.blocks || tpl.blocks.length === 0) {
                timetableContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No hourly schedule blocks added to this template yet.</div>`;
                return;
            }

            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const sortedBlocks = [...tpl.blocks].sort((a, b) => a.start.localeCompare(b.start));

            sortedBlocks.forEach(b => {
                const cat = appData.categories.find(c => c.id === b.categoryId) || { name: 'Task', color: '#8b5cf6' };
                const [startH, startM] = b.start.split(':').map(Number);
                const [endH, endM] = b.end.split(':').map(Number);
                const blockStartMins = startH * 60 + startM;
                let blockEndMins = endH * 60 + endM;

                if (blockEndMins === 0 && blockStartMins > 0) {
                    blockEndMins = 1440;
                }

                const isActive = currentMinutes >= blockStartMins && currentMinutes < blockEndMins;
                const div = document.createElement('div');
                div.className = `schedule-block-card ${isActive ? 'live' : ''}`;
                div.onclick = () => prefillLogFromBlock(todayStr, b.start, b.end, b.categoryId, b.label);

                div.innerHTML = `
                    <div style="min-width: 0;">
                        <div class="block-title-row">
                            <span class="color-dot" style="background-color: ${cat.color}"></span>
                            <span>${b.label}</span>
                            ${isActive ? '<span class="live-pill">● LIVE NOW</span>' : ''}
                        </div>
                        <div class="block-time-row">${b.start} ➔ ${b.end} (${cat.name})</div>
                    </div>
                    <span class="log-chip">Log ➔</span>
                `;
                timetableContainer.appendChild(div);
            });
            return;
        }
    }
    document.getElementById('todayTemplateName').innerText = "No schedule template mapped for today";
    timetableContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Map a schedule template to today's date in the <strong>Schedules</strong> tab to view your timetable here.</div>`;
}

function renderCategorySelectAndList() {
    const select = document.getElementById('logCategory');
    select.innerHTML = '';

    const blockCatSelect = document.getElementById('blockCategorySelect');
    blockCatSelect.innerHTML = '';

    const catListContainer = document.getElementById('categoryListContainer');
    catListContainer.innerHTML = '';

    const breakdownContainer = document.getElementById('categoryBreakdownList');
    breakdownContainer.innerHTML = '';

    const metrics = calculateMetrics();

    appData.categories.forEach(cat => {
        const opt1 = document.createElement('option');
        opt1.value = cat.id;
        opt1.innerText = cat.name;
        select.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = cat.id;
        opt2.innerText = cat.name;
        blockCatSelect.appendChild(opt2);

        const totalBudget = metrics.categoryBudgets[cat.id] || 0;

        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.65rem;">
                <span class="color-dot" style="background-color: ${cat.color}"></span>
                <div>
                    <h4 style="font-size:0.88rem; font-weight:800; color:#fff;">${cat.name}</h4>
                    <span class="font-mono" style="font-size:0.75rem; color:var(--text-secondary);">Budget: ${totalBudget.toFixed(1)} hrs</span>
                </div>
            </div>
            <div class="btn-row">
                ${cat.id !== 'cat-unassigned' ? `<button onclick="editCategory('${cat.id}')" class="btn btn-secondary btn-sm">Edit</button>` : ''}
                ${cat.id !== 'cat-unassigned' ? `<button onclick="deleteCategory('${cat.id}')" class="btn-icon-delete">✕</button>` : ''}
            </div>
        `;
        catListContainer.appendChild(card);

        let catLoggedHours = 0;
        const tStart = appData.tenure.start ? new Date(appData.tenure.start).getTime() : null;
        const tEnd = appData.tenure.end ? new Date(appData.tenure.end).getTime() : null;

        appData.tasks.forEach(t => {
            const f = new Date(t.from);
            const to = new Date(t.to);
            if (!isNaN(f) && !isNaN(to) && to > f) {
                const overlapStart = tStart ? Math.max(f.getTime(), tStart) : f.getTime();
                const overlapEnd = tEnd ? Math.min(to.getTime(), tEnd) : to.getTime();
                if (overlapEnd <= overlapStart) return;
                const totalTaskHours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
                if (t.splits) {
                    t.splits.forEach(s => {
                        if (s.categoryId === cat.id) {
                            catLoggedHours += totalTaskHours * (s.percentage / 100);
                        }
                    });
                } else if (t.categoryId === cat.id) {
                    catLoggedHours += totalTaskHours;
                }
            }
        });

        let pct = totalBudget > 0 ? Math.min(100, (catLoggedHours / totalBudget) * 100) : 0;
        pct = totalBudget - catLoggedHours < 0 ? 100 : pct;

        const bar = document.createElement('div');
        bar.className = 'breakdown-card';
        bar.innerHTML = `
            <div class="breakdown-top">
                <span style="display:flex; align-items:center; gap:0.45rem; color:#fff;">
                    <span class="color-dot" style="background-color: ${cat.color}"></span>
                    ${cat.name}
                </span>
                <span class="font-mono" style="font-size:0.76rem; color:var(--text-secondary);">${formatHours(catLoggedHours)} / ${formatHours(totalBudget)}</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%; background-color: ${cat.color}"></div>
            </div>
        `;
        breakdownContainer.appendChild(bar);
    });
}

function renderTasksTable() {
    const tbody = document.getElementById('logsTableBody');
    const mobileList = document.getElementById('logsMobileListBody');
    tbody.innerHTML = '';
    mobileList.innerHTML = '';

    if (appData.tasks.length === 0) {
        const emptyMsg = `<div class="empty-state">No time blocks logged yet.</div>`;
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No time blocks logged yet.</td></tr>`;
        mobileList.innerHTML = emptyMsg;
        return;
    }

    const sorted = [...appData.tasks].sort((a, b) => new Date(b.from) - new Date(a.from));

    sorted.forEach(t => {
        let primaryCatId = t.categoryId;
        let splitBadgeText = '';

        if (t.splits && t.splits.length > 0) {
            primaryCatId = t.splits[0].categoryId;
            if (t.splits.length > 1) {
                splitBadgeText = ` <span class="split-badge">Split (${t.splits.length})</span>`;
            }
        }

        const cat = appData.categories.find(c => c.id === primaryCatId) || { name: 'Unknown', color: '#71717a' };
        const f = new Date(t.from);
        const to = new Date(t.to);

        const isPointInTime = (t.from === t.to);
        const durationDisplay = isPointInTime
            ? `<span style="color:#34d399; font-weight:700;">Completed ✓</span>`
            : `${((to - f) / (1000 * 60 * 60)).toFixed(1)} hrs`;

        const timeDisplay = isPointInTime
            ? `<span class="time-pill">${f.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`
            : `<span class="time-pill">${f.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ➔ ${to.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`;

        const taskTitle = t.title || t.note || '-';
        const taskDesc = (t.title && t.note) ? t.note : '';

        // Desktop Row
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#fff;">
                    <span class="color-dot" style="background-color: ${cat.color}"></span>
                    <span>${cat.name}</span>
                    ${splitBadgeText}
                </div>
            </td>
            <td class="font-mono" style="color:#d8b4fe; font-weight:700;">${durationDisplay}</td>
            <td>${timeDisplay}</td>
            <td>
                <div style="font-weight:700; color:#fff;">${taskTitle}</div>
                ${taskDesc ? `<div style="font-size:0.74rem; color:var(--text-secondary);">${taskDesc}</div>` : ''}
            </td>
            <td class="text-right"><button onclick="deleteTask('${t.id}')" class="btn-icon-delete">✕</button></td>
        `;
        tbody.appendChild(tr);

        // Mobile Card
        const card = document.createElement('div');
        card.className = 'mobile-log-card';
        card.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#fff;">
                    <span class="color-dot" style="background-color: ${cat.color}"></span>
                    <span>${cat.name}</span>
                    ${splitBadgeText}
                </div>
                <span class="font-mono" style="color:#d8b4fe; font-weight:700;">${durationDisplay}</span>
            </div>
            <div>${timeDisplay}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding-top:0.4rem; border-top:1px solid var(--border-subtle);">
                <div style="min-width:0;">
                    <div style="font-weight:700; color:#fff;">📝 ${taskTitle}</div>
                    ${taskDesc ? `<div style="font-size:0.74rem; color:var(--text-secondary);">${taskDesc}</div>` : ''}
                </div>
                <button onclick="deleteTask('${t.id}')" class="btn-icon-delete">Delete ✕</button>
            </div>
        `;
        mobileList.appendChild(card);
    });
}

function renderTemplatesList() {
    const container = document.getElementById('templateListContainer');
    container.innerHTML = '';

    const tplSelect = document.getElementById('blockTemplateSelect');
    const currentSelectedTpl = tplSelect.value;
    tplSelect.innerHTML = '';

    const catSelect = document.getElementById('blockCategorySelect');
    const currentSelectedCat = catSelect.value;
    catSelect.innerHTML = '';

    appData.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.name;
        catSelect.appendChild(opt);
    });
    if (currentSelectedCat) catSelect.value = currentSelectedCat;

    appData.templates.forEach(tpl => {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.innerText = tpl.name;
        tplSelect.appendChild(opt);

        const div = document.createElement('div');
        div.className = 'template-card';

        let blocksHtml = '';
        if (tpl.blocks && tpl.blocks.length > 0) {
            const sortedBlocks = [...tpl.blocks].sort((a, b) => a.start.localeCompare(b.start));
            blocksHtml = sortedBlocks.map(b => {
                const cat = appData.categories.find(c => c.id === b.categoryId) || { name: 'Cat' };
                return `
                    <div class="template-block-row">
                        <span style="color:var(--text-primary);"><strong class="font-mono" style="color:#fff;">${b.start}-${b.end}</strong>: ${b.label} <span style="color:var(--text-secondary);">(${cat.name})</span></span>
                        <div class="btn-row">
                            <button onclick="editBlock('${tpl.id}', '${b.id}')" class="btn btn-secondary btn-sm">Edit</button>
                            <button onclick="deleteBlock('${tpl.id}', '${b.id}')" class="btn-icon-delete">✕</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            blocksHtml = `<p class="empty-state">No hourly schedule blocks added yet.</p>`;
        }

        div.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:0.5rem; border-bottom:1px solid var(--border-subtle);">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="color-dot" style="background-color: ${tpl.color}"></span>
                    <span style="font-weight:800; color:#fff;">${tpl.name}</span>
                </div>
                <div class="btn-row">
                    <button onclick="duplicateTemplate('${tpl.id}')" class="btn btn-copy btn-sm">Copy</button>
                    <button onclick="editTemplate('${tpl.id}')" class="btn btn-secondary btn-sm">Edit</button>
                    <button onclick="deleteTemplate('${tpl.id}')" class="btn-icon-delete">✕</button>
                </div>
            </div>
            <div class="stack-sm">
                ${blocksHtml}
            </div>
        `;
        container.appendChild(div);
    });

    if (currentSelectedTpl) tplSelect.value = currentSelectedTpl;
}

function renderTaskQueueList() {
    const container = document.getElementById('taskQueueList');
    const catSelect = document.getElementById('queueTaskCategory');
    const filterCatSelect = document.getElementById('taskFilterCategory');
    const searchInput = document.getElementById('taskSearchInput');
    const timelineSelect = document.getElementById('taskFilterTimeline');

    if (!container || !catSelect) return;

    const currentCatSelection = catSelect.value;
    const currentFilterCat = filterCatSelect ? filterCatSelect.value : 'all';

    catSelect.innerHTML = '';
    filterCatSelect.innerHTML = '<option value="all">📂 All Categories</option>';

    appData.categories.forEach(cat => {
        const opt1 = document.createElement('option');
        opt1.value = cat.id;
        opt1.innerText = cat.name;
        catSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = cat.id;
        opt2.innerText = cat.name;
        filterCatSelect.appendChild(opt2);
    });

    if (currentCatSelection) catSelect.value = currentCatSelection;
    if (currentFilterCat) filterCatSelect.value = currentFilterCat;

    container.innerHTML = '';
    if (!appData.tasksQueue) appData.tasksQueue = [];

    const searchText = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCatFilter = filterCatSelect ? filterCatSelect.value : 'all';
    const selectedTimelineFilter = timelineSelect ? timelineSelect.value : 'all';

    const activeTasks = appData.tasksQueue.filter(t => {
        if (t.completed) return false;
        const tTitle = (t.title || t.text || '').toLowerCase();
        const tDesc = (t.description || '').toLowerCase();
        if (searchText && !tTitle.includes(searchText) && !tDesc.includes(searchText)) return false;
        if (selectedCatFilter !== 'all' && t.categoryId !== selectedCatFilter) return false;

        const effectiveHorizon = getEffectiveHorizon(t.deadline);
        if (selectedTimelineFilter !== 'all' && effectiveHorizon !== selectedTimelineFilter) return false;

        return true;
    });

    const totalPending = appData.tasksQueue.filter(t => !t.completed).length;
    document.getElementById('pendingTaskQueueCount').innerText = `${totalPending} Pending`;

    if (activeTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">No pending tasks match your filter criteria.</div>`;
        return;
    }

    const sortedTasks = [...activeTasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    sortedTasks.forEach(task => {
        const cat = appData.categories.find(c => c.id === task.categoryId) || { name: 'General', color: '#71717a' };
        const deadlineDate = new Date(task.deadline);
        const formattedDeadline = deadlineDate.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const effectiveHorizon = getEffectiveHorizon(task.deadline);
        let badgeHtml = '';
        let urgencyClass = '';

        if (effectiveHorizon === 'day') {
            badgeHtml = `<span class="urgency-pill day">🔥 Within a Day</span>`;
            urgencyClass = 'urgency-day';
        } else if (effectiveHorizon === 'week') {
            badgeHtml = `<span class="urgency-pill week">📌 Within a Week</span>`;
            urgencyClass = 'urgency-week';
        } else if (effectiveHorizon === 'month') {
            badgeHtml = `<span class="urgency-pill month">⏳ Within a Month</span>`;
        } else {
            badgeHtml = `<span class="urgency-pill year">📅 Within a Year</span>`;
        }

        const displayTitle = task.title || task.text;
        const displayDesc = task.description || '';

        const div = document.createElement('div');
        div.className = `task-queue-card ${urgencyClass}`;
        div.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.65rem; min-width:0;">
                <span class="color-dot" style="background-color: ${cat.color}; margin-top:0.35rem;"></span>
                <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; font-weight:800; color:#fff;">
                        <span>${displayTitle}</span>
                        ${badgeHtml}
                    </div>
                    ${displayDesc ? `<p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">${displayDesc}</p>` : ''}
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">
                        Due: <strong class="font-mono" style="color:#fff;">${formattedDeadline}</strong> • <span>${cat.name}</span>
                    </div>
                </div>
            </div>
            <div class="btn-row">
                <button onclick="editQueueTask('${task.id}')" class="btn btn-secondary btn-sm">Edit</button>
                <button onclick="completeQueueTaskDirectly('${task.id}')" class="btn btn-success btn-sm">Done ✓</button>
                <button onclick="deleteQueueTask('${task.id}')" class="btn-icon-delete">✕</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderCalendarMatrix() {
    const container = document.getElementById('calendarGridView');
    const startStr = appData.tenure.start;
    const endStr = appData.tenure.end;

    if (!startStr || !endStr) {
        container.innerHTML = `<p class="empty-state">Please define your Tenure Start and End dates in the setup tab first.</p>`;
        return;
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);

    if (endDate <= startDate) {
        container.innerHTML = `<p class="empty-state">Invalid tenure range.</p>`;
        return;
    }

    let monthsMap = {};
    let curr = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDateObj = new Date(endStr);

    while (curr < endDateObj) {
        const yearMonthKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
        if (!monthsMap[yearMonthKey]) monthsMap[yearMonthKey] = [];
        monthsMap[yearMonthKey].push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
    }

    container.innerHTML = '';

    for (let ym in monthsMap) {
        const [y, m] = ym.split('-');
        const monthName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const monthDiv = document.createElement('div');
        monthDiv.className = 'calendar-month-card';
        monthDiv.innerHTML = `<h4 class="calendar-month-title">${monthName}</h4>`;

        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
            const dh = document.createElement('div');
            dh.className = 'calendar-dow';
            dh.innerText = d;
            grid.appendChild(dh);
        });

        const firstDayIndex = monthsMap[ym][0].getDay();
        for (let i = 0; i < firstDayIndex; i++) {
            grid.appendChild(document.createElement('div'));
        }

        monthsMap[ym].forEach(dateObj => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;

            const now = new Date();
            const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const isToday = (dateKey === todayKey);
            const isPast = (dateKey < todayKey);

            const dayNum = dateObj.getDate();
            const assignedTplId = appData.dayMappings[dateKey];
            let tplColor = '#27272a';

            if (assignedTplId) {
                const tpl = appData.templates.find(t => t.id === assignedTplId);
                if (tpl) tplColor = tpl.color;
            }

            const isSelected = selectedDatesSet.has(dateKey);

            const dayBox = document.createElement('div');
            dayBox.className = `calendar-day-tile ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${(isPast && !isSelected && !isToday) ? 'is-past' : ''}`;
            dayBox.style.backgroundColor = assignedTplId ? `${tplColor}28` : '#121626';

            dayBox.innerHTML = `
                <span class="day-num">${dayNum}</span>
                <span class="tpl-indicator-bar" style="background-color: ${tplColor}"></span>
            `;

            dayBox.onclick = () => {
                if (selectedDatesSet.has(dateKey)) {
                    selectedDatesSet.delete(dateKey);
                } else {
                    selectedDatesSet.add(dateKey);
                }
                renderCalendarMatrix();
                updateAssignmentBar();
            };

            grid.appendChild(dayBox);
        });

        monthDiv.appendChild(grid);
        container.appendChild(monthDiv);
    }

    updateAssignmentBar();
    renderAssignButtons();
}

function updateAssignmentBar() {
    document.getElementById('selectedCountText').innerText = `${selectedDatesSet.size} days selected`;
}

function renderAssignButtons() {
    const container = document.getElementById('assignButtonsContainer');
    container.innerHTML = '';

    if (appData.templates.length === 0) {
        container.innerHTML = `<span style="font-size:0.78rem; color:var(--text-secondary);">Create a template first</span>`;
        return;
    }

    appData.templates.forEach(tpl => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.style.backgroundColor = tpl.color;
        btn.style.color = '#ffffff';
        btn.innerHTML = `Map to ${tpl.name}`;
        btn.onclick = () => assignSelectedDays(tpl.id);
        container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.innerText = 'Clear Mappings';
    clearBtn.onclick = () => assignSelectedDays(null);
    container.appendChild(clearBtn);
}

// --- Dynamic Dual Slider + Number Input Split Engine ---
function rebuildSplitRows() {
    const count = parseInt(document.getElementById('splitCountSelect').value) || 1;
    const container = document.getElementById('dynamicSplitRows');
    container.innerHTML = '';

    let categoryOptionsHtml = '';
    appData.categories.forEach(cat => {
        categoryOptionsHtml += `<option value="${cat.id}">${cat.name}</option>`;
    });

    const primaryCatId = document.getElementById('logCategory').value;
    const defaultShare = Math.floor(100 / (count + 1));

    function getBlockDurationHrs() {
        const from = document.getElementById('logFromTime').value;
        const to = document.getElementById('logToTime').value;
        if (!from || !to) return 0;
        const f = new Date(from);
        const t = new Date(to);
        if (isNaN(f) || isNaN(t) || t <= f) return 0;
        return (t - f) / (1000 * 60 * 60);
    }

    window.syncSplitInput = function(sourceElement, index) {
        const sliders = document.querySelectorAll('.split-slider');
        const inputs = document.querySelectorAll('.split-pct-input');
        const timeLabels = document.querySelectorAll('.split-time-label');

        let val = parseInt(sourceElement.value) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;

        sliders[index].value = val;
        inputs[index].value = val;

        const totalHrs = getBlockDurationHrs();
        const calculatedHrs = totalHrs * (val / 100);
        timeLabels[index].innerText = `≈ ${formatHours(calculatedHrs)}`;

        updateSplitMath();
    };

    const primaryRow = document.createElement('div');
    primaryRow.className = 'split-row-card primary';
    primaryRow.innerHTML = `
        <div class="split-row-top">
            <span>Category #1 (Primary)</span>
            <span class="split-time-label font-mono">≈ 0 hrs</span>
        </div>
        <div class="split-row-controls">
            <select id="splitPrimaryCatSelect" onchange="syncPrimaryCategoryDropdown()" class="form-select">
                ${categoryOptionsHtml}
            </select>
            <input type="number" min="0" max="100" value="${defaultShare}" oninput="syncSplitInput(this, 0)" class="split-pct-input form-input font-mono">
            <span class="font-mono">%</span>
        </div>
        <input type="range" min="0" max="100" value="${defaultShare}" oninput="syncSplitInput(this, 0)" class="split-slider">
    `;
    container.appendChild(primaryRow);
    document.getElementById('splitPrimaryCatSelect').value = primaryCatId;

    for (let i = 1; i <= count; i++) {
        const row = document.createElement('div');
        row.className = 'split-row-card';
        row.innerHTML = `
            <div class="split-row-top">
                <span>Category #${i + 1}</span>
                <span class="split-time-label font-mono">≈ 0 hrs</span>
            </div>
            <div class="split-row-controls">
                <select class="split-cat-select form-select">
                    ${categoryOptionsHtml}
                </select>
                <input type="number" min="0" max="100" value="${defaultShare}" oninput="syncSplitInput(this, ${i})" class="split-pct-input form-input font-mono">
                <span class="font-mono">%</span>
            </div>
            <input type="range" min="0" max="100" value="${defaultShare}" oninput="syncSplitInput(this, ${i})" class="split-slider">
        `;
        container.appendChild(row);
    }

    const initialInputs = document.querySelectorAll('.split-pct-input');
    initialInputs.forEach((inp, idx) => {
        window.syncSplitInput(inp, idx);
    });

    updateSplitMath();
}

function updateSplitMath() {
    const pctInputs = document.querySelectorAll('.split-pct-input');
    let totalAssigned = 0;
    pctInputs.forEach(input => {
        totalAssigned += parseInt(input.value) || 0;
    });

    const isSplitEnabled = document.getElementById('enableSplitToggle').checked;
    if (!isSplitEnabled) {
        totalAssigned = 100;
    }

    const remainder = 100 - totalAssigned;
    const label = document.getElementById('bufferRemainderLabel');
    label.innerText = remainder < 0 ? `${remainder}% (Over 100%!)` : `${remainder}%`;

    if (remainder < 0) {
        label.classList.add('danger');
        label.classList.remove('warning');
    } else {
        label.classList.remove('danger');
        label.classList.add('warning');
    }
}
