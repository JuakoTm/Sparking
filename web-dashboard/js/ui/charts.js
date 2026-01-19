// js/ui/charts.js

let hourlyChart = null;
const hourlyData = []; // Historial de ocupación por hora
const zoneCharts = {}; // Sparklines por zona: { zoneId: chartInstance }

/**
 * Inicializa el gráfico principal con datos históricos reales
 * @param {HTMLCanvasElement} ctx - Canvas context
 * @param {Array<number>} historyData - Datos históricos de ocupación
 */
export function initChartWithData(ctx, historyData) {
    console.log('🔍 initChartWithData llamado:', {
        ctx: !!ctx,
        ctxType: ctx?.nodeName,
        ctxId: ctx?.id,
        width: ctx?.width,
        height: ctx?.height,
        offsetWidth: ctx?.offsetWidth,
        offsetHeight: ctx?.offsetHeight,
        clientWidth: ctx?.clientWidth,
        clientHeight: ctx?.clientHeight,
        historyLength: historyData?.length,
        chartJsAvailable: typeof Chart !== 'undefined'
    });
    
    if (!ctx || !historyData || historyData.length === 0) {
        console.warn('⚠️ Faltan parámetros, fallback a initChart');
        initChart(ctx);
        return;
    }

    // Verificar dimensiones del canvas
    if (ctx.offsetWidth === 0 || ctx.offsetHeight === 0) {
        console.error('❌ Canvas sin dimensiones:', ctx.id, ctx.offsetWidth, 'x', ctx.offsetHeight);
        console.log('⏳ Reintentando en 100ms...');
        setTimeout(() => initChartWithData(ctx, historyData), 100);
        return;
    }

    // Destruir chart existente si hay uno (usando Chart.getChart para manejar casos edge)
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        console.log('🗑️ Destruyendo chart existente (ID:', existingChart.id, ')');
        existingChart.destroy();
    }
    if (hourlyChart) {
        hourlyChart = null;
    }

    // Tomar últimos 48 puntos
    const dataToShow = historyData.slice(-48);
    console.log('📊 Datos para gráfico:', dataToShow.slice(0, 5), '...', 'Total:', dataToShow.length);
    
    try {
        hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataToShow.map((_, i) => i),
            datasets: [{
                data: dataToShow,
                borderColor: '#3b82f6',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 5,
                    bottom: 5,
                    left: 0,
                    right: 0
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '5%',
                    display: false,
                    grid: { display: false }
                },
                x: {
                    display: false,
                    grid: { display: false }
                }
            },
            interaction: {
                mode: 'none'
            }
        }
    });
    
        console.log('✅ Chart creado exitosamente:', {
            instance: !!hourlyChart,
            data: hourlyChart?.data?.datasets[0]?.data?.length,
            canvas: hourlyChart?.canvas?.id,
            visible: hourlyChart?.canvas?.offsetWidth > 0,
            canvasSize: `${hourlyChart?.canvas?.offsetWidth}x${hourlyChart?.canvas?.offsetHeight}`,
            chartSize: `${hourlyChart?.width}x${hourlyChart?.height}`
        });
        
        // Forzar render después de un momento
        setTimeout(() => {
            if (hourlyChart) {
                console.log('🔄 Forzando render del chart...');
                hourlyChart.update('none');
            }
        }, 50);
    } catch (error) {
        console.error('❌ Error creando chart:', error);
        hourlyChart = null;
    }
}

export function initChart(ctx) {
    if (!ctx) return;

    // Destruir chart existente si hay uno
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }
    if (hourlyChart) {
        hourlyChart = null;
    }

    // Inicializar con datos vacíos (fallback)
    hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 5,
                    bottom: 5,
                    left: 0,
                    right: 0
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '5%',
                    display: false,
                    grid: { display: false }
                },
                x: {
                    display: false,
                    grid: { display: false }
                }
            },
            interaction: {
                mode: 'none'
            }
        }
    });

}

/**
 * Crea un sparkline mini para una zona específica
 * @param {HTMLCanvasElement} ctx - Canvas context
 * @param {Array<number>} data - Array de porcentajes de ocupación
 * @param {string} color - Color de la línea (hex)
 * @returns {Chart} - Instancia de Chart.js
 */
export function createZoneSparkline(ctx, data, color = '#3b82f6') {
    if (!ctx || !data || data.length === 0) return null;

    // Si solo hay 1 punto, duplicarlo para que Chart.js pueda dibujar
    const chartData = data.length === 1 ? [data[0], data[0]] : data;

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map((_, i) => i),
            datasets: [{
                data: chartData,
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                fill: false,
                tension: 0.4,
                pointRadius: data.length <= 3 ? 3 : 0,
                pointHoverRadius: data.length <= 3 ? 4 : 0,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 5,
                    bottom: 5,
                    left: 0,
                    right: 0
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    enabled: data.length <= 10,
                    callbacks: {
                        label: (context) => `${context.parsed.y}% ocupación`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '5%',
                    display: false,
                    grid: { display: false }
                },
                x: {
                    display: false,
                    grid: { display: false }
                }
            },
            interaction: { mode: data.length <= 10 ? 'index' : 'none' },
            animation: {
                duration: 400
            }
        }
    });
}

