// js/main.js
import { CONFIG } from './config/config.js';
import { monitorAuthState, logoutUser } from './auth/auth.js';
import { fetchParkingStatus, reserveSpot, releaseSpot, deleteSpot, createSpot, updateSpot, bulkAssignSpots, bulkDeleteSpots } from './api/parking.js';
import { fetchZones, manageZone } from './api/zones.js';
import { fetchOccupancyHistory, extractZoneOccupancy, extractGlobalOccupancy, aggregateGlobalFromZones } from './api/history.js';
import * as MapCore from './map/core.js';
import * as MapMarkers from './map/markers.js';
import * as MapAdmin from './map/admin.js';
import * as MapBuilder from './map/builder.js';
import * as UI_Sidebar from './ui/sidebar.js';
import * as UI_Modals from './ui/modals.js';
import * as UI_Toasts from './ui/toasts.js';
import * as UI_Sounds from './ui/sounds.js';
import * as UI_Charts from './ui/charts.js';
import { formatLicensePlate, formatTimeLeft, formatTimeSince, getSpotTimestamp } from './utils/formatters.js';
import { isValidChileanPlate } from './utils/validators.js';
import { debounce } from './utils/helpers.js';
import { logger } from './utils/logger.js';

// --- FUNCIÓN DE ZOOM Y RESALTADO (definida temprano para sidebar) ---
function focusOnSpot(spotId) {
    console.log('🎯 focusOnSpot llamado con:', spotId);
    
    // Buscar el spot en el estado global
    const state = window.appState || { spots: [] };
    console.log('📊 State disponible:', state.spots.length, 'spots');
    
    const spot = state.spots.find(s => s.id === spotId);
    
    if (!spot) {
        console.error('❌ Spot no encontrado:', spotId);
        console.log('Spots disponibles:', state.spots.map(s => s.id));
        return false;
    }
    
    console.log('✅ Spot encontrado:', spot);
    
    if (!MapCore.mapState || !MapCore.mapState.map) {
        console.error('❌ Mapa no inicializado aún. MapCore.mapState:', MapCore.mapState);
        return false;
    }
    
    console.log('✅ Mapa disponible, haciendo zoom a:', { lat: spot.lat, lng: spot.lng });
    
    try {
        // Pan suave al puesto con transición animada
        const currentZoom = MapCore.mapState.map.getZoom();
        
        // Si el zoom es muy bajo, primero hacer zoom out suave antes de panear
        if (currentZoom < 18) {
            MapCore.mapState.map.setZoom(18);
            setTimeout(() => {
                MapCore.mapState.map.panTo({ lat: spot.lat, lng: spot.lng });
                setTimeout(() => MapCore.mapState.map.setZoom(20), 400);
            }, 300);
        } else {
            // Si ya está cerca, panear suavemente y luego zoom
            MapCore.mapState.map.panTo({ lat: spot.lat, lng: spot.lng });
            setTimeout(() => MapCore.mapState.map.setZoom(20), 400);
        }
        
        console.log('✅ Zoom ejecutado');
        
        // Resaltar el pin
        MapMarkers.highlightSpot(spotId);
        console.log('✅ Highlight aplicado');
        
        return true;
    } catch (err) {
        console.error('❌ Error en focusOnSpot:', err);
        return false;
    }
}

// Exponer globalmente ANTES de cualquier render
window.focusOnSpot = focusOnSpot;
logger.debug('✅ focusOnSpot expuesta globalmente');

// --- ESTADO GLOBAL ---
const state = {
    currentUser: null,
    spots: [],
    zones: [],
    historyData: null, // Datos del historial: { samples: [], zoneData: {} }
    filter: 'all', // 'all', 'free', 'occupied', 'reserved'
    searchQuery: '',
    myReservation: null, // No usar localStorage en artifacts
    isFetching: false,
    isAdminMode: false,
    mapReady: false,
    isBuilderMode: false, // Nuevo: track del builder
    bulkSelection: { enabled: false, zoneId: null, selected: new Set() }, // Para selección masiva por zona
    zonesSearchQuery: '',
    adminDragging: false,
    adminLastInteraction: 0,
    _loggedSpotSchema: false,
    adminMoveEnabled: false
};

