// js/ui/sidebar.js
import { formatTimestamp, formatTimeSince, getSpotTimestamp } from '../utils/formatters.js';

/**
 * Renderiza la lista lateral con accordion por zonas
 * @param {Array} spots - Lista completa de puestos
 * @param {Array} zones - Lista de zonas disponibles
 * @param {Object} zoneHistoryData - Historial por zona {zoneId: [occupancy%]}
 * @param {string} filter - Filtro activo ('all', 'free', 'occupied', 'reserved')
 * @param {string} searchQuery - Texto de búsqueda
 * @param {string} userResSpotId - ID del puesto reservado por el usuario
 * @param {Function} onSpotClick - Callback al hacer click en un puesto
 */
export function renderSidebar(spots, zones, zoneHistoryData, filter, searchQuery, userResSpotId, onSpotClick) {
    const container = document.getElementById('parking-list');
    if (!container) return;

    // IMPORTANTE: Guardar estado de colapso ANTES de limpiar
    const previousCollapsedState = {};
    container.querySelectorAll('.zone-accordion').forEach(section => {
        const zoneId = section.dataset.zoneId;
        const isCollapsed = section.querySelector('.zone-body')?.classList.contains('hidden');
        previousCollapsedState[zoneId] = isCollapsed;
    });

    // Evitar flicker: preservar altura mientras se renderiza
    const prevHeight = container.offsetHeight;
    if (prevHeight > 0) {
        container.style.minHeight = prevHeight + 'px';
    }
    
    const query = searchQuery ? searchQuery.toLowerCase() : '';

    // Si hay búsqueda activa: modo flat (con etiqueta de zona)
    if (query) {
        renderFlatList(container, spots, filter, query, userResSpotId, onSpotClick, zones);
        return;
    }

    // Agrupar puestos por zona
    const spotsByZone = groupSpotsByZone(spots, zones);
    
    // Ordenar zonas alfabéticamente, "Sin Zona" al final
    const sortedZoneIds = Object.keys(spotsByZone).sort((a, b) => {
        if (a === 'SinZona') return 1;
        if (b === 'SinZona') return -1;
        const zoneA = zones.find(z => z.id === a);
        const zoneB = zones.find(z => z.id === b);
        const nameA = zoneA ? zoneA.name : a;
        const nameB = zoneB ? zoneB.name : b;
        return nameA.localeCompare(nameB);
    });

    // Renderizar cada zona como accordion en un fragment para reemplazo atómico
    const fragment = document.createDocumentFragment();
    sortedZoneIds.forEach(zoneId => {
        const zoneSpots = spotsByZone[zoneId];
        const zone = zones.find(z => z.id === zoneId);
        const zoneName = zone ? zone.name : 'Sin Zona';
        
        // Aplicar filtro de estado
        const filteredZoneSpots = zoneSpots.filter(spot => {
            if (filter === 'free') return spot.status === 1;
            if (filter === 'occupied') return spot.status === 0;
            if (filter === 'reserved') return spot.status === 2;
            return true;
        });

        // Si no hay puestos tras filtro, skip
        if (filteredZoneSpots.length === 0) return;

        // Calcular contadores
        const counts = {
            free: filteredZoneSpots.filter(s => s.status === 1).length,
            occupied: filteredZoneSpots.filter(s => s.status === 0).length,
            reserved: filteredZoneSpots.filter(s => s.status === 2).length,
            total: filteredZoneSpots.length
        };

        // Crear accordion section (preservando estado anterior)
        const wasCollapsed = previousCollapsedState[zoneId] !== undefined ? previousCollapsedState[zoneId] : true;
        const historyForZone = zoneHistoryData && zoneHistoryData[zoneId] ? zoneHistoryData[zoneId] : [];
        const section = createZoneAccordion(zoneId, zoneName, counts, filteredZoneSpots, historyForZone, userResSpotId, onSpotClick, wasCollapsed);
        fragment.appendChild(section);
    });

    // Reemplazo atómico del contenido para minimizar parpadeo
    if (fragment.childElementCount > 0) {
        container.replaceChildren(fragment);
    }

    // Estado vacío
    if (sortedZoneIds.length === 0 || container.children.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-slate-400">
                <i class="fa-solid fa-filter-circle-xmark text-3xl mb-3"></i>
                <p class="text-sm">No se encontraron puestos</p>
            </div>
        `;
    }

    // Restaurar altura
    container.style.minHeight = '';
}

/**
 * Agrupa puestos por zona
 */
function groupSpotsByZone(spots, zones) {
    const grouped = {};
    spots.forEach(spot => {
        // Si no tiene zone_id o la zona no existe en la lista, agrupar como "Sin Zona"
        let zoneId = spot.zone_id;
        if (!zoneId || !zones.find(z => z.id === zoneId)) {
            zoneId = 'SinZona';
        }
        if (!grouped[zoneId]) grouped[zoneId] = [];
        grouped[zoneId].push(spot);
    });
    return grouped;
}

/**
 * Crea un accordion para una zona
 */
function createZoneAccordion(zoneId, zoneName, counts, spots, historyData, userResSpotId, onSpotClick, isCollapsed = true) {
    const section = document.createElement('div');
    section.className = 'zone-accordion mb-3';
    section.dataset.zoneId = zoneId;

    const headerColor = counts.free > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200';
    
    section.innerHTML = `
        <div class="zone-header ${headerColor} border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-all" data-zone-id="${zoneId}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} text-xs text-slate-500 zone-chevron"></i>
                    <span class="font-bold text-sm text-slate-800">${zoneName}</span>
                </div>
                <div class="flex gap-1.5 text-xs">
                    <span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-md font-bold min-w-[28px] text-center">${counts.free}</span>
                    <span class="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-md font-bold min-w-[28px] text-center">${counts.occupied}</span>
                    <span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-md font-bold min-w-[28px] text-center">${counts.reserved}</span>
                </div>
            </div>
        </div>
        <div class="zone-body ${isCollapsed ? 'hidden' : ''} mt-3">
            <div class="space-y-2 px-2">
                ${spots.map(spot => createSpotCard(spot, userResSpotId, onSpotClick, zoneName)).join('')}
            </div>
        </div>
    `;

    // Toggle collapse
    const header = section.querySelector('.zone-header');
    header.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleZoneCollapse(zoneId, section);
    });

    return section;
}

/**
 * Toggle collapse de una zona
 */
function toggleZoneCollapse(zoneId, section) {
    const body = section.querySelector('.zone-body');
    const chevron = section.querySelector('.zone-chevron');
    
    const isCurrentlyCollapsed = body.classList.contains('hidden');
    
    if (isCurrentlyCollapsed) {
        // Expandir
        body.classList.remove('hidden');
        chevron.className = 'fa-solid fa-chevron-down text-xs text-slate-500 zone-chevron';
    } else {
        // Colapsar
        body.classList.add('hidden');
        chevron.className = 'fa-solid fa-chevron-right text-xs text-slate-500 zone-chevron';
    }
}

/**
 * Crea HTML para una tarjeta de puesto
 */
function createSpotCard(spot, userResSpotId, onSpotClick, zoneName) {
    const isMySpot = spot.id === userResSpotId;
    let borderClass = 'border-slate-200 hover:border-blue-400';
    let bgClass = 'bg-white';
    let statusCircleClass = 'status-circle status-unknown';

    if (isMySpot) {
        borderClass = 'border-blue-400 ring-2 ring-blue-200 bg-blue-50';
    }

    if (spot.status === 1) {
        statusCircleClass = 'status-circle status-free';
    } else if (spot.status === 0) {
        statusCircleClass = 'status-circle status-occupied';
    } else if (spot.status === 2) {
        statusCircleClass = 'status-circle status-reserved';
    }

    let ts = getSpotTimestamp(spot);
    if (!ts) {
        try {
            const sync = localStorage.getItem('sparking_spots_synced_at');
            if (sync) ts = new Date(sync).toISOString();
        } catch (e) { ts = null; }
    }
    const timeStr = spot.status === 2 ? 'Reservado' : (ts ? formatTimeSince(ts) : '--');

    return `
        <div class="spot-card p-3 rounded-xl border-2 ${borderClass} ${bgClass} shadow-sm transition-all cursor-pointer group hover:shadow-lg hover:-translate-y-0.5" data-spot-id="${spot.id}">
            <div class="flex items-center gap-3 mb-2">
                <div class="${statusCircleClass}"></div>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-base text-slate-800 group-hover:text-blue-600 transition-colors">${spot.id}</span>
                        ${isMySpot ? '<span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">TU RESERVA</span>' : ''}
                    </div>
                    <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${spot.desc || 'Sin descripción'}</p>
                </div>
            </div>
            <div class="flex items-center gap-1.5 text-xs text-slate-400 ml-9">
                <i class="fa-regular fa-clock"></i>
                <span>${timeStr}</span>
            </div>
        </div>
    `;
}

/**
 * Renderiza lista flat para modo búsqueda
 */
function renderFlatList(container, spots, filter, query, userResSpotId, onSpotClick, zones) {
    const filteredSpots = spots.filter(spot => {
        // Filtro por estado
        if (filter === 'free' && spot.status !== 1) return false;
        if (filter === 'occupied' && spot.status !== 0) return false;
        if (filter === 'reserved' && spot.status !== 2) return false;
        
        // Filtro por búsqueda
        const matchId = spot.id.toLowerCase().includes(query);
        const matchDesc = (spot.desc || '').toLowerCase().includes(query);
        const zone = zones.find(z => z.id === (spot.zone_id || 'SinZona'));
        const matchZone = zone ? zone.name.toLowerCase().includes(query) : false;
        return matchId || matchDesc || matchZone;
    });

    filteredSpots.sort((a, b) => {
        if (a.id === userResSpotId) return -1;
        if (b.id === userResSpotId) return 1;
        return a.id.localeCompare(b.id);
    });

    if (filteredSpots.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-slate-400">
                <i class="fa-solid fa-magnifying-glass text-3xl mb-3"></i>
                <p class="text-sm">No se encontraron resultados</p>
            </div>
        `;
        return;
    }

    filteredSpots.forEach(spot => {
        const zone = zones.find(z => z.id === (spot.zone_id || 'SinZona'));
        const zoneName = zone ? zone.name : 'Sin Zona';
        const cardHtml = createSpotCard(spot, userResSpotId, onSpotClick, zoneName);
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = cardHtml + `<div class="text-xs text-slate-400 mt-1 pl-3"><i class="fa-solid fa-location-dot"></i> ${zoneName}</div>`;
        container.appendChild(wrapper);
    });

    // Attach click events
    container.querySelectorAll('.spot-card').forEach(card => {
        card.addEventListener('click', () => {
            const spotId = card.dataset.spotId;
            if (window.focusOnSpot) window.focusOnSpot(spotId);
            setTimeout(() => {
                if (onSpotClick) onSpotClick(spotId);
            }, 500);
        });
    });
}

// Attach click events en el DOM para cards de accordion
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.spot-card');
        if (!card) return;
        
        const spotId = card.dataset.spotId;
        console.log('🔵 Click en spot card:', spotId);
        
        if (window.focusOnSpot) {
            window.focusOnSpot(spotId);
        }
        
        // El callback onSpotClick se pasa desde main.js
        setTimeout(() => {
            const modal = document.querySelector('[data-spot-modal]');
            if (modal && window.openSpotModal) {
                window.openSpotModal(spotId);
            }
        }, 500);
    });
});