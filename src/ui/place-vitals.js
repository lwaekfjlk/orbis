/* Compact, accessible census graphics shared by place cards and dossiers. */
function placeVitalsHTML(vitals) {
    if (!vitals) return '';
    const esc = escapeHTML, finite = Number.isFinite;
    const percent = value => `${(value * 100).toLocaleString('en-US', {maximumFractionDigits: 1})}%`;
    const color = value => /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value || '') ? value : '#8b968b';
    const census = (key, label, mix) => {
        const recorded = finite(mix?.total) && mix.total > 0;
        const shares = recorded ? mix.shares.filter(v => finite(v.share) && v.share > 0) : [];
        const unknown = recorded ? Math.max(0, Math.min(1, mix.unknown / mix.total)) : 0;
        const all = shares.map(v => ({...v, color: color(v.color)}));
        if (unknown > .000001) all.push({id: 'unknown', name: 'Unrecorded', share: unknown, color: '#7d897e'});
        const first = all.slice(0, 2), remainder = all.slice(2).reduce((sum, v) => sum + v.share, 0);
        const readable = all.map(v => `${v.name} ${percent(v.share)}`).join(', ');
        const empty = mix?.total === 0 ? 'No residents recorded' : 'Census incomplete';
        return `<div class="vital-mix" data-mix="${key}">
            <div class="vital-caption"><strong>${label}</strong>${vitals.kind === 'city' ? '<small>District census</small>' : ''}</div>
            <div class="vital-stack" role="img" aria-label="${esc(label + ': ' + (readable || empty))}">
                ${all.map(v => `<span class="vital-segment" data-id="${v.id}" style="width:${v.share * 100}%;--vital-color:${v.color}" title="${esc(v.name + ': ' + percent(v.share))}"></span>`).join('')}
            </div>
            <div class="vital-legend">${first.map(v => `<span><i style="--vital-color:${v.color}" aria-hidden="true"></i>${esc(v.name)} <b>${percent(v.share)}</b></span>`).join('')}${remainder > .000001 ? `<span class="vital-other">Others <b>${percent(remainder)}</b></span>` : ''}${all.length ? '' : `<span>${empty}</span>`}</div>
        </div>`;
    };
    const indicator = v => {
        const width = Math.max(0, Math.min(100, v.value / v.max * 100));
        const value = `${v.value.toLocaleString('en-US', {maximumFractionDigits: 0})}${v.unit || ''}`;
        return `<div class="vital-indicator" data-vital="${esc(v.key)}" data-value="${v.value}">
            <div class="vital-caption"><strong>${esc(v.label)}</strong><b>${esc(value)}</b></div>
            <div class="vital-gauge" role="img" aria-label="${esc(v.label + ': ' + value + (finite(v.target) ? '; demand ' + v.target + v.unit : ''))}">
                <span style="width:${width}%;--vital-color:${v.key === 'foodRatio' && v.value < v.target ? '#cba175' : '#cbdca5'}"></span>
                ${finite(v.target) ? `<i style="left:${Math.min(100, v.target / v.max * 100)}%" aria-hidden="true"></i>` : ''}
            </div>${finite(v.target) ? `<small class="vital-target">${v.target}${esc(v.unit || '')} meets demand</small>` : ''}
        </div>`;
    };
    const indicators = vitals.indicators.filter(v => finite(v.value) && v.max > 0);
    return `<div class="place-vitals" data-kind="${vitals.kind}" aria-label="${vitals.kind === 'city' ? 'City' : 'Country'} at a glance">
        <div class="vital-metrics">${vitals.metrics.map(v => `<div class="vital-metric" data-vital="${esc(v.key)}" data-value="${finite(v.value) ? v.value : ''}"><b>${finite(v.value) ? (v.unit === '%' ? v.value.toLocaleString('en-US', {maximumFractionDigits: 1}) + '%' : Math.round(v.value).toLocaleString('en-US')) : '—'}</b><small>${esc(v.label)}</small></div>`).join('')}</div>
        ${census('peoples', 'Peoples', vitals.peoples)}${census('faiths', 'Faiths', vitals.faiths)}
        ${indicators.length ? `<div class="vital-indicators">${indicators.map(indicator).join('')}</div>` : ''}
    </div>`;
}