// Exponer state para acceso desde focusOnSpot
window.appState = state;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    logger.debug('🚀 Iniciando S-Parking Dashboard...');

    // Verificar que el viewport está configurado para móvil (prevenir zoom en pequeñas pantallas)
    if (window.innerWidth < 768) {
        logger.debug('📱 Dispositivo móvil detectado. Viewport: ' + window.innerWidth + 'x' + window.innerHeight);
    }

    // 1. Inicializar Gráfico de Barras por Hora
    const ctx = document.getElementById('hourly-chart');
    if (ctx) {
        UI_Charts.initChart(ctx);
        logger.debug('✅ Gráfico horario inicializado');
    }

    // Admin toolbar (open/close handled without a separate open button)
    const adminToolbar = document.getElementById('admin-toolbar');
    const adminCloseBtn = document.getElementById('admin-close-btn');

    if (adminCloseBtn) {
        adminCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!adminToolbar) return;
            adminToolbar.classList.remove('show');
            adminToolbar.classList.add('hidden');
        });
    }

    // Closing the admin toolbar via outside clicks caused accidental hides (UX issue).
    // Rely on the explicit close button (`adminCloseBtn`) or Escape key to close the toolbar.
    // No global document click handler is attached to hide the toolbar anymore.
    document.addEventListener('keydown', (e) => {
        if (!adminToolbar) return;
        if (!adminToolbar.classList.contains('show')) return;
        if (e.key === 'Escape' || e.key === 'Esc') {
            adminToolbar.classList.remove('show');
            adminToolbar.classList.add('hidden');
        }
    });

    // --- Drag logic for admin toolbar (global pointer events, gated by move toggle) ---
    (function enableAdminToolbarDrag() {
        const mapEl = document.getElementById('map');
        if (!adminToolbar || !mapEl) return;

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let dragging = false;
        const MOVE_THRESHOLD = 6; // pixels before starting real drag to allow clicks

        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        function isInteractiveElement(el) {
            if (!el || !el.tagName) return false;
            const tag = el.tagName.toLowerCase();
            if (['input', 'button', 'select', 'textarea', 'a'].includes(tag)) return true;
            if (el.closest && (el.closest('button') || el.closest('a') || el.closest('[contenteditable="true"]'))) return true;
            return false;
        }

        function onPointerDown(e) {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            // Desktop: require move-mode enabled before starting
            // Mobile: allow press to begin (for long-press), movement will be gated later
            if (!state.adminMoveEnabled && !isMobile) return;
            // Only left button
            if (e.button && e.button !== 0) return;

            // On desktop, avoid starting drag from interactive elements.
            // On mobile (long-press enabled), allow drag even when starting over buttons to simplify UX.
            if (!isMobile && isInteractiveElement(e.target)) return;

            e.stopPropagation();
            e.preventDefault();

            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;

            const rect = adminToolbar.getBoundingClientRect();
            const mapRect = mapEl.getBoundingClientRect();

            startLeft = rect.left - mapRect.left;
            startTop = rect.top - mapRect.top;

            // switch to absolute pixel positioning
            adminToolbar.style.position = 'absolute';
            adminToolbar.style.transform = 'none';
            adminToolbar.style.left = `${Math.round(startLeft)}px`;
            adminToolbar.style.top = `${Math.round(startTop)}px`;

            try { adminToolbar.setPointerCapture && adminToolbar.setPointerCapture(pointerId); } catch (err) { /* ignore */ }

            document.addEventListener('pointermove', onPointerMove, { passive: false });
            document.addEventListener('pointerup', onPointerUp);

            dragging = false; // will become true after threshold
            state.adminLastInteraction = Date.now();
        }

        function onPointerMove(e) {
            if (pointerId === null || e.pointerId !== pointerId) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Gate movement on desktop, but allow on mobile once dragging begins
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (!state.adminMoveEnabled && !isMobile) return;

            if (!dragging) {
                if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return; // don't start drag yet
                dragging = true;
                state.adminDragging = true;
            }

            e.preventDefault();

            const mapRect = mapEl.getBoundingClientRect();
            const toolbarRect = adminToolbar.getBoundingClientRect();

            let x = startLeft + dx;
            let y = startTop + dy;

            x = clamp(x, 0, Math.max(0, mapRect.width - toolbarRect.width));
            y = clamp(y, 0, Math.max(0, mapRect.height - toolbarRect.height));

            adminToolbar.style.left = `${Math.round(x)}px`;
            adminToolbar.style.top = `${Math.round(y)}px`;
        }

        function onPointerUp(e) {
            if (pointerId === null || e.pointerId !== pointerId) return;

            try { adminToolbar.releasePointerCapture && adminToolbar.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            // small delay to avoid immediate document click closing
            state.adminLastInteraction = Date.now();
            if (dragging) state.adminDragging = false;

            pointerId = null;
            dragging = false;
        }

        // Attach pointerdown to the whole toolbar so any non-interactive area can start a drag
        adminToolbar.addEventListener('pointerdown', onPointerDown, { passive: false });
    })();

    // 2. Monitor de Auth
    monitorAuthState((user) => {
        state.currentUser = user;
        updateUserUI(user);

        logger.debug('👤 Usuario:', user ? user.email : 'No autenticado');

        // Mostrar/ocultar directamente el toolbar admin (sin botón de apertura)
        const toolbar = document.getElementById('admin-toolbar');
        if (!toolbar) return;
        if (user && user.email === 'joa.troncoso@duocuc.cl') {
            logger.debug('✅ Admin detectado, mostrando toolbar admin');
            toolbar.classList.remove('hidden');
            toolbar.classList.add('show');
            state.isAdminMode = true;
        } else {
            logger.debug('❌ No es admin, ocultando toolbar admin');
            toolbar.classList.remove('show');
            toolbar.classList.add('hidden');
            state.isAdminMode = false;
        }
    });

    // 3. Inicializar Mapa
    try {
        // Inicializar Mapa en el contenedor visible dentro del layout
        await MapCore.initMap('map');
        state.mapReady = true;

        // --- CORRECCIÓN AQUÍ: Carga paralela de Parking, Zonas e Historial ---
        const [parkingData, zonesData, historyResponse] = await Promise.all([
            fetchParkingStatus(),
            fetchZones(),
            fetchOccupancyHistory(2) // Últimos 2 días para sparklines
        ]);
        
        // Guardar datos en el estado
        state.spots = parkingData || [];
        state.zones = zonesData || [];
        
        // Procesar historial: extraer datos por zona Y global
        if (historyResponse && historyResponse.success && historyResponse.samples && historyResponse.samples.length > 0) {
            const zoneData = {};
            
            // Obtener todas las zonas únicas del zones_summary de las muestras
            const allZoneIds = new Set();
            historyResponse.samples.forEach(sample => {
                if (sample.zones_summary && Array.isArray(sample.zones_summary)) {
                    sample.zones_summary.forEach(z => allZoneIds.add(z.id));
                }
            });
            
            console.log('📊 Procesando historial:', historyResponse.count, 'muestras');
            console.log('   Zonas encontradas en zones_summary:', Array.from(allZoneIds));
            
            // Extraer datos para cada zona encontrada
            allZoneIds.forEach(zoneId => {
                zoneData[zoneId] = extractZoneOccupancy(historyResponse.samples, zoneId);
            });
            
            // Extraer datos globales para el gráfico principal
            const globalOccupancy = extractGlobalOccupancy(historyResponse.samples);
            const aggregatedFromZones = aggregateGlobalFromZones(historyResponse.samples);
            
            state.historyData = { samples: historyResponse.samples, zoneData, globalOccupancy };
            console.log('   ✅ zoneData generado:', Object.keys(zoneData));
            console.log('   🌎 Global occupancy:', globalOccupancy.length, 'puntos');
            // Comparativa de datos globales vs agregado de zonas
            const diffSamples = globalOccupancy.map((val, i) => val - (aggregatedFromZones[i] ?? 0));
            const maxAbsDiff = diffSamples.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
            console.log('   🔎 Comparativa global vs zonas:', {
                maxAbsDiff,
                firstPair: { global: globalOccupancy[0], zonesAgg: aggregatedFromZones[0] },
                lastPair: { global: globalOccupancy[globalOccupancy.length-1], zonesAgg: aggregatedFromZones[aggregatedFromZones.length-1] }
            });
            
            // Inicializar gráfico principal CON datos históricos
            const ctx = document.getElementById('hourly-chart');
            if (ctx && globalOccupancy.length > 0) {
                UI_Charts.initChartWithData(ctx, globalOccupancy);
                
                // Calcular tendencia con datos históricos
                if (globalOccupancy.length >= 2) {
                    const current = Math.round(globalOccupancy[globalOccupancy.length - 1]);
                    const previous = Math.round(globalOccupancy[globalOccupancy.length - 2]);
                    const diff = current - previous;
                    const trendEl = document.getElementById('occupancy-trend');
                    const trendIcon = trendEl?.previousElementSibling;
                    
                    if (trendEl) {
                        trendEl.textContent = `${diff > 0 ? '+' : ''}${diff}%`;
                        
                        if (trendIcon) {
                            if (diff > 0) {
                                trendIcon.className = 'fa-solid fa-arrow-up text-[10px] text-red-600';
                                trendEl.className = 'text-[10px] font-bold text-red-700';
                                trendEl.parentElement.className = 'flex items-center gap-1 px-2 py-1 bg-red-100 rounded-full mb-1';
                            } else if (diff < 0) {
                                trendIcon.className = 'fa-solid fa-arrow-down text-[10px] text-green-600';
                                trendEl.className = 'text-[10px] font-bold text-green-700';
                                trendEl.parentElement.className = 'flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full mb-1';
                            } else {
                                trendIcon.className = 'fa-solid fa-minus text-[10px] text-slate-600';
                                trendEl.className = 'text-[10px] font-bold text-slate-700';
                                trendEl.parentElement.className = 'flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full mb-1';
                            }
                        }
                    }
                }
            } else if (ctx) {
                UI_Charts.initChart(ctx);
            }
        } else {
            state.historyData = { samples: [], zoneData: {}, globalOccupancy: [] };
            console.warn('⚠️ Sin datos de historial');
        }

        // Renderizar pines iniciales (adaptativo: puestos o zonas según zoom)
        MapMarkers.updateClusterView(state.spots, state.zones, handleSpotClick);
        UI_Sidebar.renderSidebar(state.spots, state.zones, state.historyData.zoneData, state.filter, state.searchQuery, null, handleSpotClick);

        // Agregar listener de clicks en el mapa para el builder
        try {
            const mapObj = MapCore.mapState && MapCore.mapState.map;
            if (mapObj) {
                mapObj.addListener('click', (e) => {
                    const latLng = e.latLng || e; // modular vs clásico
                    
                    // Si el builder está activo, usarlo
                    if (state.isAdminMode && state.isBuilderMode) {
                        const result = MapBuilder.handleMapClick(latLng);
                        if (result && result.start && result.end) {
                            showLineBuilderConfig(result.start, result.end);
                        }
                    }
                    // Si solo está el modo admin (sin builder), crear un puesto
                    else if (state.isAdminMode && state.currentUser) {
                        createSingleSpot(latLng);
                    }
                });
                // Cambio de zoom: alternar vista cluster / individual
                mapObj.addListener('zoom_changed', () => {
                    MapMarkers.updateClusterView(state.spots, state.zones, handleSpotClick);
                });
            }
        } catch (err) {
            console.warn('No se pudo agregar listener de click al mapa:', err);
        }

        logger.debug("✅ Sistema iniciado. Zonas cargadas:", zonesData);

    } catch (error) {
        console.error("Error crítico inicializando:", error);
        UI_Toasts.showToast("Error cargando el sistema", "error");
    }

    // 4. Iniciar Bucle de Datos
    fetchData(); // Primera carga inmediata
    const pollingInterval = CONFIG.PERFORMANCE?.POLLING_INTERVAL || 20000;
    const historyInterval = CONFIG.PERFORMANCE?.HISTORY_REFRESH || (10 * 60 * 1000);
    const timerInterval = CONFIG.PERFORMANCE?.TIMER_UPDATE || 5000;
    
    // Función para actualizar historial (reutilizable)
    const updateHistory = async () => {
        try {
            const historyResponse = await fetchOccupancyHistory(2);
            if (historyResponse && historyResponse.success && historyResponse.samples && historyResponse.samples.length > 0) {
                const zoneData = {};
                const allZoneIds = new Set();
                historyResponse.samples.forEach(sample => {
                    if (sample.zones_summary && Array.isArray(sample.zones_summary)) {
                        sample.zones_summary.forEach(z => allZoneIds.add(z.id));
                    }
                });
                allZoneIds.forEach(zoneId => {
                    zoneData[zoneId] = extractZoneOccupancy(historyResponse.samples, zoneId);
                });
                state.historyData = { samples: historyResponse.samples, zoneData };
                UI_Sidebar.renderSidebar(state.spots, state.zones, state.historyData.zoneData, state.filter, state.searchQuery, state.userReservation?.spotId, handleSpotClick);
            }
        } catch (err) {
            logger.error('Error actualizando historial:', err);
        }
    };
    
    // Almacenar intervalos para control con Visibility API
    const intervals = {
        data: setInterval(fetchData, pollingInterval),
        timer: setInterval(updateTimer, timerInterval),
        history: setInterval(updateHistory, historyInterval)
    };
    
    // Page Visibility API: pausar polling cuando el tab está oculto
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Tab oculto: pausar todos los intervalos
            logger.debug('⏸️ Tab oculto - pausando polling');
            clearInterval(intervals.data);
            clearInterval(intervals.timer);
            clearInterval(intervals.history);
        } else {
            // Tab visible: reanudar polling
            logger.debug('▶️ Tab visible - reanudando polling');
            fetchData(); // Fetch inmediato al volver
            intervals.data = setInterval(fetchData, pollingInterval);
            intervals.timer = setInterval(updateTimer, timerInterval);
            intervals.history = setInterval(updateHistory, historyInterval);
        }
    });
    
    // Actualizar tiempos relativos en UI sin necesidad de refetch cada 30s
    setInterval(() => {
        try {
            const free = (state.spots || []).filter(s => s.status === 1).length;
            const occupied = (state.spots || []).filter(s => s.status === 0).length;
            const reserved = (state.spots || []).filter(s => s.status === 2).length;
            // Re-render solo la sidebar para actualizar textos relativos
            UI_Sidebar.renderSidebar(state.spots, state.filter, state.searchQuery, state.myReservation ? state.myReservation.spotId : null, handleSpotClick);
            // Actualizar contadores/centro del chart también
            updateDashboard(free, occupied, reserved);
        } catch (e) {
            // no bloquear
        }
    }, 30000);

    // 5. Configurar Listeners del DOM
    setupDOMListeners();
    // Click en logo/nombre (arriba izquierda) vuelve a la portada
    try {
        const brand = document.getElementById('site-brand');
        if (brand) {
            brand.addEventListener('click', (e) => {
                window.location.href = 'index.html';
            });
        }
    } catch (err) {
        // ignore
    }
    
    logger.debug('✅ Dashboard inicializado correctamente');

    const btnCreateZone = document.getElementById('btn-create-zone');
    if (btnCreateZone) {
        btnCreateZone.addEventListener('click', async () => {
            const input = document.getElementById('new-zone-name');
            const name = input.value.trim();
            
            if (!name) {
                UI_Toasts.showToast('Por favor ingresa el nombre de la zona', 'info');
                return;
            }

            btnCreateZone.disabled = true;
            const origText = btnCreateZone.innerHTML;
            btnCreateZone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';

            try {
                logger.debug('Creando zona:', name);
                const result = await manageZone('create', { name });
                logger.debug('Respuesta de creación:', result);
                
                // La zona se considera creada si:
                // - API devuelve algo con success, id, o name
                // - O simplemente no falla (devuelve null pero sin error)
                UI_Toasts.showToast('Zona creada exitosamente', 'success');
                input.value = '';
                
                // Pequeña pausa y luego recargar zonas
                await new Promise(r => setTimeout(r, 500));
                state.zones = await fetchZones();
                renderZonesModal();
                
            } catch (error) {
                console.error('Error creando zona:', error);
                UI_Toasts.showToast('Error al crear zona: ' + error.message, 'error');
            } finally {
                btnCreateZone.disabled = false;
                btnCreateZone.innerHTML = origText;
            }
        });
    }
}); // <--- Cierre del DOMContentLoaded

// --- FUNCIÓN AUXILIAR: CREAR UN PUESTO ---
function createSingleSpot(latLng) {
    const lat = latLng.lat();
    const lng = latLng.lng();
    // Crear una previsualización del pin y esperar confirmación
    MapAdmin.createPreviewSpotAt({ lat: () => lat, lng: () => lng }, async (pos) => {
        // Aceptó: abrir modal de creación rellenando lat/lng con la posición final
        window.currentAdminSpotId = null; // Indica creación

        const latFinal = pos && pos.lat !== undefined ? pos.lat : lat;
        const lngFinal = pos && pos.lng !== undefined ? pos.lng : lng;

        document.getElementById('modal-admin-spot-id').innerText = 'Nuevo';
        document.getElementById('admin-spot-id-input').value = '';
        document.getElementById('admin-spot-desc-input').value = '';
        document.getElementById('admin-spot-lat-input').value = latFinal;
        document.getElementById('admin-spot-lng-input').value = lngFinal;
        document.getElementById('admin-spot-status-input').value = 1;

        const zoneSelect = document.getElementById('admin-spot-zone-input');
        if (zoneSelect) {
            zoneSelect.innerHTML = '<option value="">Sin asignar</option>' + (state.zones || []).map(z => `<option value="${z.id}">${z.name || z.id}</option>`).join('');
            zoneSelect.value = '';
        }

        UI_Modals.openModal('modal-edit-spot-admin');
    }, () => {
        // Cancel clicked: preview removed by MapAdmin
    });
}

// --- FUNCIÓN AUXILIAR: ABRIR MODAL PARA EDITAR ZONA ---
function openEditZoneModal(zoneId) {
    const zone = state.zones.find(z => z.id === zoneId);
    if (!zone) {
        UI_Toasts.showToast('Zona no encontrada', 'error');
        return;
    }

    // Llenar los campos del modal
    document.getElementById('modal-edit-zone-id').innerText = zone.name || zone.id;
    document.getElementById('edit-zone-name-input').value = zone.name || '';
    document.getElementById('edit-zone-order-input').value = zone.order || 1;
    document.getElementById('edit-zone-desc-input').value = zone.desc || '';

    // Guardar el ID actual para usar en guardar/eliminar
    window.currentEditZoneId = zoneId;

    // Abrir modal
    UI_Modals.openModal('modal-edit-zone');
}