/**
 * Actualiza o crea sparkline para una zona
 * @param {string} zoneId - ID de la zona
 * @param {Array<number>} data - Datos de ocupación
 * @param {string} canvasId - ID del canvas
 * @param {string} color - Color de la línea
 */
export function updateZoneSparkline(zoneId, data, canvasId, color = '#3b82f6') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) {
        console.warn('⚠️ Canvas no encontrado o sin datos:', canvasId);
        return;
    }

    // Verificar dimensiones del canvas
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        console.warn('⚠️ Canvas sin dimensiones:', canvasId, canvas.offsetWidth, 'x', canvas.offsetHeight);
        return;
    }

    const ctx = canvas.getContext('2d');
    
    // Destruir chart existente en el canvas (usando Chart.getChart)
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    if (zoneCharts[zoneId]) {
        zoneCharts[zoneId] = null;
    }
    
    console.log('📊 Creando sparkline para', zoneId, '- Datos:', data.length, 'puntos');
    zoneCharts[zoneId] = createZoneSparkline(ctx, data, color);
}

/**
 * Destruye todos los sparklines de zonas
 */
export function destroyZoneSparklines() {
    Object.values(zoneCharts).forEach(chart => chart && chart.destroy());
    Object.keys(zoneCharts).forEach(key => delete zoneCharts[key]);
}

/**
 * Actualiza el gráfico principal con datos históricos
 * @param {Array<number>} historyData - Array de porcentajes históricos
 */
export function updateChartWithHistory(historyData) {
    if (!hourlyChart || !historyData || historyData.length === 0) return;
    
    // Tomar últimos puntos (máximo 48 para que no se vea saturado)
    const dataToShow = historyData.slice(-48);
    
    hourlyChart.data.labels = dataToShow.map((_, i) => i);
    hourlyChart.data.datasets[0].data = dataToShow;
    hourlyChart.update('none'); // Sin animación para que sea instantáneo
    
    console.log('📈 Gráfico principal actualizado con', dataToShow.length, 'puntos históricos');
}

/**
 * Actualiza datos del gráfico (función legacy para compatibilidad)
 * @param {number} free - Espacios libres
 * @param {number} occupied - Espacios ocupados
 * @param {number} reserved - Espacios reservados
 */
export function updateChartData(free, occupied, reserved) {
    // Esta función ya no hace nada porque el gráfico ahora usa datos históricos
    // Se mantiene para compatibilidad con código existente
    console.log('📊 updateChartData llamado (legacy):', { free, occupied, reserved });
}

/**
 * Crea un gráfico expandido con tooltips interactivos detallados
 * @param {HTMLCanvasElement} ctx - Canvas context
 * @param {Array<number>} historyData - Datos históricos de ocupación
 * @param {Array<Object>} samples - Samples originales con timestamps
 */
