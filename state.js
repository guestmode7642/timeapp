// ==========================================================================
// STATE MANAGEMENT, STORAGE & CORE MATH ENGINE
// ==========================================================================

let appData = JSON.parse(localStorage.getItem('timeLedgerData')) || {
    tenure: { start: '', end: '' },
    categories: [
        { id: 'cat-unassigned', name: 'Unassigned', color: '#562828' },
        { id: 'cat-sleep', name: 'Sleep', color: '#3b82f6' },
        { id: 'cat-work', name: 'Work', color: '#10b981' }
    ],
    tasks: [],
    templates: [
        {
            id: 'tpl-work',
            name: 'Workday PG',
            color: '#10b981',
            blocks: [
                { id: 'b1', start: '00:00', end: '07:00', categoryId: 'cat-sleep', label: 'Sleep' },
                { id: 'b2', start: '09:00', end: '17:00', categoryId: 'cat-work', label: 'Office Hours' }
            ]
        }
    ],
    dayMappings: {}, // { "YYYY-MM-DD": "tpl-id" }
    tasksQueue: []   // Action Task Queue Storage
};

let selectedDatesSet = new Set();

// --- Helper: Format Date into local "YYYY-MM-DDTHH:mm" for datetime-local inputs ---
function toLocalDatetimeString(dateInput = new Date()) {
    const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// --- Helper: Convert decimal hours to "X hrs Y mins" ---
function formatHours(decimalHours) {
    if (isNaN(decimalHours) || decimalHours === 0) return '0 hrs';
    const sign = decimalHours < 0 ? '-' : '';
    const totalMinutes = Math.round(Math.abs(decimalHours) * 60);
    if (totalMinutes === 0) return '0 hrs';
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs === 0) return `${sign}${mins} mins`;
    if (mins === 0) return `${sign}${hrs} hrs`;
    return `${sign}${hrs}h:${mins}m`;
}

function saveData() {
    localStorage.setItem('timeLedgerData', JSON.stringify(appData));
    renderApp();
}
// --- Core Calculations & Template-Driven Budgets ---
function calculateCategoryBudgets() {
    let budgets = {};
    appData.categories.forEach(cat => {
        budgets[cat.id] = 0;
    });

    const startStr = appData.tenure.start;
    const endStr = appData.tenure.end;
    if (!startStr || !endStr) return budgets;

    const tenureStart = new Date(startStr);
    const tenureEnd = new Date(endStr);
    if (isNaN(tenureStart) || isNaN(tenureEnd) || tenureEnd <= tenureStart) return budgets;

    for (let dateStr in appData.dayMappings) {
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) continue;

        const tplId = appData.dayMappings[dateStr];
        const tpl = appData.templates.find(t => t.id === tplId);
        if (tpl && tpl.blocks) {
            tpl.blocks.forEach(b => {
                const [startH, startM] = b.start.split(':').map(Number);
                const [endH, endM] = b.end.split(':').map(Number);
                let startMins = startH * 60 + startM;
                let endMins = endH * 60 + endM;

                if (endMins === 0 && startMins > 0) {
                    endMins = 1440;
                }

                if (endMins <= startMins) return;

                // Actual timestamps for this block on this calendar date
                const blockStart = new Date(y, m - 1, d, 0, startMins, 0, 0);
                const blockEnd = new Date(y, m - 1, d, 0, endMins, 0, 0);

                // Clip block duration to the active [tenureStart, tenureEnd] window
                const overlapStart = Math.max(blockStart.getTime(), tenureStart.getTime());
                const overlapEnd = Math.min(blockEnd.getTime(), tenureEnd.getTime());

                if (overlapEnd > overlapStart) {
                    const durationHrs = (overlapEnd - overlapStart) / (1000 * 60 * 60);
                    if (budgets[b.categoryId] !== undefined) {
                        budgets[b.categoryId] += durationHrs;
                    }
                }
            });
        }
    }
    return budgets;
}

function calculateMetrics() {
    const start = appData.tenure.start ? new Date(appData.tenure.start) : null;
    const end = appData.tenure.end ? new Date(appData.tenure.end) : null;

    if (!start || !end || isNaN(start) || isNaN(end) || end <= start) {
        return { totalHours: 0, burnedHours: 0, availableBalance: 0, bufferHours: 0, daysCount: 0, categoryBudgets: {} };
    }

    const diffMs = end - start;
    const totalHours = diffMs / (1000 * 60 * 60);
    const daysCount = totalHours / 24;

    const categoryBudgets = calculateCategoryBudgets();

    let totalBudgeted = 0;
    appData.categories.forEach(cat => {
        if (cat.id !== 'cat-unassigned') {
            totalBudgeted += categoryBudgets[cat.id] || 0;
        }
    });

    const bufferHours = totalHours - totalBudgeted;
    categoryBudgets['cat-unassigned'] = bufferHours;

    let burnedHours = 0;
    appData.tasks.forEach(t => {
        const f = new Date(t.from);
        const to = new Date(t.to);
        if (!isNaN(f) && !isNaN(to) && to > f) {
            const overlapStart = Math.max(f.getTime(), start.getTime());
            const overlapEnd = Math.min(to.getTime(), end.getTime());
            if (overlapEnd > overlapStart) {
                burnedHours += (overlapEnd - overlapStart) / (1000 * 60 * 60);
            }
        }
    });

    const availableBalance = totalHours - burnedHours;

    return { totalHours, burnedHours, availableBalance, bufferHours, daysCount, categoryBudgets };
}

// --- Task Queue Deadline Helpers ---
function calculateDeadlineDate(horizonKey) {
    const now = new Date();
    if (horizonKey === 'day') now.setHours(now.getHours() + 24);
    else if (horizonKey === 'week') now.setDate(now.getDate() + 7);
    else if (horizonKey === 'month') now.setDate(now.getDate() + 30);
    else if (horizonKey === 'year') now.setDate(now.getDate() + 365);
    return now.toISOString();
}

function getEffectiveHorizon(deadlineStr) {
    const diffMs = new Date(deadlineStr) - new Date();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours <= 24) return 'day';
    if (diffDays <= 7) return 'week';
    if (diffDays <= 30) return 'month';
    return 'year';
}