// --- FUNCIÓN AUXILIAR: ABRIR MODAL ADMIN PARA EDITAR PUESTO ---
function openAdminSpotModal(spotId) {
    const spot = state.spots.find(s => s.id === spotId);
    if (!spot) {
        UI_Toasts.showToast('Puesto no encontrado', 'error');
        return;
    }

    // Llenar los campos del modal
    document.getElementById('modal-admin-spot-id').innerText = spot.id;
    document.getElementById('admin-spot-id-input').value = spot.id;
    document.getElementById('admin-spot-desc-input').value = spot.desc || '';
    document.getElementById('admin-spot-lat-input').value = spot.lat || '';
    document.getElementById('admin-spot-lng-input').value = spot.lng || '';
    document.getElementById('admin-spot-status-input').value = spot.status || 1;
    
    // Cargar opciones de zonas
    const zoneSelect = document.getElementById('admin-spot-zone-input');
    zoneSelect.innerHTML = '<option value="">Sin asignar</option>' + 
        (state.zones || []).map(z => `<option value="${z.id}">${z.name || z.id}</option>`).join('');
    zoneSelect.value = spot.zone_id || '';

    // Guardar el ID actual para usar en guardar/eliminar
    window.currentAdminSpotId = spotId;

    // Abrir modal
    UI_Modals.openModal('modal-edit-spot-admin');
}

// ========== FUNCIONES PARA MODAL DE GRÁFICO EXPANDIDO ==========
async function openExpandedChart(targetDate = null) {
    const modal = document.getElementById('modal-chart-expanded');
    if (!modal) return;

    // Mostrar modal con animación
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.transform').classList.remove('scale-95');
        modal.querySelector('.transform').classList.add('scale-100');
    });

    let historyData = state.historyData;
    
    // Si targetDate es provisto, cargar datos de esa fecha específica
    if (targetDate) {
        console.log('📅 Cargando datos para fecha:', targetDate);
        
        // Calcular cuántos días hacia atrás necesitamos cargar
        const now = new Date();
        const target = new Date(targetDate);
        const daysAgo = Math.ceil((now - target) / (1000 * 60 * 60 * 24));
        const daysToFetch = Math.max(1, daysAgo + 1); // +1 para asegurar que cubrimos el día completo
        
        console.log(`📥 Cargando ${daysToFetch} días de historial para alcanzar la fecha`);
        
        // Cargar suficientes días para incluir la fecha objetivo
        const response = await fetchOccupancyHistory(daysToFetch);
        
        if (response && response.samples && response.samples.length > 0) {
            console.log(`✅ Recibidos ${response.samples.length} snapshots`);
            
            // Filtrar solo las 24 horas de la fecha objetivo (00:00 a 23:59)
            const targetStart = new Date(target);
            targetStart.setHours(0, 0, 0, 0);
            const targetEnd = new Date(target);
            targetEnd.setHours(23, 59, 59, 999);
            
            console.log('🔍 Filtrando entre:', targetStart.toISOString(), 'y', targetEnd.toISOString());
            
            const filteredSamples = response.samples.filter(s => {
                const sampleDate = new Date(s.ts);
                return sampleDate >= targetStart && sampleDate <= targetEnd;
            });
            
            console.log(`📊 Muestras filtradas para el día: ${filteredSamples.length}`);
            
            if (filteredSamples.length === 0) {
                alert('No hay datos disponibles para la fecha seleccionada.');
                closeExpandedChart();
                return;
            }
            
            historyData = {
                samples: filteredSamples,
                zoneData: extractZoneOccupancy(filteredSamples),
                globalOccupancy: extractGlobalOccupancy(filteredSamples)
            };
        } else {
            alert('Error cargando datos históricos.');
            closeExpandedChart();
            return;
        }
    } else {
        // Usar datos actuales (últimas 24 horas desde state)
        if (!historyData || !historyData.samples || historyData.samples.length === 0) {
            logger.warn('No hay datos históricos para mostrar');
            alert('No hay datos disponibles.');
            closeExpandedChart();
            return;
        }
    }

    const globalOccupancy = extractGlobalOccupancy(historyData.samples);
    
    // Actualizar título
    const titleEl = document.getElementById('chart-modal-title');
    if (targetDate) {
        const dateStr = new Date(targetDate).toLocaleDateString('es-CL', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        titleEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    } else {
        titleEl.textContent = 'Últimas 24 horas';
    }
    
    // Calcular estadísticas
    const current = globalOccupancy[globalOccupancy.length - 1] || 0;
    const avg = globalOccupancy.reduce((a, b) => a + b, 0) / globalOccupancy.length;
    const max = Math.max(...globalOccupancy);
    const min = Math.min(...globalOccupancy);

    // Actualizar stats cards
    document.getElementById('chart-modal-current').textContent = `${Math.round(current)}%`;
    document.getElementById('chart-modal-avg').textContent = `${Math.round(avg)}%`;
    document.getElementById('chart-modal-max').textContent = `${Math.round(max)}%`;
    document.getElementById('chart-modal-min').textContent = `${Math.round(min)}%`;

    // Crear gráfico expandido con tooltips interactivos (esperar a que el modal esté visible)
    setTimeout(() => {
        const ctx = document.getElementById('expanded-chart');
        if (ctx) {
            UI_Charts.initExpandedChart(ctx, globalOccupancy, historyData.samples);
        }
    }, 350);

    // Calcular horarios pico (simplificado: encontrar los 3 valores más altos)
    const samplesWithTime = historyData.samples.map((s, i) => ({
        time: new Date(s.ts).toLocaleString('es-CL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
        value: s.global?.occupancyPct || 0,
        index: i
    }));
    
    const topPeaks = [...samplesWithTime]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
    
    const peakHoursEl = document.getElementById('chart-modal-peak-hours');
    peakHoursEl.innerHTML = topPeaks.map(peak => `
        <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
            <span class="font-semibold">${peak.time}</span>
            <span class="text-rose-600 font-bold">${Math.round(peak.value)}%</span>
        </div>
    `).join('');

    // Calcular análisis de demanda
    const avgOccupancy = globalOccupancy.reduce((a, b) => a + b, 0) / globalOccupancy.length;
    const variance = globalOccupancy.reduce((sum, val) => sum + Math.pow(val - avgOccupancy, 2), 0) / globalOccupancy.length;
    const stdDev = Math.sqrt(variance);
    const variability = stdDev / avgOccupancy * 100; // Coeficiente de variación
    
    // Umbrales configurables para recomendaciones
    const REC = (CONFIG && CONFIG.RECOMMENDATIONS) ? CONFIG.RECOMMENDATIONS : {};
    const CRIT_OCC = REC.CRITICAL_OCCUPANCY_PCT ?? 80;
    const CRIT_TIME_HIGH = REC.CRITICAL_TIME_HIGH ?? 30;
    const CRIT_TIME_MED = REC.CRITICAL_TIME_MED ?? 10;
    const VAR_HIGH = REC.VARIABILITY_HIGH ?? 30;
    const VAR_MED = REC.VARIABILITY_MED ?? 15;
    const AVAIL_GOOD = REC.AVAIL_GOOD ?? 40;
    const AVAIL_LOW = REC.AVAIL_LOW ?? 20;
    const PEAK_TH = REC.PEAK_THRESHOLD ?? 70;
    const [MORNING_START, MORNING_END] = REC.MORNING_RANGE ?? [7, 10];
    const [EVENING_START, EVENING_END] = REC.EVENING_RANGE ?? [17, 20];
    const MAX_ITEMS = REC.MAX_ITEMS ?? 4;

    // Calcular ocupación crítica (% del tiempo por encima del umbral)
    const criticalTime = globalOccupancy.filter(v => v >= CRIT_OCC).length;
    const criticalPercent = (criticalTime / globalOccupancy.length * 100);
    
    // Calcular disponibilidad promedio
    const avgAvailability = 100 - avgOccupancy;
    
    const trendsEl = document.getElementById('chart-modal-trends');
    trendsEl.innerHTML = `
        <div class="py-2 border-b border-slate-100">
            <span class="font-semibold">Ocupación promedio:</span>
            <span class="font-bold text-blue-600">${Math.round(avgOccupancy)}%</span>
        </div>
        <div class="py-2 border-b border-slate-100">
            <span class="font-semibold">Variabilidad:</span>
            <span class="font-bold ${variability > 30 ? 'text-amber-600' : 'text-emerald-600'}">
                ${variability > 30 ? 'Alta' : variability > 15 ? 'Media' : 'Baja'} (${Math.round(variability)}%)
            </span>
        </div>
        <div class="py-2 border-b border-slate-100">
            <span class="font-semibold">Tiempo crítico:</span>
            <span class="font-bold ${criticalPercent > 30 ? 'text-rose-600' : criticalPercent > 10 ? 'text-amber-600' : 'text-emerald-600'}">
                ${Math.round(criticalPercent)}% del período
            </span>
        </div>
        <div class="py-2">
            <span class="font-semibold">Rango de ocupación:</span>
            <span class="font-bold text-slate-700">${Math.round(min)}% - ${Math.round(max)}%</span>
        </div>
    `;

    // Generar recomendaciones basadas en los datos
    const recommendations = [];
    
    if (criticalPercent > CRIT_TIME_HIGH) {
        recommendations.push({
            icon: 'fa-triangle-exclamation',
            color: 'text-rose-600',
            text: 'Alta saturación detectada. Considere ampliar capacidad.',
            help: `Tiempo crítico = ${Math.round(criticalPercent)}% del período con ocupación ≥ ${CRIT_OCC}%.`
        });
    } else if (criticalPercent > CRIT_TIME_MED) {
        recommendations.push({
            icon: 'fa-clock',
            color: 'text-amber-600',
            text: 'Períodos de alta demanda frecuentes. Optimice la rotación.',
            help: `Se supera el umbral de saturación (≥ ${CRIT_OCC}%) en ${Math.round(criticalPercent)}% del período.`
        });
    }
    
    if (variability > VAR_HIGH) {
        recommendations.push({
            icon: 'fa-chart-line',
            color: 'text-blue-600',
            text: `Demanda irregular (CV ${Math.round(variability)}%). Implemente tarifas dinámicas y señalización.`,
            help: 'CV = Coeficiente de variación (desviación estándar / promedio). Indica cuánta variación hay en la demanda.'
        });
    }
    
    if (avgAvailability < AVAIL_LOW) {
        recommendations.push({
            icon: 'fa-users',
            color: 'text-amber-600',
            text: `Baja disponibilidad promedio (${Math.round(avgAvailability)}%). Revise políticas y tiempos máximos.`,
            help: 'Disponibilidad = 100% - ocupación promedio. Valores bajos sugieren falta de cupos o permanencias largas.'
        });
    }
    
    // Detectar horarios problemáticos
    const morningPeak = samplesWithTime.filter((s, i) => {
        const hour = new Date(historyData.samples[i].ts).getHours();
        return hour >= MORNING_START && hour <= MORNING_END;
    });
    const afternoonPeak = samplesWithTime.filter((s, i) => {
        const hour = new Date(historyData.samples[i].ts).getHours();
        return hour >= EVENING_START && hour <= EVENING_END;
    });
    
    const morningAvg = morningPeak.length > 0 ? morningPeak.reduce((a, b) => a + b.value, 0) / morningPeak.length : 0;
    const afternoonAvg = afternoonPeak.length > 0 ? afternoonPeak.reduce((a, b) => a + b.value, 0) / afternoonPeak.length : 0;
    
    if (morningAvg > PEAK_TH) {
        recommendations.push({
            icon: 'fa-sun',
            color: 'text-orange-600',
            text: `Pico matutino (${MORNING_START}-${MORNING_END}h) alto (${Math.round(morningAvg)}%). Priorice reservas.`,
            help: `Pico = promedio de la franja supera ${PEAK_TH}%. Ajuste operación para ese tramo.`
        });
    }
    
    if (afternoonAvg > PEAK_TH) {
        recommendations.push({
            icon: 'fa-moon',
            color: 'text-indigo-600',
            text: `Pico vespertino (${EVENING_START}-${EVENING_END}h) alto (${Math.round(afternoonAvg)}%). Aumente rotación.`,
            help: `Pico = promedio de la franja supera ${PEAK_TH}%. Considere medidas de rotación o señalización.`
        });
    }

    // Reglas de prioridad para evitar mensajes contradictorios
    // 1) Evaluar severidad de cada recomendación
    const withSeverity = recommendations.map(r => {
        let severity = 1; // info
        if (r.icon === 'fa-triangle-exclamation') severity = 3; // critical
        else if (r.icon === 'fa-clock' || r.icon === 'fa-users' || r.icon === 'fa-chart-line') severity = 2; // warning
        return { ...r, severity };
    });

    // 2) Si hay críticas, mantener críticas y warnings complementarios; remover mensajes "buenos"
    const hasCritical = withSeverity.some(r => r.severity === 3);
    let filtered = withSeverity;
    if (hasCritical) {
        filtered = withSeverity.filter(r => r.severity >= 2);
    } else {
        // Si hay warnings, no mostrar el mensaje de "capacidad adecuada"
        const hasWarning = withSeverity.some(r => r.severity === 2);
        if (hasWarning) {
            filtered = withSeverity.filter(r => r.severity >= 2 || (r.icon !== 'fa-circle-check'));
        }
    }

    // 3) Si no hay críticas ni warnings, mostrar mensaje positivo de salud del sistema
    if (!filtered.some(r => r.severity >= 2)) {
        if (avgAvailability >= AVAIL_GOOD && criticalPercent < CRIT_TIME_MED && variability < VAR_MED) {
            filtered.push({
                icon: 'fa-circle-check',
                color: 'text-emerald-600',
                severity: 0,
                text: `Buena disponibilidad promedio (${Math.round(avgAvailability)}%). Capacidad adecuada.`
            });
        } else {
            filtered.push({
                icon: 'fa-circle-check',
                color: 'text-emerald-600',
                severity: 0,
                text: 'Sistema operando dentro de parámetros normales.'
            });
        }
    }

    // 4) Orden por severidad y limitar cantidad
    filtered.sort((a, b) => b.severity - a.severity);
    filtered = filtered.slice(0, MAX_ITEMS);

    // Render
    const recommendationsEl = document.getElementById('chart-modal-recommendations');
    recommendationsEl.innerHTML = filtered.map(rec => `
        <div class="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
            <i class="fa-solid ${rec.icon} ${rec.color} mt-0.5 shrink-0"></i>
            <span class="text-xs leading-relaxed">
                ${rec.text}
                ${rec.help ? `<br><span class='text-[11px] text-slate-500'>${rec.help}</span>` : ''}
            </span>
        </div>
    `).join('');
}

function closeExpandedChart() {
    const modal = document.getElementById('modal-chart-expanded');
    if (!modal) return;

    // Animar cierre
    modal.classList.add('opacity-0');
    modal.querySelector('.transform').classList.remove('scale-100');
    modal.querySelector('.transform').classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        
        // Destruir gráfico para liberar memoria
        const canvas = document.getElementById('expanded-chart');
        if (canvas) {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }
    }, 300);
}