export function initExpandedChart(ctx, historyData, samples) {
    if (!ctx || !historyData || historyData.length === 0) return;

    // Destruir chart existente
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }

    // Preparar labels con fechas reales
    const labels = samples.map(s => new Date(s.ts));

    // Estado de hover controlado por eventos (no usar tooltip interno)
    let hoverIndex = null;

    // Plugin: dibuja línea vertical punteada en el índice activo
    const verticalLinePlugin = {
        id: 'verticalLine',
        afterDraw(chart) {
            if (hoverIndex === null) return;
            const meta = chart.getDatasetMeta(0);
            const element = meta && meta.data && meta.data[hoverIndex];
            if (!element) return;
            const x = element.x;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            const ctx = chart.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.restore();
        }
    };

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ocupación',
                data: historyData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHoverBackgroundColor: 'transparent',
                pointHoverBorderColor: 'transparent',
                pointHoverBorderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 15,
                    bottom: 5,
                    left: 5,
                    right: 5
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
                axis: 'x'
            },
            plugins: {
                legend: { display: false },
                verticalLine: {},
                tooltip: { enabled: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    suggestedMax: 105,
                    grace: '5%',
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: (value) => {
                            // Solo mostrar ticks hasta 100%, pero mantener espacio
                            return value <= 100 ? `${value}%` : '';
                        },
                        color: '#64748b',
                        font: { size: 11 },
                        stepSize: 20,
                        max: 100
                    }
                },
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'HH:mm'
                        },
                        tooltipFormat: 'DD MMM YYYY, HH:mm'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            },
            elements: {
                point: {
                    hitRadius: 10,
                    hoverRadius: 6
                }
            }
        },
        plugins: [verticalLinePlugin]
    });

    // Crear info box flotante (HTML) si no existe
    let infoBox = document.getElementById('expanded-chart-infobox');
    if (!infoBox) {
        infoBox = document.createElement('div');
        infoBox.id = 'expanded-chart-infobox';
        infoBox.style.position = 'fixed';
        infoBox.style.zIndex = '10000';
        infoBox.style.pointerEvents = 'none';
        infoBox.style.background = 'rgba(255,255,255,0.98)';
        infoBox.style.border = '1px solid rgba(203,213,225,1)';
        infoBox.style.borderRadius = '8px';
        infoBox.style.padding = '8px 10px';
        infoBox.style.fontFamily = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        infoBox.style.fontSize = '11px';
        infoBox.style.color = '#1e293b';
        infoBox.style.boxShadow = '0 8px 24px rgba(15,23,42,0.12)';
        infoBox.style.display = 'none';
        document.body.appendChild(infoBox);
    }

    // Helpers para formatear
    const formatInfo = (index) => {
        const date = labels[index];
        const dayName = date.toLocaleDateString('es-CL', { weekday: 'short' });
        const day = date.getDate();
        const month = date.toLocaleDateString('es-CL', { month: 'short' });
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const pct = Math.round(historyData[index] || 0);
        return {
            dateStr: `${dayName}, ${day} ${month} ${year}`,
            timeStr: `${hours}:${minutes} hrs`,
            pct: `${pct}% ocupación`
        };
    };

    // Posicionar el cuadro al lado de la línea (centrado verticalmente en el gráfico)
    const positionInfoBox = (chart, xPixel, index) => {
        const canvasRect = chart.canvas.getBoundingClientRect();
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;
        const chartCenterY = topY + (bottomY - topY) / 2;
        
        const boxWidth = 170;
        const boxHeight = 70; // altura real del cuadro
        
        // Posición X: a la derecha de la línea, o a la izquierda si no cabe
        let left = canvasRect.left + xPixel + 14;
        if (left + boxWidth > window.innerWidth - 10) {
            left = canvasRect.left + xPixel - boxWidth - 14;
        }
        
        // Posición Y: centrado verticalmente en el área del gráfico
        let top = canvasRect.top + chartCenterY - (boxHeight / 2);
        
        // Ajustar si se sale del viewport
        if (top < 10) top = 10;
        if (top + boxHeight > window.innerHeight - 10) top = window.innerHeight - boxHeight - 10;
        
        const { dateStr, timeStr, pct } = formatInfo(index);
        infoBox.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${dateStr}</div><div style="opacity:.8;margin-bottom:2px">${timeStr}</div><div style="font-weight:700;color:#0f172a">${pct}</div>`;
        infoBox.style.left = `${left}px`;
        infoBox.style.top = `${top}px`;
        infoBox.style.transition = 'left 0.1s ease-out, top 0.1s ease-out';
    };

    // Eventos del canvas para controlar hoverIndex y el infoBox
    const canvas = chart.canvas;
    const getIndexFromEvent = (evt) => {
        const elements = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
        if (elements && elements.length) return elements[0].index;
        return null;
    };

    // Estado para optimizar renders
    let animationFrameId = null;
    let lastIndex = null;

    const updateHover = (idx) => {
        if (idx === lastIndex) return; // No hacer nada si es el mismo índice
        lastIndex = idx;
        
        if (idx === null) {
            hoverIndex = null;
            infoBox.style.display = 'none';
        } else {
            hoverIndex = idx;
            const meta = chart.getDatasetMeta(0);
            if (meta && meta.data && meta.data[idx]) {
                positionInfoBox(chart, meta.data[idx].x, idx);
                infoBox.style.display = 'block';
            }
        }
        
        // Usar requestAnimationFrame para suavizar el render
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
            if (chart && chart.canvas) chart.draw();
        });
    };

    const onMove = (evt) => {
        if (!chart || chart.canvas === null) return;
        const idx = getIndexFromEvent(evt);
        updateHover(idx);
    };

    const onOut = () => {
        updateHover(null);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('mouseout', onOut);
    canvas.addEventListener('touchend', onOut);

    // Limpiar listeners cuando el chart se destruye
    const originalDestroy = chart.destroy.bind(chart);
    chart.destroy = () => {
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('mouseout', onOut);
        canvas.removeEventListener('touchend', onOut);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        hoverIndex = null;
        lastIndex = null;
        infoBox.style.display = 'none';
        originalDestroy();
    };

    return chart;
}