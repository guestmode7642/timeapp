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
    renderTodayChecklists();

    const fromInput = document.getElementById('logFromTime');
    if (!fromInput.value && appData.tasks.length > 0) {
        const sortedTasks = [...appData.tasks].sort((a, b) => new Date(b.from) - new Date(a.from));
        const latestTask = sortedTasks[0];
        fromInput.value = toLocalDatetimeString(latestTask.to);
    } else if (!fromInput.value && appData.tenure.start) {
        fromInput.value = appData.tenure.start;
    }
}

function isScheduleBlockCompleted(dateStr, startTime, endTime, categoryId) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    if (endMins === 0 && startMins > 0) {
        endMins = 1440;
    }
    if (endMins <= startMins) return false;

    const blockStartMs = new Date(y, m - 1, d, 0, startMins, 0, 0).getTime();
    const blockEndMs = new Date(y, m - 1, d, 0, endMins, 0, 0).getTime();

    // Collect logged intervals for this category that overlap the block window
    const intervals = [];
    (appData.tasks || []).forEach(t => {
        const f = new Date(t.from).getTime();
        const to = new Date(t.to).getTime();
        if (isNaN(f) || isNaN(to) || to <= f) return;

        const matchesCategory = (t.categoryId === categoryId) ||
            (Array.isArray(t.splits) && t.splits.some(s => s.categoryId === categoryId && s.percentage > 0));
        if (!matchesCategory) return;

        const overlapStart = Math.max(f, blockStartMs);
        const overlapEnd = Math.min(to, blockEndMs);
        if (overlapEnd > overlapStart) {
            intervals.push([overlapStart, overlapEnd]);
        }
    });

    if (intervals.length === 0) return false;

    // Merge overlapping/contiguous logged intervals and check if they cover the entire block
    intervals.sort((a, b) => a[0] - b[0]);
    let coveredMs = 0;
    let [curStart, curEnd] = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const [nextStart, nextEnd] = intervals[i];
        if (nextStart <= curEnd) {
            curEnd = Math.max(curEnd, nextEnd);
        } else {
            coveredMs += (curEnd - curStart);
            [curStart, curEnd] = [nextStart, nextEnd];
        }
    }
    coveredMs += (curEnd - curStart);

    return coveredMs >= (blockEndMs - blockStartMs);
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
                const subs = getCategorySubcategories(cat);
                const subObj = subs.find(s => s.id === b.subcategoryId);
                const subLabel = (subObj && subObj.id !== 'sub_general') ? ` ➔ ${subObj.name}` : '';

                const userSplits = Array.isArray(b.splits) ? b.splits.filter(s => !s.isRemainder) : [];
                const hasCustomSplits = userSplits.length > 1 || (userSplits.length === 1 && userSplits[0].percentage < 99.9);
                const splitTagHtml = hasCustomSplits
                    ? ` <span class="split-badge">Split (${userSplits.length})</span>`
                    : '';

                const [startH, startM] = b.start.split(':').map(Number);
                const [endH, endM] = b.end.split(':').map(Number);
                const blockStartMins = startH * 60 + startM;
                let blockEndMins = endH * 60 + endM;

                if (blockEndMins === 0 && blockStartMins > 0) {
                    blockEndMins = 1440;
                }

                const isActive = currentMinutes >= blockStartMins && currentMinutes < blockEndMins;
                const isCompleted = isScheduleBlockCompleted(todayStr, b.start, b.end, b.categoryId);

                const div = document.createElement('div');
                div.className = `schedule-block-card ${isActive ? 'live' : ''} ${isCompleted ? 'is-completed' : ''}`;
                if (!isActive) {
                    div.style.background = `linear-gradient(135deg, ${cat.color}38, var(--bg-panel))`;
                    div.style.borderColor = `${cat.color}88`;
                    div.style.boxShadow = `0 0 20px -6px ${cat.color}40`;
                }

                if (!isCompleted) {
                    div.onclick = () => prefillLogFromBlock(todayStr, b.start, b.end, b.categoryId, b.label, b.id);
                } else {
                    div.style.cursor = 'default';
                }

                div.innerHTML = `
                    <div style="min-width: 0;">
                        <div class="block-title-row">
                            <span class="color-dot" style="background-color: ${cat.color}"></span>
                            <span>${b.label}</span>
                            ${splitTagHtml}
                            ${isActive ? '<span class="live-pill">● LIVE NOW</span>' : ''}
                        </div>
                        <div class="block-time-row">${b.start} ➔ ${b.end} (${cat.name}${subLabel})</div>
                    </div>
                    ${isCompleted
                        ? '<span class="done-chip">Done ✓</span>'
                        : '<span class="log-chip">Log ➔</span>'}
                `;
                timetableContainer.appendChild(div);
            });
            return;
        }
    }
    document.getElementById('todayTemplateName').innerText = "No schedule template mapped for today";
    timetableContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Map a schedule template to today's date in the <strong>Schedules</strong> tab to view your timetable here.</div>`;
}

function populateSubcategorySelect(selectEl, categoryId, selectedSubId = 'sub_general') {
    if (!selectEl) return;
    const cat = appData.categories.find(c => c.id === categoryId);
    const subs = getCategorySubcategories(cat);
    selectEl.innerHTML = '';
    subs.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.innerText = sub.name;
        selectEl.appendChild(opt);
    });
    if (subs.some(s => s.id === selectedSubId)) {
        selectEl.value = selectedSubId;
    } else {
        selectEl.value = 'sub_general';
    }
}