function setupInfoTooltips() {
    // Crear elemento de tooltip si no existe
    let tooltip = document.getElementById('info-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'info-tooltip';
        tooltip.className = 'fixed hidden bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl z-[10000] max-w-[260px] pointer-events-auto';
        tooltip.style.transition = 'opacity 200ms';
        document.body.appendChild(tooltip);
    }

    let currentBtn = null;

    // Event delegation para todos los botones info (toggle al hacer click)
    document.addEventListener('click', (e) => {
        const infoBtn = e.target.closest('.info-btn');
        if (infoBtn) {
            e.stopPropagation();
            const message = infoBtn.dataset.info;
            if (!message) return;

            // Si el mismo botón vuelve a clickearse, alternar visibilidad
            if (currentBtn === infoBtn && !tooltip.classList.contains('hidden')) {
                tooltip.style.opacity = '0';
                setTimeout(() => tooltip.classList.add('hidden'), 150);
                currentBtn = null;
                return;
            }

            currentBtn = infoBtn;

            // Posicionar tooltip
            const rect = infoBtn.getBoundingClientRect();
            tooltip.innerHTML = message; // permitir HTML (listas, <strong>, etc.)
            tooltip.classList.remove('hidden');
            
            // Posición: arriba del botón centrado
            const tooltipRect = tooltip.getBoundingClientRect();
            const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            const top = rect.top - tooltipRect.height - 8;
            
            tooltip.style.left = `${Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10))}px`;
            tooltip.style.top = `${Math.max(10, top)}px`;
            tooltip.style.opacity = '1';
        } else {
            // Cerrar tooltip si se hace click fuera
            tooltip.style.opacity = '0';
            setTimeout(() => tooltip.classList.add('hidden'), 200);
            currentBtn = null;
        }
    });

    // Cerrar con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            tooltip.style.opacity = '0';
            setTimeout(() => tooltip.classList.add('hidden'), 150);
            currentBtn = null;
        }
    });
}

// --- FUNCIÓN AUXILIAR: RENDERIZAR MODAL DE ZONAS ---
function renderZonesModal() {
    const container = document.getElementById('zones-content');
    if (!container) return;

    const zones = state.zones || [];
    const spots = state.spots || [];

    // Construir lista de zonas y añadir una zona virtual "Sin asignar" si hay puestos sin zona
    const unassignedSpots = (spots || []).filter(s => !s.zone_id || s.zone_id === '' || s.zone_id === null || s.zone_id === undefined);
    const zonesCopy = [...zones];
    const hasSinZona = zonesCopy.some(z => z.id === '' || z.id === 'sin-zona' || (z.name && z.name.toLowerCase().includes('sin')));
    if (unassignedSpots.length > 0 && !hasSinZona) {
        zonesCopy.unshift({ id: '', name: 'Sin asignar', _virtual: true });
    }

    // Barra de herramientas con búsqueda (se inserta al inicio del modal)
    const toolbar = `
        <div class="p-2 sm:p-3 border-b border-slate-100 bg-white flex items-center gap-2 sm:gap-3">
            <div class="flex-1">
                <input id="zones-search-input" type="search" placeholder="Buscar zona o puesto..." 
                    class="w-full text-xs sm:text-sm px-3 py-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none" value="${(state.zonesSearchQuery||'').replace(/"/g,'&quot;')}" />
            </div>
            <div class="text-[10px] sm:text-xs text-slate-400 whitespace-nowrap">${zonesCopy.length} zonas</div>
        </div>
    `;

    // Agrupar puestos por zona (incluye sin asignar)
    const spotsByZone = {};
    zonesCopy.forEach(z => {
        if (!z || !z.id) {
            spotsByZone[''] = unassignedSpots;
        } else {
            spotsByZone[z.id] = spots.filter(s => s.zone_id === z.id);
        }
    });

    // Aplicar filtro de búsqueda a zonas y puestos si existe query
    const query = (state.zonesSearchQuery || '').trim().toLowerCase();
    let renderZones = zonesCopy;
    if (query.length > 0) {
        renderZones = zonesCopy.filter(z => {
            const zoneText = ((z.name || '') + ' ' + (z.id || '')).toLowerCase();
            const zoneMatches = zoneText.includes(query);
            const zoneSpots = spotsByZone[z.id] || [];
            const spotMatches = zoneSpots.some(s => (((s.id || '') + ' ' + (s.desc || '')).toLowerCase().includes(query)));
            return zoneMatches || spotMatches;
        });
    }

    container.innerHTML = renderZones.map(zone => {
        const zoneSpots = spotsByZone[zone.id] || [];
        const free = zoneSpots.filter(s => s.status === 1).length;
        const occupied = zoneSpots.filter(s => s.status === 0).length;
        const reserved = zoneSpots.filter(s => s.status === 2).length;

        return `
            <details class="group border border-slate-200 rounded-2xl overflow-hidden">
                <summary class="bg-gradient-to-r from-blue-50 to-slate-50 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer">
                    <div class="flex-1 w-full">
                        <h4 class="text-base sm:text-lg font-bold text-slate-800">${zone.name || zone.id}</h4>
                        <div class="flex gap-3 sm:gap-4 mt-2 text-[11px] sm:text-xs font-semibold">
                            <span class="text-emerald-600"><i class="fa-solid fa-check-circle mr-1"></i>${free} L</span>
                            <span class="text-rose-600"><i class="fa-solid fa-times-circle mr-1"></i>${occupied} O</span>
                            <span class="text-amber-600"><i class="fa-solid fa-clock mr-1"></i>${reserved} R</span>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0 w-full sm:w-auto">
                            <button class="btn-edit-zone-main text-[11px] sm:text-xs text-blue-600 font-bold px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 hover:bg-blue-100 active:bg-blue-200 transition-colors flex-1 sm:flex-none" data-zone-id="${zone.id}">
                            <i class="fa-solid fa-pen mr-1"></i><span class="hidden sm:inline">Editar</span>
                        </button>
                            <button class="btn-delete-zone-main text-[11px] sm:text-xs text-rose-600 font-bold px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 hover:bg-rose-100 active:bg-rose-200 transition-colors flex-1 sm:flex-none" data-zone-id="${zone.id}">
                            <i class="fa-solid fa-trash mr-1"></i><span class="hidden sm:inline">Eliminar</span>
                        </button>
                    </div>
                </summary>

                <div class="p-3 sm:p-4 bg-white">
                        ${zoneSpots.length === 0 ? `
                            <p class="text-slate-400 text-center py-6 text-xs sm:text-sm">No hay puestos en esta zona</p>
                        ` : `
                            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                ${zoneSpots.map(spot => {
                                    // compute time string for this spot
                                    let timeText = '--';
                                    if (spot.status === 2) {
                                        timeText = 'Reservado';
                                    } else {
                                        let ts = getSpotTimestamp(spot);
                                        if (!ts) {
                                            try { const sync = localStorage.getItem('sparking_spots_synced_at'); if (sync) ts = new Date(sync).toISOString(); } catch (e) { ts = null; }
                                        }
                                        if (ts) timeText = formatTimeSince(ts);
                                    }
                                    return `
                                    <label class="p-2.5 sm:p-3 rounded-lg border-2 transition-all active:scale-95 hover:shadow-md flex flex-col items-center cursor-pointer zone-spot min-h-[80px] sm:min-h-[90px]" 
                                         data-spot-id="${spot.id}" data-zone-id="${zone.id}"
                                         style="border-color: ${spot.status === 1 ? '#10b981' : spot.status === 0 ? '#f43f5e' : '#f59e0b'}; background-color: ${spot.status === 1 ? '#ecfdf5' : spot.status === 0 ? '#fff5f7' : '#fffbeb'}">
                                        <input type="checkbox" class="bulk-spot-checkbox hidden" data-spot-id="${spot.id}" />
                                        <div class="font-bold text-xs sm:text-sm text-slate-700">${spot.id}</div>
                                        <div class="text-[9px] sm:text-[10px] font-semibold mt-1" style="color: ${spot.status === 1 ? '#10b981' : spot.status === 0 ? '#f43f5e' : '#f59e0b'}">
                                            ${spot.status === 1 ? 'L' : spot.status === 0 ? 'O' : 'R'}
                                        </div>
                                        <div class="text-[9px] sm:text-[10px] text-slate-400 mt-1">${timeText}</div>
                                    </label>
                                `}).join('')}
                            </div>
                        `}
                </div>
            </details>
        `;
    }).join('');

        // Insert toolbar HTML at the top
        container.innerHTML = toolbar + container.innerHTML;

        // Attach search listener (debounced) and update state
        const searchInput = document.getElementById('zones-search-input');
        if (searchInput) {
            let timer;
            const debounceDelay = CONFIG.PERFORMANCE?.DEBOUNCE_SEARCH || 400;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timer);
                const el = e.target;
                const val = el.value;
                // capture selection to restore after re-render
                const selStart = el.selectionStart || 0;
                const selEnd = el.selectionEnd || selStart;
                timer = setTimeout(() => {
                    state.zonesSearchQuery = (val || '').trim();
                    // Re-render modal
                    renderZonesModal();
                    // Restore focus and cursor position on the new input element
                    const newInput = document.getElementById('zones-search-input');
                    if (newInput) {
                        newInput.focus();
                        try { newInput.setSelectionRange(selStart, selEnd); } catch (err) { /* ignore */ }
                    }
                }, 250);
            });
        }

    // --- Listeners: per-zone selection button ---
    container.querySelectorAll('details').forEach(detailsEl => {
        const zoneId = detailsEl.querySelector('summary button.btn-edit-zone-main')?.dataset.zoneId || detailsEl.querySelector('summary')?.dataset?.zoneId || '';

        // Crear botón discreto de selección por zona dentro del summary (pequeño)
        const summary = detailsEl.querySelector('summary');
        if (summary) {
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn-select-zone ml-2 text-sm px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600';
            selectBtn.title = 'Seleccionar puestos en esta zona para acciones masivas';
            selectBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
            summary.querySelector('.flex.gap-2')?.appendChild(selectBtn);

            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentZone = state.bulkSelection.zoneId;
                const thisZone = detailsEl.querySelector('.btn-edit-zone-main')?.dataset.zoneId || '';

                // Toggle selection for this zone
                if (state.bulkSelection.enabled && state.bulkSelection.zoneId === thisZone) {
                    // turn off
                    state.bulkSelection.enabled = false;
                    state.bulkSelection.zoneId = null;
                    state.bulkSelection.selected = new Set();
                    // hide checkboxes for this zone
                    detailsEl.querySelectorAll('.bulk-spot-checkbox').forEach(cb => { cb.classList.add('hidden'); cb.checked = false; });
                    // remove action bar if exists
                    const bar = detailsEl.querySelector('.zone-action-bar'); if (bar) bar.remove();
                    selectBtn.classList.remove('bg-blue-600', 'text-white');
                } else {
                    // enable selection for this zone only
                    // clear previous selection and hide previous action bars
                    document.querySelectorAll('.zone-action-bar').forEach(b => b.remove());
                    document.querySelectorAll('.bulk-spot-checkbox').forEach(cb => { cb.classList.add('hidden'); cb.checked = false; });
                    state.bulkSelection.enabled = true;
                    state.bulkSelection.zoneId = thisZone;
                    state.bulkSelection.selected = new Set();
                    // show checkboxes inside this details
                    detailsEl.querySelectorAll('.bulk-spot-checkbox').forEach(cb => cb.classList.remove('hidden'));
                    selectBtn.classList.add('bg-blue-600', 'text-white');

                    // create action bar if not present
                    let actionBar = detailsEl.querySelector('.zone-action-bar');
                    if (!actionBar) {
                        actionBar = document.createElement('div');
                        actionBar.className = 'zone-action-bar mt-4 flex flex-wrap items-center gap-2';
                        actionBar.innerHTML = `
                            <button class="zone-action-select-all px-3 py-2 rounded-lg bg-slate-600 text-white text-sm font-bold">
                                <i class="fa-solid fa-check-double mr-1"></i>Seleccionar todo
                            </button>
                            <select class="zone-action-target px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
                                <option value="">Sin asignar</option>
                                ${state.zones.map(z => `<option value="${z.id}">${z.name || z.id}</option>`).join('')}
                            </select>
                            <button class="zone-action-assign px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">Asignar</button>
                            <button class="zone-action-delete px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold">Eliminar seleccionados</button>
                            <button class="zone-action-cancel px-3 py-2 rounded-lg bg-slate-100 text-sm">Cancelar</button>
                        `;
                        const content = detailsEl.querySelector('div.bg-white');
                        if (content) content.appendChild(actionBar);

                        // wire "select all" button
                        actionBar.querySelector('.zone-action-select-all').addEventListener('click', () => {
                            const checkboxes = Array.from(detailsEl.querySelectorAll('.bulk-spot-checkbox'));
                            const allChecked = checkboxes.every(cb => cb.checked);
                            
                            if (allChecked) {
                                // Deseleccionar todo
                                checkboxes.forEach(cb => {
                                    cb.checked = false;
                                    state.bulkSelection.selected.delete(cb.dataset.spotId);
                                });
                                actionBar.querySelector('.zone-action-select-all').innerHTML = '<i class="fa-solid fa-check-double mr-1"></i>Seleccionar todo';
                            } else {
                                // Seleccionar todo
                                checkboxes.forEach(cb => {
                                    cb.checked = true;
                                    state.bulkSelection.selected.add(cb.dataset.spotId);
                                });
                                actionBar.querySelector('.zone-action-select-all').innerHTML = '<i class="fa-solid fa-times mr-1"></i>Deseleccionar todo';
                            }
                        });

                        // wire action buttons
                        actionBar.querySelector('.zone-action-cancel').addEventListener('click', () => {
                            // same as turning off
                            state.bulkSelection.enabled = false;
                            state.bulkSelection.zoneId = null;
                            state.bulkSelection.selected = new Set();
                            detailsEl.querySelectorAll('.bulk-spot-checkbox').forEach(cb => { cb.classList.add('hidden'); cb.checked = false; });
                            actionBar.remove();
                            selectBtn.classList.remove('bg-blue-600', 'text-white');
                        });

                        actionBar.querySelector('.zone-action-assign').addEventListener('click', async () => {
                            const selected = Array.from(state.bulkSelection.selected);
                            const target = actionBar.querySelector('.zone-action-target').value || '';
                            if (!selected.length) { UI_Toasts.showToast('No hay puestos seleccionados', 'info'); return; }
                            try {
                                for (const id of selected) {
                                    // Buscar datos actuales del puesto para enviar lat/lng (backend requiere coordenadas)
                                    const spotObj = state.spots.find(s => s.id === id) || {};
                                    const payload = { zone_id: target };
                                    if (spotObj.lat !== undefined) payload.lat = spotObj.lat;
                                    if (spotObj.lng !== undefined) payload.lng = spotObj.lng;
                                    if (spotObj.desc !== undefined) payload.desc = spotObj.desc;
                                    if (spotObj.status !== undefined) payload.status = spotObj.status;

                                    await updateSpot(id, payload);

                                    // Actualizar estado local para reflejar el cambio inmediatamente
                                    const idx = state.spots.findIndex(s => s.id === id);
                                    if (idx !== -1) {
                                        state.spots[idx] = { ...state.spots[idx], zone_id: target, updated_at: new Date().toISOString() };
                                    }
                                }
                                UI_Toasts.showToast('Puestos reasignados', 'success');
                                // Limpiar modo selección y re-render UI luego refrescar desde servidor
                                state.bulkSelection.enabled = false;
                                state.bulkSelection.zoneId = null;
                                state.bulkSelection.selected = new Set();
                                renderZonesModal();
                                await fetchData();
                            } catch (err) {
                                console.error(err); UI_Toasts.showToast('Error al reasignar', 'error');
                            }
                        });

                        actionBar.querySelector('.zone-action-delete').addEventListener('click', async () => {
                            const selected = Array.from(state.bulkSelection.selected);
                            if (!selected.length) { UI_Toasts.showToast('No hay puestos seleccionados', 'info'); return; }
                            const ok = confirm(`Eliminar ${selected.length} puestos seleccionados? Esta acción no se puede deshacer.`);
                            if (!ok) return;
                            const btn = actionBar.querySelector('.zone-action-delete');
                            btn.disabled = true;
                            try {
                                // Usar helper bulkDeleteSpots para reportar resultados
                                const results = await bulkDeleteSpots(selected);
                                const successCount = results.filter(r => r.success).length;
                                const failCount = results.length - successCount;
                                if (successCount > 0) UI_Toasts.showToast(`${successCount} puestos eliminados`, 'success');
                                if (failCount > 0) UI_Toasts.showToast(`${failCount} errores al eliminar`, 'error');

                                // Limpiar modo selección y re-render
                                state.bulkSelection.enabled = false;
                                state.bulkSelection.zoneId = null;
                                state.bulkSelection.selected = new Set();
                                await fetchData();
                                renderZonesModal();
                            } catch (err) {
                                console.error(err);
                                UI_Toasts.showToast('Error al eliminar puestos', 'error');
                            } finally {
                                btn.disabled = false;
                            }
                        });
                    }
                }
            });
        }
    });

    // Checkbox clicks: update selection set
    container.querySelectorAll('.bulk-spot-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.dataset.spotId;
            const zoneId = e.target.closest('[data-zone-id]')?.dataset.zoneId || state.bulkSelection.zoneId || '';
            if (e.target.checked) state.bulkSelection.selected.add(id);
            else state.bulkSelection.selected.delete(id);
            
            // Actualizar texto del botón "Seleccionar todo"
            const detailsEl = e.target.closest('details');
            if (detailsEl) {
                const selectAllBtn = detailsEl.querySelector('.zone-action-select-all');
                if (selectAllBtn) {
                    const checkboxes = Array.from(detailsEl.querySelectorAll('.bulk-spot-checkbox'));
                    const allChecked = checkboxes.every(cb => cb.checked);
                    if (allChecked) {
                        selectAllBtn.innerHTML = '<i class="fa-solid fa-times mr-1"></i>Deseleccionar todo';
                    } else {
                        selectAllBtn.innerHTML = '<i class="fa-solid fa-check-double mr-1"></i>Seleccionar todo';
                    }
                }
            }
        });
    });

    // Agregar listeners para eliminar zonas con opción de borrar/reasignar
    container.querySelectorAll('.btn-delete-zone-main').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const zoneId = btn.dataset.zoneId;
            const zone = zones.find(z => z.id === zoneId);
            if (!zone) return;

            const zoneSpots = (state.spots || []).filter(s => s.zone_id === zoneId);

            // Si hay puestos, preguntar opción al usuario
            if (zoneSpots.length > 0) {
                const confirmDeleteAll = confirm(`La zona "${zone.name || zone.id}" tiene ${zoneSpots.length} puestos.\n\nOK = Eliminar zona Y BORRAR los puestos.\nCancel = Reasignar puestos a 'Sin asignar'.`);
                if (confirmDeleteAll) {
                    // Borrar spots primero
                    for (const s of zoneSpots) {
                        await deleteSpot(s.id);
                    }
                } else {
                    // Reasignar a Sin Zona ('')
                    for (const s of zoneSpots) {
                        await updateSpot(s.id, { zone_id: '' });
                    }
                }
            }

            // Finalmente eliminar la zona
            try {
                const res = await manageZone('delete', { id: zoneId });
                UI_Toasts.showToast('Zona eliminada exitosamente', 'success');
                await fetchData();
                renderZonesModal();
            } catch (error) {
                console.error('Error eliminando zona:', error);
                UI_Toasts.showToast('Error al eliminar zona: ' + (error.message || ''), 'error');
            }
        });
    });

    // Agregar listeners para editar zonas
    container.querySelectorAll('.btn-edit-zone-main').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const zoneId = btn.dataset.zoneId;
            openEditZoneModal(zoneId);
        });
    });

    // Click en spot para abrir modal de admin (solo si no estamos en modo selección)
    container.querySelectorAll('[data-spot-id]').forEach(el => {
        el.addEventListener('click', () => {
            if (state.bulkSelection.enabled) return; // no abrir modal cuando se selecciona
            const spotId = el.dataset.spotId;
            openAdminSpotModal(spotId);
        });
    });
}