function renderCategoryDraftSubcategories() {
    const container = document.getElementById('catDraftSubcategoriesList');
    if (!container) return;
    container.innerHTML = '';

    if (!currentCategoryDraftSubcategories || currentCategoryDraftSubcategories.length === 0) {
        return;
    }

    currentCategoryDraftSubcategories.forEach((sub, idx) => {
        const div = document.createElement('div');
        div.className = 'template-block-row';
        div.innerHTML = `
            <span style="font-weight:700; color:#fff; font-size:0.8rem;">${idx + 1}. ${sub.name}</span>
            <div class="btn-row">
                <button type="button" onclick="openSubcategoryEntryBox('${sub.id}')" class="btn btn-secondary btn-sm">Edit</button>
                <button type="button" onclick="deleteDraftSubcategory('${sub.id}')" class="btn-icon-delete">✕</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderCategorySelectAndList() {
    const select = document.getElementById('logCategory');
    const prevLogCat = select.value;
    select.innerHTML = '';

    const blockCatSelect = document.getElementById('blockCategorySelect');
    const prevBlockCat = blockCatSelect.value;
    blockCatSelect.innerHTML = '';

    const catListContainer = document.getElementById('categoryListContainer');
    catListContainer.innerHTML = '';

    const breakdownContainer = document.getElementById('categoryBreakdownList');
    breakdownContainer.innerHTML = '';

    const metrics = calculateMetrics();

    appData.categories.forEach(cat => {
        const subs = getCategorySubcategories(cat);

        const opt1 = document.createElement('option');
        opt1.value = cat.id;
        opt1.innerText = cat.name;
        select.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = cat.id;
        opt2.innerText = cat.name;
        blockCatSelect.appendChild(opt2);

        const totalBudget = metrics.categoryBudgets[cat.id] || 0;
        const customSubs = subs.filter(s => s.id !== 'sub_general');
        const subPillsHtml = customSubs.length > 0
            ? `<div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-top:0.35rem;">
                ${customSubs.map(s => `<span class="split-badge">${s.name}</span>`).join('')}
               </div>`
            : '';

        const card = document.createElement('div');
        card.className = 'item-card';
        card.style.background = `linear-gradient(135deg, ${cat.color}38, var(--bg-panel))`;
        card.style.borderColor = `${cat.color}88`;
        card.style.boxShadow = `0 0 22px -6px ${cat.color}40`;
        card.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.65rem; min-width:0;">
                <span class="color-dot" style="background-color: ${cat.color}; margin-top:0.35rem;"></span>
                <div style="min-width:0;">
                    <h4 style="font-size:0.88rem; font-weight:800; color:#fff;">${cat.name}</h4>
                    ${cat.description ? `<p style="font-size:0.76rem; color:var(--text-secondary); margin-top:0.15rem; word-break:break-word;">${cat.description}</p>` : ''}
                    ${subPillsHtml}
                </div>
            </div>
            <div class="btn-row" style="flex-shrink:0;">
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
                            catLoggedHours += totalTaskHours * ((parseFloat(s.percentage) || 0) / 100);
                        }
                    });
                } else if (t.categoryId === cat.id) {
                    catLoggedHours += totalTaskHours;
                }
            }
        });

        const hasLogged = Math.round(catLoggedHours * 60) > 0;
        const hasBudget = Math.round(Math.abs(totalBudget) * 60) > 0;
        if (!hasLogged && !hasBudget) return;

        let pct = totalBudget > 0 ? Math.min(100, (catLoggedHours / totalBudget) * 100) : 0;
        pct = totalBudget - catLoggedHours < 0 ? 100 : pct;

        const bar = document.createElement('div');
        bar.className = 'breakdown-card clickable';
        bar.style.background = `linear-gradient(135deg, ${cat.color}38, var(--bg-panel))`;
        bar.style.borderColor = `${cat.color}88`;
        bar.style.boxShadow = `0 0 22px -6px ${cat.color}40`;
        bar.onclick = () => openCategoryBreakdownModal(cat.id);
        bar.innerHTML = `
            <div class="breakdown-top">
                <span style="display:flex; align-items:center; gap:0.45rem; color:#fff;">
                    <span class="color-dot" style="background-color: ${cat.color}"></span>
                    <span>${cat.name}</span>
                    <span style="font-size:0.68rem; color:var(--text-muted); font-weight:600;">(View Chart ↗)</span>
                </span>
                <span class="font-mono" style="font-size:0.76rem; color:var(--text-secondary);">${formatHours(catLoggedHours)} / ${formatHours(totalBudget)}</span>
            </div>
            ${cat.description ? `<p style="font-size:0.75rem; color:var(--text-secondary); word-break:break-word;">${cat.description}</p>` : ''}
            <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%; background-color: ${cat.color}"></div>
            </div>
        `;
        breakdownContainer.appendChild(bar);
    });

    if (prevLogCat && appData.categories.some(c => c.id === prevLogCat)) {
        select.value = prevLogCat;
    }
    if (prevBlockCat && appData.categories.some(c => c.id === prevBlockCat)) {
        blockCatSelect.value = prevBlockCat;
    }

    const logSubSelect = document.getElementById('logSubcategory');
    if (logSubSelect) {
        const prevSub = logSubSelect.value;
        populateSubcategorySelect(logSubSelect, select.value, prevSub);
    }
    const blockSubSelect = document.getElementById('blockSubcategorySelect');
    if (blockSubSelect) {
        const prevBlockSub = blockSubSelect.value;
        populateSubcategorySelect(blockSubSelect, blockCatSelect.value, prevBlockSub);
    }
    if (breakdownContainer.children.length === 0) {
        breakdownContainer.innerHTML = `<div class="empty-state">No planned or logged hours for any category yet.</div>`;
    }

    if (activeBreakdownModalCatId) {
        renderCategoryBreakdownModalContent();
    }
}

function formatLogTimestampRange(fromStr, toStr) {
    const f = new Date(fromStr);
    const to = new Date(toStr);
    if (isNaN(f) || isNaN(to)) return '-';

    const now = new Date();
    const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const todayKey = toDateKey(now);
    const yesterdayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayKey = toDateKey(yesterdayObj);

    const getDayLabel = (d) => {
        const key = toDateKey(d);
        if (key === todayKey) return 'Today';
        if (key === yesterdayKey) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const getTimeLabel = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Point-in-time completed action task
    if (fromStr === toStr) {
        return `${getDayLabel(f)}, ${getTimeLabel(f)}`;
    }

    // Same calendar day: show the day label only once
    if (toDateKey(f) === toDateKey(to)) {
        return `${getDayLabel(f)}, ${getTimeLabel(f)} ➔ ${getTimeLabel(to)}`;
    }

    // Spans across multiple days: show both day labels
    return `${getDayLabel(f)}, ${getTimeLabel(f)} ➔ ${getDayLabel(to)}, ${getTimeLabel(to)}`;
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

        const timeDisplay = `<span class="time-pill">${formatLogTimestampRange(t.from, t.to)}</span>`;

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

    // Keep all templates populated in the Block Builder dropdown
    appData.templates.forEach(tpl => {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.innerText = tpl.name;
        tplSelect.appendChild(opt);
    });
    if (currentSelectedTpl) tplSelect.value = currentSelectedTpl;

    // Filter displayed template cards by the search bar query
    const searchInput = document.getElementById('templateSearchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filteredTemplates = appData.templates.filter(tpl => {
        if (!searchQuery) return true;
        if (tpl.name.toLowerCase().includes(searchQuery)) return true;
        return (tpl.blocks || []).some(b => {
            const cat = appData.categories.find(c => c.id === b.categoryId);
            const catName = cat ? cat.name.toLowerCase() : '';
            return (b.label && b.label.toLowerCase().includes(searchQuery)) || catName.includes(searchQuery);
        });
    });

    if (filteredTemplates.length === 0) {
        container.innerHTML = `<div class="empty-state">No templates match your search.</div>`;
        return;
    }

    filteredTemplates.forEach(tpl => {
        const div = document.createElement('div');
        div.className = 'template-card';
        div.style.background = `linear-gradient(135deg, ${tpl.color}38, var(--bg-panel))`;
        div.style.borderColor = `${tpl.color}88`;
        div.style.boxShadow = `0 0 24px -6px ${tpl.color}40`;

        let blocksHtml = '';
        if (tpl.blocks && tpl.blocks.length > 0) {
            const sortedBlocks = [...tpl.blocks].sort((a, b) => a.start.localeCompare(b.start));
            blocksHtml = sortedBlocks.map(b => {
                const cat = appData.categories.find(c => c.id === b.categoryId) || { name: 'Cat' };
                const subs = getCategorySubcategories(cat);
                const subObj = subs.find(s => s.id === b.subcategoryId);
                const subText = (subObj && subObj.id !== 'sub_general') ? ` ➔ ${subObj.name}` : '';

                const userSplits = Array.isArray(b.splits) ? b.splits.filter(s => !s.isRemainder) : [];
                const hasSplits = userSplits.length > 1 || (userSplits.length === 1 && userSplits[0].percentage < 99.9);
                const splitBadge = hasSplits
                    ? ` <span class="split-badge">⚡ Split (${userSplits.length})</span>`
                    : '';

                const chkCount = (b.checklist && b.checklist.length) ? b.checklist.length : 0;
                const chkBadge = chkCount > 0
                    ? ` <span class="split-badge">📋 ${chkCount}</span>`
                    : '';
                return `
                    <div class="template-block-row">
                        <span style="color:var(--text-primary);"><strong class="font-mono" style="color:#fff;">${b.start}-${b.end}</strong>: ${b.label} <span style="color:var(--text-secondary);">(${cat.name}${subText})</span>${splitBadge}${chkBadge}</span>
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

// --- Dynamic Slider + Exact Hours/Minutes + Percentage Split Engine (Logger) ---
function rebuildSplitRows(presetSplits = null) {
    const countSelect = document.getElementById('splitCountSelect');
    if (Array.isArray(presetSplits) && presetSplits.length > 0 && countSelect) {
        const neededCount = Math.max(1, Math.min(4, presetSplits.length - 1));
        countSelect.value = String(neededCount);
    }

    const count = parseInt(countSelect ? countSelect.value : 1) || 1;
    const container = document.getElementById('dynamicSplitRows');
    container.innerHTML = '';

    let categoryOptionsHtml = '';
    appData.categories.forEach(cat => {
        categoryOptionsHtml += `<option value="${cat.id}">${cat.name}</option>`;
    });

    const primaryCatId = document.getElementById('logCategory').value;
    const primarySubId = document.getElementById('logSubcategory')
        ? document.getElementById('logSubcategory').value
        : 'sub_general';
    const defaultShare = parseFloat((100 / (count + 1)).toFixed(1));

    function getBlockDurationMins() {
        const from = document.getElementById('logFromTime').value;
        const to = document.getElementById('logToTime').value;
        if (!from || !to) return 0;
        const f = new Date(from);
        const t = new Date(to);
        if (isNaN(f) || isNaN(t) || t <= f) return 0;
        return Math.round((t - f) / (1000 * 60));
    }

    window.onSplitCategoryChange = function(selectEl, index) {
        const row = selectEl.closest('.split-row-card');
        const subSelect = row ? row.querySelector('.split-sub-dropdown') : null;
        if (subSelect) {
            populateSubcategorySelect(subSelect, selectEl.value);
        }
        if (index === 0) {
            syncPrimaryCategoryDropdown();
        }
    };

    window.syncSplitInput = function(sourceElement, index, mode = 'pct') {
        const sliders = document.querySelectorAll('#dynamicSplitRows .split-slider');
        const pctInputs = document.querySelectorAll('#dynamicSplitRows .split-pct-input');
        const hrsInputs = document.querySelectorAll('#dynamicSplitRows .split-hrs-input');
        const minsInputs = document.querySelectorAll('#dynamicSplitRows .split-mins-input');
        const timeLabels = document.querySelectorAll('#dynamicSplitRows .split-time-label');

        const totalMins = getBlockDurationMins();
        let exactPct = 0;
        let allocatedMins = 0;

        if (mode === 'duration') {
            const h = Math.max(0, parseInt(hrsInputs[index].value) || 0);
            const m = Math.max(0, parseInt(minsInputs[index].value) || 0);
            allocatedMins = h * 60 + m;
            if (totalMins > 0) {
                if (allocatedMins > totalMins) allocatedMins = totalMins;
                exactPct = (allocatedMins / totalMins) * 100;
            } else {
                exactPct = 0;
            }
            sliders[index].value = exactPct.toFixed(2);
            pctInputs[index].value = Number(exactPct.toFixed(1));
            pctInputs[index].dataset.exactPct = exactPct;
            hrsInputs[index].value = Math.floor(allocatedMins / 60);
            minsInputs[index].value = allocatedMins % 60;
        } else {
            let val = parseFloat(sourceElement ? (sourceElement.dataset.exactPct ?? sourceElement.value) : pctInputs[index].value) || 0;
            if (sourceElement && mode !== 'init') {
                val = parseFloat(sourceElement.value) || 0;
            }
            if (val < 0) val = 0;
            if (val > 100) val = 100;
            exactPct = val;

            sliders[index].value = exactPct;
            pctInputs[index].value = Number(exactPct.toFixed(1));
            pctInputs[index].dataset.exactPct = exactPct;

            allocatedMins = Math.round(totalMins * (exactPct / 100));
            if (hrsInputs[index] && minsInputs[index]) {
                hrsInputs[index].value = Math.floor(allocatedMins / 60);
                minsInputs[index].value = allocatedMins % 60;
            }
        }

        const calculatedHrs = allocatedMins / 60;
        timeLabels[index].innerText = `≈ ${formatHours(calculatedHrs)}`;

        updateSplitMath();
    };

    const buildRowHtml = (index, isPrimary, shareVal) => `
        <div class="split-row-top">
            <span>${isPrimary ? 'Category #1 (Primary)' : `Category #${index + 1}`}</span>
            <span class="split-time-label font-mono">≈ 0 hrs</span>
        </div>
        <div class="split-row-selects">
            <select ${isPrimary ? 'id="splitPrimaryCatSelect"' : ''} class="${isPrimary ? '' : 'split-cat-select'} form-select" onchange="onSplitCategoryChange(this, ${index})">
                ${categoryOptionsHtml}
            </select>
            <select ${isPrimary ? 'id="splitPrimarySubSelect"' : ''} class="${isPrimary ? '' : 'split-subcat-select'} split-sub-dropdown form-select" ${isPrimary ? 'onchange="syncPrimaryCategoryDropdown()"' : ''}>
            </select>
        </div>
        <div class="split-duration-bar">
            <div class="split-unit-box" title="Exact Hours">
                <input type="number" min="0" max="999" value="0" oninput="syncSplitInput(this, ${index}, 'duration')" class="split-hrs-input">
                <span class="split-unit-label">hrs</span>
            </div>
            <div class="split-unit-box" title="Exact Minutes">
                <input type="number" min="0" max="59" value="0" oninput="syncSplitInput(this, ${index}, 'duration')" class="split-mins-input">
                <span class="split-unit-label">mins</span>
            </div>
            <div class="split-unit-box" title="Percentage">
                <input type="number" min="0" max="100" step="0.1" value="${Number(shareVal.toFixed(1))}" data-exact-pct="${shareVal}" oninput="syncSplitInput(this, ${index}, 'pct')" class="split-pct-input">
                <span class="split-unit-label">%</span>
            </div>
        </div>
        <input type="range" min="0" max="100" step="0.1" value="${shareVal}" oninput="syncSplitInput(this, ${index}, 'slider')" class="split-slider">
    `;

    const primaryPreset = (Array.isArray(presetSplits) && presetSplits[0]) ? presetSplits[0] : null;
    const primaryShare = primaryPreset ? (parseFloat(primaryPreset.percentage) || 0) : defaultShare;

    const primaryRow = document.createElement('div');
    primaryRow.className = 'split-row-card primary';
    primaryRow.innerHTML = buildRowHtml(0, true, primaryShare);
    container.appendChild(primaryRow);

    const targetPrimaryCat = primaryPreset ? primaryPreset.categoryId : primaryCatId;
    const targetPrimarySub = primaryPreset ? (primaryPreset.subcategoryId || 'sub_general') : primarySubId;
    document.getElementById('splitPrimaryCatSelect').value = targetPrimaryCat;
    populateSubcategorySelect(document.getElementById('splitPrimarySubSelect'), targetPrimaryCat, targetPrimarySub);

    for (let i = 1; i <= count; i++) {
        const preset = (Array.isArray(presetSplits) && presetSplits[i]) ? presetSplits[i] : null;
        const rowShare = preset ? (parseFloat(preset.percentage) || 0) : (Array.isArray(presetSplits) ? 0 : defaultShare);

        const row = document.createElement('div');
        row.className = 'split-row-card';
        row.innerHTML = buildRowHtml(i, false, rowShare);
        container.appendChild(row);

        const catSel = row.querySelector('.split-cat-select');
        const subSel = row.querySelector('.split-subcat-select');
        if (preset && appData.categories.some(c => c.id === preset.categoryId)) {
            catSel.value = preset.categoryId;
            populateSubcategorySelect(subSel, preset.categoryId, preset.subcategoryId || 'sub_general');
        } else {
            populateSubcategorySelect(subSel, catSel.value);
        }
    }

    const initialInputs = document.querySelectorAll('#dynamicSplitRows .split-pct-input');
    initialInputs.forEach((inp, idx) => {
        window.syncSplitInput(inp, idx, 'init');
    });

    updateSplitMath();
}

function updateSplitMath() {
    const pctInputs = document.querySelectorAll('#dynamicSplitRows .split-pct-input');
    let totalAssigned = 0;
    pctInputs.forEach(input => {
        totalAssigned += parseFloat(input.dataset.exactPct ?? input.value) || 0;
    });

    const isSplitEnabled = document.getElementById('enableSplitToggle').checked;
    if (!isSplitEnabled) {
        totalAssigned = 100;
    }

    const remainder = 100 - totalAssigned;
    const roundedRemainder = Math.abs(remainder) < 0.05 ? 0 : Number(remainder.toFixed(1));
    const label = document.getElementById('bufferRemainderLabel');
    label.innerText = roundedRemainder < 0 ? `${roundedRemainder}% (Over 100%!)` : `${roundedRemainder}%`;

    if (roundedRemainder < 0) {
        label.classList.add('danger');
        label.classList.remove('warning');
    } else {
        label.classList.remove('danger');
        label.classList.add('warning');
    }
}

// --- Template Block Split Engine (Schedules Tab) ---
function rebuildBlockSplitRows(presetSplits = null) {
    const countSelect = document.getElementById('blockSplitCountSelect');
    const container = document.getElementById('dynamicBlockSplitRows');
    if (!container || !countSelect) return;

    if (Array.isArray(presetSplits) && presetSplits.length > 0) {
        const neededCount = Math.max(1, Math.min(4, presetSplits.length - 1));
        countSelect.value = String(neededCount);
    }

    const count = parseInt(countSelect.value) || 1;
    container.innerHTML = '';

    let categoryOptionsHtml = '';
    appData.categories.forEach(cat => {
        categoryOptionsHtml += `<option value="${cat.id}">${cat.name}</option>`;
    });

    const primaryCatId = document.getElementById('blockCategorySelect').value;
    const primarySubId = document.getElementById('blockSubcategorySelect')
        ? document.getElementById('blockSubcategorySelect').value
        : 'sub_general';
    const defaultShare = parseFloat((100 / (count + 1)).toFixed(1));

    function getTemplateBlockDurationMins() {
        const start = document.getElementById('blockStartTime').value;
        const end = document.getElementById('blockEndTime').value;
        if (!start || !end) return 0;
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        const sMins = sH * 60 + sM;
        let eMins = eH * 60 + eM;
        if (eMins === 0 && sMins > 0) eMins = 1440;
        return Math.max(0, eMins - sMins);
    }

    window.onBlockSplitCategoryChange = function(selectEl, index) {
        const row = selectEl.closest('.split-row-card');
        const subSelect = row ? row.querySelector('.block-split-sub-dropdown') : null;
        if (subSelect) {
            populateSubcategorySelect(subSelect, selectEl.value);
        }
        if (index === 0) {
            syncBlockPrimaryCategoryDropdown();
        }
    };

    window.syncBlockSplitInput = function(sourceElement, index, mode = 'pct') {
        const sliders = document.querySelectorAll('#dynamicBlockSplitRows .block-split-slider');
        const pctInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-pct-input');
        const hrsInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-hrs-input');
        const minsInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-mins-input');
        const timeLabels = document.querySelectorAll('#dynamicBlockSplitRows .block-split-time-label');

        const totalMins = getTemplateBlockDurationMins();
        let exactPct = 0;
        let allocatedMins = 0;

        if (mode === 'duration') {
            const h = Math.max(0, parseInt(hrsInputs[index].value) || 0);
            const m = Math.max(0, parseInt(minsInputs[index].value) || 0);
            allocatedMins = h * 60 + m;
            if (totalMins > 0) {
                if (allocatedMins > totalMins) allocatedMins = totalMins;
                exactPct = (allocatedMins / totalMins) * 100;
            } else {
                exactPct = 0;
            }
            sliders[index].value = exactPct.toFixed(2);
            pctInputs[index].value = Number(exactPct.toFixed(1));
            pctInputs[index].dataset.exactPct = exactPct;
            hrsInputs[index].value = Math.floor(allocatedMins / 60);
            minsInputs[index].value = allocatedMins % 60;
        } else {
            let val = parseFloat(sourceElement ? (sourceElement.dataset.exactPct ?? sourceElement.value) : pctInputs[index].value) || 0;
            if (sourceElement && mode !== 'init') {
                val = parseFloat(sourceElement.value) || 0;
            }
            if (val < 0) val = 0;
            if (val > 100) val = 100;
            exactPct = val;

            sliders[index].value = exactPct;
            pctInputs[index].value = Number(exactPct.toFixed(1));
            pctInputs[index].dataset.exactPct = exactPct;

            allocatedMins = Math.round(totalMins * (exactPct / 100));
            if (hrsInputs[index] && minsInputs[index]) {
                hrsInputs[index].value = Math.floor(allocatedMins / 60);
                minsInputs[index].value = allocatedMins % 60;
            }
        }

        const calculatedHrs = allocatedMins / 60;
        timeLabels[index].innerText = `≈ ${formatHours(calculatedHrs)}`;

        updateBlockSplitMath();
    };

    const buildBlockRowHtml = (index, isPrimary, shareVal) => `
        <div class="split-row-top">
            <span>${isPrimary ? 'Category #1 (Primary)' : `Split #${index + 1}`}</span>
            <span class="block-split-time-label font-mono">≈ 0 hrs</span>
        </div>
        <div class="split-row-selects">
            <select ${isPrimary ? 'id="blockSplitPrimaryCatSelect"' : ''} class="${isPrimary ? '' : 'block-split-cat-select'} form-select" onchange="onBlockSplitCategoryChange(this, ${index})">
                ${categoryOptionsHtml}
            </select>
            <select ${isPrimary ? 'id="blockSplitPrimarySubSelect"' : ''} class="${isPrimary ? '' : 'block-split-subcat-select'} block-split-sub-dropdown form-select" ${isPrimary ? 'onchange="syncBlockPrimaryCategoryDropdown()"' : ''}>
            </select>
        </div>
        <div class="split-duration-bar">
            <div class="split-unit-box" title="Exact Hours">
                <input type="number" min="0" max="999" value="0" oninput="syncBlockSplitInput(this, ${index}, 'duration')" class="block-split-hrs-input">
                <span class="split-unit-label">hrs</span>
            </div>
            <div class="split-unit-box" title="Exact Minutes">
                <input type="number" min="0" max="59" value="0" oninput="syncBlockSplitInput(this, ${index}, 'duration')" class="block-split-mins-input">
                <span class="split-unit-label">mins</span>
            </div>
            <div class="split-unit-box" title="Percentage">
                <input type="number" min="0" max="100" step="0.1" value="${Number(shareVal.toFixed(1))}" data-exact-pct="${shareVal}" oninput="syncBlockSplitInput(this, ${index}, 'pct')" class="block-split-pct-input">
                <span class="split-unit-label">%</span>
            </div>
        </div>
        <input type="range" min="0" max="100" step="0.1" value="${shareVal}" oninput="syncBlockSplitInput(this, ${index}, 'slider')" class="block-split-slider split-slider">
    `;

    const primaryPreset = (Array.isArray(presetSplits) && presetSplits[0]) ? presetSplits[0] : null;
    const primaryShare = primaryPreset ? (parseFloat(primaryPreset.percentage) || 0) : defaultShare;

    const primaryRow = document.createElement('div');
    primaryRow.className = 'split-row-card primary';
    primaryRow.innerHTML = buildBlockRowHtml(0, true, primaryShare);
    container.appendChild(primaryRow);

    const targetPrimaryCat = primaryPreset ? primaryPreset.categoryId : primaryCatId;
    const targetPrimarySub = primaryPreset ? (primaryPreset.subcategoryId || 'sub_general') : primarySubId;
    document.getElementById('blockSplitPrimaryCatSelect').value = targetPrimaryCat;
    populateSubcategorySelect(document.getElementById('blockSplitPrimarySubSelect'), targetPrimaryCat, targetPrimarySub);

    for (let i = 1; i <= count; i++) {
        const preset = (Array.isArray(presetSplits) && presetSplits[i]) ? presetSplits[i] : null;
        const rowShare = preset ? (parseFloat(preset.percentage) || 0) : (Array.isArray(presetSplits) ? 0 : defaultShare);

        const row = document.createElement('div');
        row.className = 'split-row-card';
        row.innerHTML = buildBlockRowHtml(i, false, rowShare);
        container.appendChild(row);

        const catSel = row.querySelector('.block-split-cat-select');
        const subSel = row.querySelector('.block-split-subcat-select');
        if (preset && appData.categories.some(c => c.id === preset.categoryId)) {
            catSel.value = preset.categoryId;
            populateSubcategorySelect(subSel, preset.categoryId, preset.subcategoryId || 'sub_general');
        } else {
            populateSubcategorySelect(subSel, catSel.value);
        }
    }

    const initialInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-pct-input');
    initialInputs.forEach((inp, idx) => {
        window.syncBlockSplitInput(inp, idx, 'init');
    });

    updateBlockSplitMath();
}

function updateBlockSplitMath() {
    const pctInputs = document.querySelectorAll('#dynamicBlockSplitRows .block-split-pct-input');
    let totalAssigned = 0;
    pctInputs.forEach(input => {
        totalAssigned += parseFloat(input.dataset.exactPct ?? input.value) || 0;
    });

    const toggle = document.getElementById('enableBlockSplitToggle');
    if (!toggle || !toggle.checked) {
        totalAssigned = 100;
    }

    const remainder = 100 - totalAssigned;
    const roundedRemainder = Math.abs(remainder) < 0.05 ? 0 : Number(remainder.toFixed(1));
    const label = document.getElementById('blockBufferRemainderLabel');
    if (!label) return;
    label.innerText = roundedRemainder < 0 ? `${roundedRemainder}% (Over 100%!)` : `${roundedRemainder}%`;

    if (roundedRemainder < 0) {
        label.classList.add('danger');
        label.classList.remove('warning');
    } else {
        label.classList.remove('danger');
        label.classList.add('warning');
    }
}
function renderBlockDraftChecklist() {
    const container = document.getElementById('blockDraftChecklistContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!currentBlockDraftChecklist || currentBlockDraftChecklist.length === 0) {
        return;
    }

    currentBlockDraftChecklist.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'template-block-row';
        div.innerHTML = `
            <div style="min-width:0;">
                <div style="font-weight:700; color:#fff; font-size:0.8rem;">${idx + 1}. ${item.title}</div>
                ${item.description ? `<div style="font-size:0.72rem; color:var(--text-secondary);">${item.description}</div>` : ''}
            </div>
            <div class="btn-row">
                <button type="button" onclick="openChecklistEntryBox('${item.id}')" class="btn btn-secondary btn-sm">Edit</button>
                <button type="button" onclick="deleteDraftChecklistItem('${item.id}')" class="btn-icon-delete">✕</button>
            </div>
        `;
        container.appendChild(div);
    });
}
function renderTodayChecklists() {
    const container = document.getElementById('todayChecklistContainer');
    const subEl = document.getElementById('checklistTemplateSub');
    const countEl = document.getElementById('checklistProgressCount');
    if (!container) return;

    container.innerHTML = '';

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const tplId = appData.dayMappings[todayStr];

    if (!tplId) {
        if (subEl) subEl.innerText = 'No schedule template mapped for today.';
        if (countEl) countEl.innerText = '0 / 0 Done';
        container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Map a template to today's date in the <strong>Schedules</strong> tab to view its checklist here.</div>`;
        return;
    }

    const tpl = appData.templates.find(t => t.id === tplId);
    if (!tpl) {
        if (subEl) subEl.innerText = 'No schedule template mapped for today.';
        if (countEl) countEl.innerText = '0 / 0 Done';
        container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No template found for today.</div>`;
        return;
    }

    if (subEl) {
        subEl.innerHTML = `Active Template: <strong style="color:#fff;">${tpl.name}</strong> (${todayStr})`;
    }

    // Sort blocks in chronological order; each block (point in time) with checklists gets its own box
    const sortedBlocks = [...(tpl.blocks || [])].sort((a, b) => a.start.localeCompare(b.start));
    const blockGroups = [];

    let totalItems = 0;
    let completedItems = 0;

    sortedBlocks.forEach(block => {
        if (!block.checklist || block.checklist.length === 0) return;

        const cat = appData.categories.find(c => c.id === block.categoryId) || {
            id: block.categoryId,
            name: 'Category',
            color: '#6366f1'
        };

        const entries = block.checklist.map(chk => {
            const isDone = Array.isArray(chk.completedDates) && chk.completedDates.includes(todayStr);
            totalItems++;
            if (isDone) completedItems++;

            return {
                tplId: tpl.id,
                blockId: block.id,
                chk
            };
        });

        blockGroups.push({
            category: cat,
            blockTime: `${block.start} ➔ ${block.end}`,
            blockLabel: block.label,
            entries
        });
    });

    if (countEl) {
        countEl.innerText = `${completedItems} / ${totalItems} Done`;
    }

    if (blockGroups.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No checklist items added to <strong>${tpl.name}</strong> yet. Edit any block in the <strong>Schedules</strong> tab and click <strong>+ Add Checklist</strong>.</div>`;
        return;
    }

    blockGroups.forEach(group => {
        const cat = group.category;
        const doneInBox = group.entries.filter(e => Array.isArray(e.chk.completedDates) && e.chk.completedDates.includes(todayStr)).length;

        const box = document.createElement('div');
        box.className = 'checklist-cat-box';
        box.style.background = `linear-gradient(135deg, ${cat.color}42, var(--bg-panel))`;
        box.style.borderColor = `${cat.color}99`;
        box.style.boxShadow = `0 0 24px -6px ${cat.color}45`;

        const itemsHtml = group.entries.map(entry => {
            const isDone = Array.isArray(entry.chk.completedDates) && entry.chk.completedDates.includes(todayStr);
            return `
                <div class="checklist-item-row ${isDone ? 'is-done' : ''}">
                    <label style="display:flex; align-items:flex-start; gap:0.6rem; cursor:pointer; min-width:0; flex:1;">
                        <input type="checkbox" class="form-checkbox" style="margin-top:0.2rem;"
                            ${isDone ? 'checked' : ''}
                            onchange="toggleChecklistItemToday('${entry.tplId}', '${entry.blockId}', '${entry.chk.id}', '${todayStr}')">
                        <div style="min-width:0;">
                            <div class="checklist-item-title">${entry.chk.title}</div>
                            ${entry.chk.description ? `<div class="checklist-item-desc">${entry.chk.description}</div>` : ''}
                        </div>
                    </label>
                    <div class="btn-row" style="flex-shrink:0;">
                        <button onclick="jumpToEditChecklistItem('${entry.tplId}', '${entry.blockId}', '${entry.chk.id}')" class="btn btn-secondary btn-sm">Edit</button>
                        <button onclick="deleteChecklistItemFromToday('${entry.tplId}', '${entry.blockId}', '${entry.chk.id}')" class="btn-icon-delete">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        box.innerHTML = `
            <div class="checklist-cat-header">
                <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:0.5rem; font-weight:800; color:#fff; font-size:0.9rem;">
                        <span class="color-dot" style="background-color: ${cat.color}"></span>
                        <span>${cat.name}</span>
                        <span style="font-size:0.76rem; font-weight:600; color:var(--text-secondary);">• ${group.blockLabel}</span>
                    </div>
                    <div class="font-mono" style="font-size:0.72rem; color:var(--text-secondary); margin-top:0.15rem;">⏰ ${group.blockTime}</div>
                </div>
                <span class="font-mono" style="font-size:0.75rem; font-weight:700; color:#fff; background:rgba(0,0,0,0.35); padding:0.15rem 0.55rem; border-radius:999px; flex-shrink:0;">
                    ${doneInBox}/${group.entries.length}
                </span>
            </div>
            <div class="stack-sm">
                ${itemsHtml}
            </div>
        `;
        container.appendChild(box);
    });
}
// ==========================================================================
// CATEGORY SUBCATEGORY BREAKDOWN MODAL (SVG DONUT CHART + HORIZONTAL BARS)
// ==========================================================================

let activeBreakdownModalCatId = null;
let activeModalPieMode = 'logged'; // 'logged' | 'planned'

const SUB_PIE_PALETTE = [
    '#22d3ee', '#a855f7', '#10b981', '#f59e0b',
    '#f43f5e', '#3b82f6', '#ec4899', '#84cc16'
];

function openCategoryBreakdownModal(catId) {
    activeBreakdownModalCatId = catId;
    const modal = document.getElementById('categoryBreakdownModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderCategoryBreakdownModalContent();
}

function closeCategoryBreakdownModal() {
    activeBreakdownModalCatId = null;
    const modal = document.getElementById('categoryBreakdownModal');
    if (modal) modal.classList.add('hidden');
}

function handleModalBackdropClick(e) {
    if (e.target && e.target.id === 'categoryBreakdownModal') {
        closeCategoryBreakdownModal();
    }
}

function switchModalPieMode(mode) {
    activeModalPieMode = mode;
    renderCategoryBreakdownModalContent();
}

function renderCategoryBreakdownModalContent() {
    if (!activeBreakdownModalCatId) return;
    const cat = appData.categories.find(c => c.id === activeBreakdownModalCatId);
    if (!cat) return;

    const metrics = calculateMetrics();
    const subs = getCategorySubcategories(cat);
    const subBudgetsMap = (metrics.subcategoryBudgets && metrics.subcategoryBudgets[cat.id]) || {};

    // Calculate logged hours per subcategory within the active tenure window
    const subLoggedMap = {};
    subs.forEach(s => { subLoggedMap[s.id] = 0; });

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

            if (Array.isArray(t.splits) && t.splits.length > 0) {
                t.splits.forEach(s => {
                    if (s.categoryId === cat.id) {
                        const sId = (s.subcategoryId && subLoggedMap[s.subcategoryId] !== undefined)
                            ? s.subcategoryId
                            : 'sub_general';
                        subLoggedMap[sId] = (subLoggedMap[sId] || 0) + totalTaskHours * ((parseFloat(s.percentage) || 0) / 100);
                    }
                });
            } else if (t.categoryId === cat.id) {
                const sId = (t.subcategoryId && subLoggedMap[t.subcategoryId] !== undefined)
                    ? t.subcategoryId
                    : 'sub_general';
                subLoggedMap[sId] = (subLoggedMap[sId] || 0) + totalTaskHours;
            }
        }
    });

    const totalCatLogged = Object.values(subLoggedMap).reduce((a, b) => a + b, 0);
    const totalCatBudget = metrics.categoryBudgets[cat.id] || 0;

    // Auto-select 'planned' mode if nothing is logged yet but budget exists
    if (totalCatLogged === 0 && totalCatBudget > 0 && activeModalPieMode === 'logged') {
        activeModalPieMode = 'planned';
    }

    // Style the modal card with the category's glowing theme
    const modalCard = document.getElementById('categoryModalCard');
    if (modalCard) {
        modalCard.style.background = `linear-gradient(135deg, ${cat.color}35, #0d111f 75%)`;
        modalCard.style.borderColor = `${cat.color}99`;
        modalCard.style.boxShadow = `0 20px 50px rgba(0,0,0,0.8), 0 0 35px -6px ${cat.color}55`;
    }

    document.getElementById('modalCatDot').style.backgroundColor = cat.color;
    document.getElementById('modalCatTitle').innerText = `${cat.name} — Subcategory Breakdown`;
    document.getElementById('modalCatTotalBadge').innerText = `${formatHours(totalCatLogged)} / ${formatHours(totalCatBudget)}`;
    document.getElementById('modalCatDesc').innerText = cat.description || 'Click between Logged Share and Planned Budget to inspect distribution.';

    // Highlight active chart mode button
    const loggedBtn = document.getElementById('pieModeLoggedBtn');
    const plannedBtn = document.getElementById('pieModePlannedBtn');
    if (loggedBtn && plannedBtn) {
        loggedBtn.className = activeModalPieMode === 'logged' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        plannedBtn.className = activeModalPieMode === 'planned' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }

    const pieContainer = document.getElementById('modalPieChartContainer');
    const legendContainer = document.getElementById('modalPieLegend');
    const barsContainer = document.getElementById('modalSubcategoryBarsList');
    pieContainer.innerHTML = '';
    legendContainer.innerHTML = '';
    barsContainer.innerHTML = '';

    const subItems = subs.map((sub, idx) => {
        const logged = subLoggedMap[sub.id] || 0;
        const planned = subBudgetsMap[sub.id] || 0;
        const color = idx === 0 ? cat.color : SUB_PIE_PALETTE[idx % SUB_PIE_PALETTE.length];
        return {
            ...sub,
            logged,
            planned,
            color
        };
    });

    // Build SVG Donut Chart
    const chartTotal = activeModalPieMode === 'logged' ? totalCatLogged : Math.max(0, totalCatBudget);
    const radius = 72;
    const circumference = 2 * Math.PI * radius;

    if (chartTotal <= 0.001) {
        pieContainer.innerHTML = `
            <svg width="200" height="200" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="${radius}" fill="transparent" stroke="#1e2438" stroke-width="24"></circle>
            </svg>
            <div class="pie-center-label">
                <span style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; font-weight:800;">${activeModalPieMode}</span>
                <span class="font-mono" style="font-size:1.05rem; font-weight:800; color:#fff;">0 hrs</span>
            </div>
        `;
    } else {
        let cumulativePct = 0;
        const circlesHtml = subItems.map(item => {
            const val = Math.max(0, activeModalPieMode === 'logged' ? item.logged : item.planned);
            if (val <= 0) return '';
            const pct = val / chartTotal;
            const dashLength = pct * circumference;
            const dashOffset = -cumulativePct * circumference;
            cumulativePct += pct;

            return `<circle cx="100" cy="100" r="${radius}" fill="transparent"
                        stroke="${item.color}" stroke-width="24"
                        stroke-dasharray="${dashLength} ${circumference}"
                        stroke-dashoffset="${dashOffset}"
                        transform="rotate(-90 100 100)" />`;
        }).join('');

        pieContainer.innerHTML = `
            <svg width="200" height="200" viewBox="0 0 200 200" style="filter: drop-shadow(0 0 12px rgba(0,0,0,0.5));">
                <circle cx="100" cy="100" r="${radius}" fill="transparent" stroke="#161b2e" stroke-width="24"></circle>
                ${circlesHtml}
            </svg>
            <div class="pie-center-label">
                <span style="font-size:0.68rem; color:var(--text-secondary); text-transform:uppercase; font-weight:800;">
                    ${activeModalPieMode === 'logged' ? 'Total Logged' : 'Total Planned'}
                </span>
                <span class="font-mono" style="font-size:1.1rem; font-weight:800; color:#fff;">${formatHours(chartTotal)}</span>
            </div>
        `;
    }

    // Build Legend & Horizontal Progress Bars
    subItems.forEach(item => {
        const activeVal = Math.max(0, activeModalPieMode === 'logged' ? item.logged : item.planned);
        const sharePct = chartTotal > 0 ? ((activeVal / chartTotal) * 100).toFixed(1) : '0.0';

        const leg = document.createElement('div');
        leg.className = 'pie-legend-item';
        leg.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.4rem; min-width:0;">
                <span class="color-dot" style="background-color:${item.color}; width:0.65rem; height:0.65rem;"></span>
                <span style="color:#fff; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
            </div>
            <span class="font-mono" style="color:var(--text-secondary); font-weight:700;">${sharePct}%</span>
        `;
        legendContainer.appendChild(leg);

        // Horizontal Progress Bar Card for Subcategory
        let barPct = item.planned > 0 ? Math.min(100, (item.logged / item.planned) * 100) : (item.logged > 0 ? 100 : 0);
        barPct = item.planned - item.logged < 0 ? 100 : barPct;

        const barCard = document.createElement('div');
        barCard.className = 'breakdown-card';
        barCard.style.background = `linear-gradient(135deg, ${item.color}32, var(--bg-panel))`;
        barCard.style.borderColor = `${item.color}88`;
        barCard.style.boxShadow = `0 0 18px -6px ${item.color}35`;
        barCard.innerHTML = `
            <div class="breakdown-top">
                <span style="display:flex; align-items:center; gap:0.45rem; color:#fff;">
                    <span class="color-dot" style="background-color: ${item.color}"></span>
                    <span>${item.name}</span>
                </span>
                <span class="font-mono" style="font-size:0.76rem; color:var(--text-secondary);">
                    ${formatHours(item.logged)} / ${formatHours(item.planned)}
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${barPct}%; background-color: ${item.color}"></div>
            </div>
        `;
        barsContainer.appendChild(barCard);
    });
}