// --- LÓGICA DE DATOS ---

async function fetchData() {
    if (state.isFetching) return;
    state.isFetching = true;

    try {
    const [parkingData, zonesData] = await Promise.all([
        fetchParkingStatus(),
        fetchZones()
    ]);

    // CORRECCIÓN: Usar el nombre correcto de la variable
    state.spots = parkingData || [];
    state.zones = zonesData || [];
        
        // Calcular estadísticas (usar state.spots)
        const free = (state.spots || []).filter(s => s.status === 1).length;
        const occupied = (state.spots || []).filter(s => s.status === 0).length;
        const reserved = (state.spots || []).filter(s => s.status === 2).length;

        // DEBUG: log schema of first spot once to detect timestamp field names
        try {
            if (!state._loggedSpotSchema && Array.isArray(state.spots) && state.spots.length > 0) {
                const sample = state.spots[0];
                logger.debug('Sample spot object keys:', Object.keys(sample));
                logger.debug('Sample spot object (truncated):', JSON.stringify(sample, Object.keys(sample).slice(0,20), 2));
                state._loggedSpotSchema = true;
            }
        } catch (err) {
            console.warn('Could not log sample spot schema', err);
        }

        // Actualizar UI
        updateDashboard(free, occupied, reserved);

        logger.debug("Zonas cargadas:", zonesData);
    // Aquí deberías llamar a una función de UI para pintar las zonas (UI_Sidebar.renderZones(zonesData))
    } catch (error) {
    console.error("Error inicializando:", error);
    } finally {
        state.isFetching = false;
        // Actualizar timestamp
        const timeEl = document.getElementById('last-updated-time');
        if(timeEl) timeEl.innerText = new Date().toLocaleTimeString('es-CL', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

function updateDashboard(free, occupied, reserved) {
    // 1. Mapa (cluster adaptativo)
    if (state.mapReady) {
        MapMarkers.updateClusterView(state.spots, state.zones, handleSpotClick);
    }

    // 2. Sidebar con accordion por zonas
    const mySpotId = state.myReservation ? state.myReservation.spotId : null;
    const zoneHistoryData = (state.historyData && state.historyData.zoneData) || {};
    UI_Sidebar.renderSidebar(
        state.spots,
        state.zones,
        zoneHistoryData,
        state.filter, 
        state.searchQuery, 
        mySpotId,
        handleSpotClick // Callback al clickear tarjeta
    );

    // 3. Contadores y Gráfico
    document.getElementById('count-free').innerText = free;
    document.getElementById('count-occupied').innerText = occupied;
    document.getElementById('count-reserved').innerText = reserved;
    
    // Total en el centro del chart
    const totalEl = document.getElementById('chart-total');
    if (totalEl) totalEl.innerText = free + occupied + reserved;
    
    // Porcentaje de ocupación actual
    const total = free + occupied + reserved;
    const occupancyPercentage = total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0;
    const occupancyEl = document.getElementById('occupancy-percentage');
    if (occupancyEl) occupancyEl.innerText = `${occupancyPercentage}%`;
    
    UI_Charts.updateChartData(free, occupied, reserved);

    // 4. Validar integridad de reserva local
    validateLocalReservation();
}

// --- INTERACCIÓN CON EL USUARIO ---

function handleSpotClick(spotIdOrObj) {
    // Soporta recibir string (desde sidebar) u objeto (desde mapa)
    const spotId = typeof spotIdOrObj === 'string' ? spotIdOrObj : spotIdOrObj.id;
    const spot = state.spots.find(s => s.id === spotId);
    if (!spot) return;

    // Llenar Modal
    document.getElementById('modal-spot-id').innerText = spot.id;
    document.getElementById('modal-spot-desc').innerText = spot.desc || 'Sin descripción';
    
    // Badge de estado
    const badge = document.getElementById('modal-spot-status-badge');
    if (badge) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider';
        if (spot.status === 1) {
            badge.classList.add('bg-emerald-100', 'text-emerald-700');
            badge.innerText = 'Disponible';
        } else if (spot.status === 0) {
            badge.classList.add('bg-rose-100', 'text-rose-700');
            badge.innerText = 'Ocupado';
        } else if (spot.status === 2) {
            badge.classList.add('bg-amber-100', 'text-amber-700');
            badge.innerText = 'Reservado';
        }
    }
    
    // Configurar botones según estado
    const btnReserve = document.getElementById('btn-confirm-reserve');
    const containerReserve = document.getElementById('reservation-form-container');
    const msgStatus = document.getElementById('modal-status-msg');

    if (spot.status === 1) { // Libre
        if (containerReserve) containerReserve.classList.remove('hidden');
        if (msgStatus) msgStatus.classList.add('hidden');
        if (btnReserve) {
            btnReserve.onclick = () => processReservation(spot.id);
        }
    } else {
        if (containerReserve) containerReserve.classList.add('hidden');
        if (msgStatus) {
            msgStatus.classList.remove('hidden');
            msgStatus.innerText = spot.status === 0 
                ? "Este puesto está ocupado físicamente." 
                : "Este puesto ya está reservado.";
        }
    }

    // Navegación
    const btnWaze = document.getElementById('btn-waze');
    const btnGmaps = document.getElementById('btn-gmaps');
    if (btnWaze) btnWaze.href = `https://waze.com/ul?ll=${spot.lat},${spot.lng}&navigate=yes`;
    if (btnGmaps) btnGmaps.href = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

    // Admin: Botón borrar
    const btnDelete = document.getElementById('btn-delete-spot');
    if (btnDelete) {
        if (state.currentUser && state.currentUser.email === 'admin@sparking.cl') {
            btnDelete.classList.remove('hidden');
            btnDelete.onclick = () => {
                UI_Modals.showConfirmModal(`¿Eliminar puesto ${spot.id}?`, async () => {
                    const success = await deleteSpot(spot.id);
                    if(success) {
                        UI_Toasts.showToast("Puesto eliminado");
                        UI_Modals.closeModal('spot-detail-modal');
                        fetchData();
                    } else {
                        UI_Toasts.showToast("Error al eliminar", "error");
                    }
                });
            };
        } else {
            btnDelete.classList.add('hidden');
        }
    }

    UI_Modals.openModal('spot-detail-modal');
}

async function processReservation(spotId) {
    if (!state.currentUser) {
        UI_Toasts.showToast("Debes iniciar sesión para reservar", "info");
        // Opcional: redirigir a login
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }

    const plateInput = document.getElementById('license-plate');
    const durationInput = document.getElementById('duration-select');
    
    const plate = plateInput.value;
    const duration = parseInt(durationInput.value);

    if (!isValidChileanPlate(plate)) {
        UI_Toasts.showToast("Patente inválida (Ej: AA-BB-12)", "error");
        return;
    }

    // Feedback visual
    const btn = document.getElementById('btn-confirm-reserve');
    const originalText = btn.innerText;
    btn.innerText = "Procesando...";
    btn.disabled = true;

    try {
        const result = await reserveSpot(spotId, plate, duration);
        
        // Éxito
        UI_Sounds.playSound('success');
        UI_Toasts.showToast("Reserva confirmada exitosamente");
        UI_Modals.closeModal('spot-detail-modal');

        // Guardar localmente para el timer (en memoria, no localStorage)
        const expiresAt = Date.now() + (duration * 60000);
        state.myReservation = { spotId, expiresAt };

        fetchData(); // Refrescar inmediato

    } catch (error) {
        UI_Sounds.playSound('error');
        UI_Toasts.showToast(error.message || "Error al reservar", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- UTILIDADES VARIAS ---

function validateLocalReservation() {
    if (!state.myReservation) return;
    
    // Verificar si en el servidor sigue reservado (estado 2)
    const spot = state.spots.find(s => s.id === state.myReservation.spotId);
    
    // Si el puesto ya no está reservado (pasó a libre u ocupado), limpiar local
    if (spot && spot.status !== 2) {
        logger.debug("⏰ Reserva expirada o cancelada en servidor. Limpiando local.");
        state.myReservation = null;
        updateTimerUI(null);
    }
}

function updateTimer() {
    if (!state.myReservation) {
        updateTimerUI(null);
        return;
    }

    const now = Date.now();
    const timeLeft = state.myReservation.expiresAt - now;

    if (timeLeft <= 0) {
        updateTimerUI("Expirado");
        // Auto-limpiar después de 5s
        setTimeout(() => {
            state.myReservation = null;
            updateTimerUI(null);
        }, 5000);
    } else {
        updateTimerUI(formatTimeLeft(timeLeft));
    }
}

function updateTimerUI(text) {
    const timerEl = document.getElementById('my-reservation-timer');
    
    if (!text) {
        if(timerEl) timerEl.innerText = "--:--";
        return;
    }
    if(timerEl) timerEl.innerText = text;
}

function updateUserUI(user) {
    const btnLogin = document.getElementById('btn-login-nav');
    const userMenu = document.getElementById('user-menu-nav');
    const nameEl = document.getElementById('user-name');
    const avatarBtn = document.getElementById('user-avatar');
    const popover = document.getElementById('user-popover');

    if (user) {
        if(btnLogin) btnLogin.classList.add('hidden');
        if(userMenu) userMenu.classList.remove('hidden');
        if(nameEl) nameEl.innerText = user.email.split('@')[0];
        // Popover handlers
        if(avatarBtn && popover) {
            avatarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle popover; CSS handles positioning (below & centered)
                popover.classList.toggle('hidden');
            });
            // Close when clicking outside
            document.addEventListener('click', (evt) => {
                if (!popover.classList.contains('hidden')) {
                    const inside = popover.contains(evt.target) || avatarBtn.contains(evt.target);
                    if (!inside) popover.classList.add('hidden');
                }
            });
        }
    } else {
        if(btnLogin) btnLogin.classList.remove('hidden');
        if(userMenu) userMenu.classList.add('hidden');
        if(popover) popover.classList.add('hidden');
    }
}

// --- SETUP DOM LISTENERS ---
function setupDOMListeners() {
    // Responsive admin toolbar: cambiar a icon-only cuando el ancho < 600px
    function updateAdminToolbarMode() {
        const toolbar = document.getElementById('admin-toolbar');
        if (!toolbar) return;
        // Use same breakpoint as CSS (768px) so JS and CSS agree
        const small = window.innerWidth < 768;
        if (small) {
            toolbar.classList.add('icon-only');
        } else {
            toolbar.classList.remove('icon-only');
            // If we're back to desktop mode and the toolbar has no saved position,
            // restore centering (remove inline left/top/transform overrides)
            try {
                const saved = localStorage.getItem('adminToolbarPos');
                if (!saved) {
                    toolbar.style.left = '';
                    toolbar.style.top = '';
                    toolbar.style.position = '';
                    toolbar.style.transform = '';
                }
            } catch (e) { /* ignore */ }
        }
    }
    // Inicial + resize (debounced)
    updateAdminToolbarMode();
    window.addEventListener('resize', debounce(updateAdminToolbarMode, 150));

    // Info tooltips para modal de gráfico
    setupInfoTooltips();

    // 1. Buscador
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        const debounceDelay = CONFIG.PERFORMANCE?.DEBOUNCE_SEARCH || 400;
        searchInput.addEventListener('input', debounce((e) => {
            state.searchQuery = e.target.value;
            // Refrescar solo sidebar sin llamar API
            const free = state.spots.filter(s => s.status === 1).length;
            const occupied = state.spots.filter(s => s.status === 0).length;
            const reserved = state.spots.filter(s => s.status === 2).length;
            updateDashboard(free, occupied, reserved);
        }, debounceDelay));
    }

    // 2. Filtros (Chips)
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            // UI Toggle
            document.querySelectorAll('.filter-chip').forEach(c => {
                c.classList.remove('bg-blue-600', 'text-white');
                c.classList.add('border-slate-200', 'text-slate-500', 'bg-white');
            });
            e.target.classList.remove('border-slate-200', 'text-slate-500', 'bg-white');
            e.target.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            
            // Lógica
            state.filter = e.target.dataset.filter;
            
            const free = state.spots.filter(s => s.status === 1).length;
            const occupied = state.spots.filter(s => s.status === 0).length;
            const reserved = state.spots.filter(s => s.status === 2).length;
            updateDashboard(free, occupied, reserved);
        });
    });

    // 3. Formato Patente Input
    const plateInput = document.getElementById('license-plate');
    if (plateInput) {
        plateInput.addEventListener('input', (e) => {
            e.target.value = formatLicensePlate(e.target.value);
        });
    }

    // 4. Toggle Admin
    const toggleAdmin = document.getElementById('admin-toggle');
    if (toggleAdmin) {
        toggleAdmin.addEventListener('change', (e) => {
            state.isAdminMode = e.target.checked;
            MapAdmin.toggleAdminMode(state.isAdminMode, state.spots);
            MapBuilder.toggleLineBuilder(false); // Apagar builder si se apaga admin
            
            // Mostrar/Ocultar herramientas admin
            const btnZones = document.getElementById('btn-manage-zones');
            const btnLine = document.getElementById('btn-line-mode');
            const adminToolbar = document.getElementById('admin-toolbar');
            
            if(state.isAdminMode) {
                if(btnZones) btnZones.classList.remove('hidden');
                if(btnLine) btnLine.classList.remove('hidden');
                if(adminToolbar) adminToolbar.classList.add('admin-active');
            } else {
                if(btnZones) btnZones.classList.add('hidden');
                if(btnLine) btnLine.classList.add('hidden');
                if(adminToolbar) adminToolbar.classList.remove('admin-active');
            }
        });
    }

    // 5. Botón Login (nav)
    const btnLoginNav = document.getElementById('btn-login-nav');
    if(btnLoginNav) {
        btnLoginNav.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    // 6. Logout
    const btnLogout = document.getElementById('btn-logout');
    if(btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await logoutUser();
            window.location.reload();
        });
    }

    // 7. Cerrar Modal de Puesto
    const btnCloseSpotModal = document.getElementById('btn-close-spot-modal');
    if(btnCloseSpotModal) {
        btnCloseSpotModal.addEventListener('click', () => {
            UI_Modals.closeModal('spot-detail-modal');
        });
    }

    // 8. Modal de Gráfico Expandido
    const chartCard = document.getElementById('chart-card');
    const chartModal = document.getElementById('modal-chart-expanded');
    const btnCloseChartModal = document.getElementById('btn-close-chart-modal');
    const chartDateSelector = document.getElementById('chart-date-selector');
    const btnChartToday = document.getElementById('btn-chart-today');
    const btnChartYesterday = document.getElementById('btn-chart-yesterday');
    
    if (chartCard && chartModal) {
        chartCard.addEventListener('click', () => {
            openExpandedChart();
        });
    }
    
    if (btnCloseChartModal) {
        btnCloseChartModal.addEventListener('click', () => {
            closeExpandedChart();
        });
    }
    
    // Selector de fecha
    if (chartDateSelector) {
        // Establecer fecha máxima (hoy)
        const today = new Date();
        chartDateSelector.max = today.toISOString().split('T')[0];
        chartDateSelector.value = today.toISOString().split('T')[0];
        
        chartDateSelector.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            if (selectedDate) {
                openExpandedChart(new Date(selectedDate + 'T12:00:00'));
            }
        });
    }
    
    // Botón "Hoy"
    if (btnChartToday) {
        btnChartToday.addEventListener('click', () => {
            const today = new Date();
            if (chartDateSelector) {
                chartDateSelector.value = today.toISOString().split('T')[0];
            }
            openExpandedChart(null); // null = usar datos actuales del state
        });
    }
    
    // Botón "Ayer"
    if (btnChartYesterday) {
        btnChartYesterday.addEventListener('click', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (chartDateSelector) {
                chartDateSelector.value = yesterday.toISOString().split('T')[0];
            }
            openExpandedChart(yesterday);
        });
    }
    
    // Cerrar con click en backdrop
    if (chartModal) {
        chartModal.addEventListener('click', (e) => {
            if (e.target === chartModal || e.target.classList.contains('bg-slate-900/95')) {
                closeExpandedChart();
            }
        });
    }
    
    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chartModal && !chartModal.classList.contains('hidden')) {
            closeExpandedChart();
        }
    });

    // Cerrar modal al clickear backdrop
    const spotModal = document.getElementById('spot-detail-modal');
    if(spotModal) {
        spotModal.addEventListener('click', (e) => {
            if(e.target === spotModal) {
                UI_Modals.closeModal('spot-detail-modal');
            }
        });
    }

    // 8. Sidebar Toggle (Móvil)
    const btnOpenSidebar = document.getElementById('btn-open-sidebar');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const sidebar = document.getElementById('sidebar');
    const adminToolbar = document.getElementById('admin-toolbar');

    if(btnOpenSidebar && sidebar) {
        btnOpenSidebar.addEventListener('click', () => {
            sidebar.classList.remove('-translate-x-full');
            // Ocultar toolbar admin en móviles cuando se abre el sidebar
            try {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile && adminToolbar) {
                    adminToolbar.style.display = 'none';
                }
            } catch {}
        });
    }

    if(btnCloseSidebar && sidebar) {
        btnCloseSidebar.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            // Mostrar nuevamente el toolbar admin en móviles al cerrar el sidebar
            try {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile && adminToolbar) {
                    adminToolbar.style.display = '';
                }
            } catch {}
        });
    }

    // 9. Botón Refrescar
    const btnRefresh = document.getElementById('btn-refresh');
    if(btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            const icon = btnRefresh.querySelector('i');
            if(icon) {
                icon.classList.add('animate-spin');
                setTimeout(() => icon.classList.remove('animate-spin'), 1000);
            }
            fetchData();
            UI_Toasts.showToast("Datos actualizados", "info");
        });
    }

    // 10. Modo Line Builder
    const btnLineMode = document.getElementById('btn-line-mode');
    if(btnLineMode) {
        btnLineMode.addEventListener('click', () => {
            const isActive = btnLineMode.classList.toggle('bg-blue-600');
            btnLineMode.classList.toggle('bg-slate-700');
            state.isBuilderMode = isActive;
            MapBuilder.toggleLineBuilder(isActive);
            
            // Aplicar cursor al mapa
            const mapElement = document.getElementById('map');
            if (mapElement) {
                if (isActive) {
                    mapElement.classList.add('map-builder-active');
                } else {
                    mapElement.classList.remove('map-builder-active');
                }
            }
            
            const instructions = document.getElementById('admin-instructions');
            if(instructions) {
                if(isActive) {
                    instructions.classList.remove('hidden');
                } else {
                    instructions.classList.add('hidden');
                }
            }
    // ============================================================
    // 4. LÓGICA DE ZONAS (AGREGAR ESTO AQUÍ)
    // ============================================================
    const btnCreateZone = document.getElementById('btn-create-zone');
    if (btnCreateZone) {
        btnCreateZone.addEventListener('click', async () => {
            const input = document.getElementById('new-zone-name');
            const name = input.value.trim();
            
            if (!name) {
                UI_Toasts.showToast('Ingresa un nombre para la zona', 'info');
                return;
            }

            // Feedback visual: Icono de carga
            const originalText = btnCreateZone.innerHTML;
            btnCreateZone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            // Llamada a la API (manageZone importada)
            const result = await manageZone('create', { name });
            
            if (result) {
                UI_Toasts.showToast('Zona creada correctamente', 'success');
                input.value = '';
                
                // Opcional: Si quieres refrescar la lista visualmente al instante:
                // const updatedZones = await fetchZones();
                // (Aquí llamarías a tu función de pintar zonas si existiera)
            } else {
                UI_Toasts.showToast('Error al crear zona', 'error');
            }
            
            // Restaurar botón
            btnCreateZone.innerHTML = originalText;
        });
    }
        logger.debug('✅ Event listeners configurados');

        });
    }

    // Botón: Gestionar Zonas (abre modal y carga zonas)
    const btnManageZones = document.getElementById('btn-manage-zones');
    if (btnManageZones) {
        btnManageZones.addEventListener('click', async () => {
            // Refrescar zonas antes de abrir
            state.zones = await fetchZones();
            renderZonesModal();
            UI_Modals.openModal('modal-zones');
        });
    }

    // Move toggle button: enable/disable move mode (session-only)
    const btnToggleMove = document.getElementById('btn-toggle-move');
    if (btnToggleMove) {
        btnToggleMove.addEventListener('click', (e) => {
            e.stopPropagation();
            state.adminMoveEnabled = !state.adminMoveEnabled;
            state.adminLastInteraction = Date.now();
            if (state.adminMoveEnabled) {
                btnToggleMove.classList.add('bg-blue-600');
                btnToggleMove.classList.remove('bg-slate-800/10');
                btnToggleMove.title = 'Desactivar mover';
                UI_Toasts.showToast('Modo mover activado: arrastra el toolbar', 'info');
            } else {
                btnToggleMove.classList.remove('bg-blue-600');
                btnToggleMove.classList.add('bg-slate-800/10');
                btnToggleMove.title = 'Permitir mover';
                UI_Toasts.showToast('Modo mover desactivado: posición bloqueada para esta sesión', 'success');
            }
        });
    }

    // Mobile: disable long-press move; dragging only allowed on desktop via button
    (function disableMobileLongPressMove() {
        /* Intentionally left empty to disable mobile long-press move behavior */
    })();

    // Cerrar modales admin
    const btnCloseLineModal = document.getElementById('btn-close-line-modal');
    if (btnCloseLineModal) {
        btnCloseLineModal.addEventListener('click', () => {
            UI_Modals.closeModal('modal-line-builder');
        });
    }

    const btnCancelBuilder = document.getElementById('btn-cancel-builder');
    if (btnCancelBuilder) {
        btnCancelBuilder.addEventListener('click', () => {
            UI_Modals.closeModal('modal-line-builder');
        });
    }

    const btnCloseZonesModal = document.getElementById('btn-close-zones-modal');
    if (btnCloseZonesModal) {
        btnCloseZonesModal.addEventListener('click', () => {
            UI_Modals.closeModal('modal-zones');
        });
    }

    // Confirmar creación en fila
    const btnConfirmBuilder = document.getElementById('btn-confirm-builder');
    if (btnConfirmBuilder) {
        btnConfirmBuilder.addEventListener('click', async () => {
            const count = parseInt(document.getElementById('builder-count').value) || 5;
            const distance = parseFloat(document.getElementById('builder-distance').value) || 5;
            const prefix = document.getElementById('builder-prefix').value || 'A-';
            const startNum = parseInt(document.getElementById('builder-start-num').value) || 1;

            if (count < 2) {
                UI_Toasts.showToast('Cantidad debe ser al menos 2', 'error');
                return;
            }

            const btn = btnConfirmBuilder;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
            btn.disabled = true;

            try {
                // Calcular puntos basado en distancia
                const start = window.builderStartPoint;
                const end = window.builderEndPoint;
                
                if (!start || !end) {
                    UI_Toasts.showToast('Puntos no definidos', 'error');
                    return;
                }

                // Convertir distancia (metros) a coordenadas
                const spherical = google.maps.geometry.spherical;
                const totalDistance = spherical.computeDistanceBetween(start, end);
                const heading = spherical.computeHeading(start, end);
                const step = totalDistance / (count - 1 || 1);

                let createdCount = 0;

                for (let i = 0; i < count; i++) {
                    const pos = spherical.computeOffset(start, i * step, heading);
                    const num = startNum + i;
                    const id = `${prefix}${num.toString().padStart(2, '0')}`;
                    
                    await MapBuilder.executeBatchCreate(pos, pos, {
                        count: 1,
                        prefix: id.split(/\d+/)[0],
                        startNum: num
                    });
                    createdCount++;
                }

                UI_Toasts.showToast(`${createdCount} puestos creados exitosamente`, 'success');
                UI_Modals.closeModal('modal-line-builder');
                fetchData();
            } catch (error) {
                console.error('Error creando puestos:', error);
                UI_Toasts.showToast('Error al crear puestos', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }

    // Escuchar cambios en cantidad y actualizar preview
    const builderCount = document.getElementById('builder-count');
    if (builderCount) {
        builderCount.addEventListener('change', () => {
            const count = parseInt(builderCount.value) || 5;
            if (window.builderStartPoint && window.builderEndPoint) {
                MapBuilder.previewLine(window.builderStartPoint, window.builderEndPoint, count);
            }
        });
    }

    // Selector de modo: Cantidad vs Distancia
    const btnModeQuantity = document.getElementById('builder-mode-quantity');
    const btnModeDistance = document.getElementById('builder-mode-distance');
    const sectionQuantity = document.getElementById('builder-section-quantity');
    const sectionDistance = document.getElementById('builder-section-distance');

    if (btnModeQuantity && btnModeDistance) {
        btnModeQuantity.addEventListener('click', () => {
            btnModeQuantity.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
            btnModeQuantity.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            btnModeDistance.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            btnModeDistance.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
            sectionQuantity?.classList.remove('hidden');
            sectionDistance?.classList.add('hidden');
            window.builderMode = 'quantity';
        });

        btnModeDistance.addEventListener('click', () => {
            btnModeDistance.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
            btnModeDistance.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            btnModeQuantity.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            btnModeQuantity.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
            sectionDistance?.classList.remove('hidden');
            sectionQuantity?.classList.add('hidden');
            window.builderMode = 'distance';
        });
    }

    // === LISTENERS DEL MODAL DE EDICIÓN DE PUESTO (ADMIN) ===
    const btnCloseAdminSpotModal = document.getElementById('btn-close-admin-spot-modal');
    if (btnCloseAdminSpotModal) {
        btnCloseAdminSpotModal.addEventListener('click', () => {
            UI_Modals.closeModal('modal-edit-spot-admin');
        });
    }

    const btnSaveAdminSpot = document.getElementById('btn-save-admin-spot');
    if (btnSaveAdminSpot) {
        btnSaveAdminSpot.addEventListener('click', async () => {
            const spotId = window.currentAdminSpotId; // null => crear

            const newId = document.getElementById('admin-spot-id-input').value.trim().toUpperCase();
            const desc = document.getElementById('admin-spot-desc-input').value.trim();
            const zoneId = document.getElementById('admin-spot-zone-input').value || null;
            const lat = parseFloat(document.getElementById('admin-spot-lat-input').value);
            const lng = parseFloat(document.getElementById('admin-spot-lng-input').value);
            const status = parseInt(document.getElementById('admin-spot-status-input').value);

            if (!newId) {
                UI_Toasts.showToast('El ID es requerido', 'error');
                return;
            }

            btnSaveAdminSpot.disabled = true;
            btnSaveAdminSpot.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

            try {
                if (!spotId) {
                    // Crear nuevo puesto
                    logger.debug('Creando nuevo puesto:', { newId, desc, zoneId, lat, lng, status });
                    const result = await createSpot({ id: newId, desc, zone_id: zoneId, lat, lng, status });
                    if (!result) throw new Error('Error creando puesto');
                    UI_Toasts.showToast('Puesto creado exitosamente', 'success');
                    try { MapAdmin.clearPreviewSpot(); } catch(e) { /* ignore */ }
                } else {
                    // Actualizar existente
                    logger.debug('Guardando cambios de puesto:', { spotId, newId, desc, zoneId, lat, lng, status });
                    const result = await updateSpot(spotId, {
                        id: newId,
                        desc: desc,
                        zone_id: zoneId,
                        lat: lat,
                        lng: lng,
                        status: status
                    });
                    if (!result) throw new Error('Error actualizando puesto');
                    UI_Toasts.showToast('Puesto actualizado exitosamente', 'success');
                    try { MapAdmin.clearPreviewSpot(); } catch(e) { /* ignore */ }
                }

                UI_Modals.closeModal('modal-edit-spot-admin');
                // Recargar y renderizar todo
                setTimeout(() => fetchData(), 300);
            } catch (error) {
                console.error('Error al guardar:', error);
                UI_Toasts.showToast('Error al guardar: ' + (error.message || ''), 'error');
            } finally {
                btnSaveAdminSpot.disabled = false;
                btnSaveAdminSpot.innerHTML = '<i class="fa-solid fa-save"></i> Guardar Cambios';
            }
        });
    }

    const btnDeleteAdminSpot = document.getElementById('btn-delete-admin-spot');
    if (btnDeleteAdminSpot) {
        btnDeleteAdminSpot.addEventListener('click', async () => {
            const spotId = window.currentAdminSpotId;
            if (!spotId) return;

            const confirm_delete = confirm(`¿Estás seguro de que deseas eliminar el puesto ${spotId}?`);
            if (!confirm_delete) return;

            btnDeleteAdminSpot.disabled = true;
            btnDeleteAdminSpot.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';

            try {
                const result = await deleteSpot(spotId);
                if (result) {
                    UI_Toasts.showToast(`Puesto ${spotId} eliminado`, 'success');
                    UI_Modals.closeModal('modal-edit-spot-admin');
                    fetchData();
                } else {
                    UI_Toasts.showToast('Error al eliminar puesto', 'error');
                }
            } catch (error) {
                UI_Toasts.showToast('Error al eliminar', 'error');
                console.error(error);
            } finally {
                btnDeleteAdminSpot.disabled = false;
                btnDeleteAdminSpot.innerHTML = '<i class="fa-solid fa-trash"></i> Eliminar Puesto';
            }
        });
    }

    // === LISTENERS DEL MODAL DE EDICIÓN DE ZONA ===
    const btnCloseEditZoneModal = document.getElementById('btn-close-edit-zone-modal');
    if (btnCloseEditZoneModal) {
        btnCloseEditZoneModal.addEventListener('click', () => {
            UI_Modals.closeModal('modal-edit-zone');
        });
    }

    const btnSaveEditZone = document.getElementById('btn-save-edit-zone');
    if (btnSaveEditZone) {
        btnSaveEditZone.addEventListener('click', async () => {
            const zoneId = window.currentEditZoneId;
            if (!zoneId) return;

            const newName = document.getElementById('edit-zone-name-input').value.trim();
            const newOrder = parseInt(document.getElementById('edit-zone-order-input').value) || 1;
            const newDesc = document.getElementById('edit-zone-desc-input').value.trim();

            if (!newName) {
                UI_Toasts.showToast('El nombre de la zona es requerido', 'error');
                return;
            }

            btnSaveEditZone.disabled = true;
            btnSaveEditZone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

            try {
                logger.debug('Guardando cambios de zona:', { zoneId, newName, newOrder, newDesc });
                
                // Intentar guardar en la API
                const result = await manageZone('update', {
                    id: zoneId,
                    name: newName,
                    order: newOrder,
                    desc: newDesc
                });
                
                logger.debug('Respuesta de actualización de zona:', result);

                // Actualizar la zona en state.zones localmente
                const zone = state.zones.find(z => z.id === zoneId);
                if (zone) {
                    zone.name = newName;
                    zone.order = newOrder;
                    zone.desc = newDesc;
                }

                UI_Toasts.showToast('Zona actualizada exitosamente', 'success');
                UI_Modals.closeModal('modal-edit-zone');
                
                // Recargar y renderizar todo
                setTimeout(() => {
                    state.zones = state.zones.sort((a, b) => (a.order || 0) - (b.order || 0));
                    renderZonesModal();
                }, 300);
            } catch (error) {
                console.error('Error al guardar zona:', error);
                UI_Toasts.showToast('Error al guardar: ' + error.message, 'error');
            } finally {
                btnSaveEditZone.disabled = false;
                btnSaveEditZone.innerHTML = '<i class="fa-solid fa-save"></i> Guardar Cambios';
            }
        });
    }

    const btnDeleteEditZone = document.getElementById('btn-delete-edit-zone');
    if (btnDeleteEditZone) {
        btnDeleteEditZone.addEventListener('click', async () => {
            const zoneId = window.currentEditZoneId;
            if (!zoneId) return;

            const confirm_delete = confirm(`¿Estás seguro de que deseas eliminar esta zona? Los puestos no serán eliminados.`);
            if (!confirm_delete) return;

            btnDeleteEditZone.disabled = true;
            btnDeleteEditZone.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';

            try {
                const result = await manageZone('delete', { id: zoneId });
                logger.debug('Respuesta de eliminación:', result);
                
                UI_Toasts.showToast('Zona eliminada exitosamente', 'success');
                UI_Modals.closeModal('modal-edit-zone');
                
                // Recargar zonas
                await new Promise(r => setTimeout(r, 300));
                state.zones = await fetchZones();
                renderZonesModal();
            } catch (error) {
                console.error('Error al eliminar zona:', error);
                UI_Toasts.showToast('Error al eliminar: ' + error.message, 'error');
            } finally {
                btnDeleteEditZone.disabled = false;
                btnDeleteEditZone.innerHTML = '<i class="fa-solid fa-trash"></i> Eliminar Zona';
            }
        });
    }

}

// --- LÓGICA AUXILIAR PARA EL BUILDER ---
function showLineBuilderConfig(start, end) {
    // Guardar puntos en variables globales para usarlas al confirmar
    window.builderStartPoint = start;
    window.builderEndPoint = end;
    
    // Mostrar preview
    MapBuilder.previewLine(start, end, parseInt(document.getElementById('builder-count').value || 5));
    
    // Abrir modal
    UI_Modals.openModal('modal-line-builder');
}