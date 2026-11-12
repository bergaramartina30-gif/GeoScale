/**
 * GeoScale - Lógica de Interfaz y Cálculos Cartográficos / Geodésicos
 * Soporta Calculadora Manual y Mapa Digital Interactivo con Leaflet + OpenStreetMap.
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. SISTEMA DE NOTIFICACIONES (TOASTS)
    // =========================================================================
    const toastContainer = document.getElementById('toast-container');

    function showToast(message, type = 'error') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconSvg = '';
        if (type === 'error') {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#E11D48" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        } else if (type === 'success') {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#059669" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
        } else {
            iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2563EB" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        toast.innerHTML = `${iconSvg}<div class="toast-msg">${message}</div>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4500);
    }

    // =========================================================================
    // 2. NAVEGACIÓN ENTRE PESTAÑAS (MÓDULOS)
    // =========================================================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            
            const activePanel = document.getElementById(`panel-${targetTab}`);
            if (activePanel) {
                activePanel.classList.add('active');
            }

            // Si se activa el mapa, Leaflet necesita recalcular dimensiones
            if (targetTab === 'mapa' && window.leafletMap) {
                setTimeout(() => {
                    window.leafletMap.invalidateSize();
                }, 200);
            }
        });
    });

    // =========================================================================
    // 3. MÓDULO 1: SELECTOR DE OPERACIONES DE LA CALCULADORA
    // =========================================================================
    const opChips = document.querySelectorAll('.op-chip');
    const calcForms = {
        real: document.getElementById('form-op-real'),
        grafica: document.getElementById('form-op-grafica'),
        escala: document.getElementById('form-op-escala')
    };
    const calcCardTitle = document.getElementById('calc-card-title');
    const calcCardDesc = document.getElementById('calc-card-desc');
    const calcFormulaMath = document.getElementById('calc-formula-math');

    const opConfig = {
        real: {
            title: 'A. Calcular Distancia Real',
            desc: 'Determina la longitud real en terreno a partir de la medida en plano y la escala cartográfica.',
            formula: 'D. Real = D. Gráfica × Denominador de Escala'
        },
        grafica: {
            title: 'B. Calcular Distancia Gráfica',
            desc: 'Calcula cuántos centímetros o milímetros ocupará una distancia de terreno en el plano o mapa.',
            formula: 'D. Gráfica = D. Real / Denominador de Escala'
        },
        escala: {
            title: 'C. Calcular Escala Cartográfica',
            desc: 'Obtiene la escala numérica (1:N) conociendo la distancia en el plano y su distancia correspondiente en terreno.',
            formula: 'Denominador (N) = Distancia Real / Distancia Gráfica (homogéneas)'
        }
    };

    let activeOp = 'real';

    opChips.forEach(chip => {
        chip.addEventListener('click', () => {
            opChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const op = chip.getAttribute('data-op');
            activeOp = op;

            Object.keys(calcForms).forEach(key => {
                if (calcForms[key]) {
                    calcForms[key].classList.toggle('active', key === op);
                }
            });

            calcCardTitle.textContent = opConfig[op].title;
            calcCardDesc.textContent = opConfig[op].desc;
            calcFormulaMath.textContent = opConfig[op].formula;
        });
    });

    // Atajos de escala rápida (1:500, 1:1.000, 1:50.000, etc.)
    document.querySelectorAll('.btn-quick-scale').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const val = btn.getAttribute('data-val');
            const input = document.getElementById(targetId);
            if (input) {
                input.value = val;
                input.focus();
            }
        });
    });

    // Botones de limpiar en la calculadora
    document.querySelectorAll('.btn-reset-calc').forEach(btn => {
        btn.addEventListener('click', () => {
            resetCalcResults();
        });
    });

    function resetCalcResults() {
        const emptyState = document.getElementById('calc-result-empty');
        const dataState = document.getElementById('calc-result-data');
        if (emptyState && dataState) {
            emptyState.classList.remove('hidden');
            dataState.classList.add('hidden');
        }
    }

    // =========================================================================
    // 4. ENVÍO DE FORMULARIOS Y CÁLCULOS (API BACKEND FLASK)
    // =========================================================================
    
    // Formulario A: Distancia Real
    calcForms.real.addEventListener('submit', async (e) => {
        e.preventDefault();
        const escalaVal = document.getElementById('real-escala').value.trim();
        const distGrafVal = document.getElementById('real-dist-grafica').value.trim();
        const uGraf = document.getElementById('real-unidad-grafica').value;

        // Validaciones del cliente
        if (!escalaVal || !distGrafVal) {
            showToast('Por favor complete todos los campos obligatorios.', 'error');
            return;
        }

        const escala = parseFloat(escalaVal);
        const distGraf = parseFloat(distGrafVal);

        if (isNaN(escala) || isNaN(distGraf)) {
            showToast('Los valores ingresados deben ser numéricos.', 'error');
            return;
        }

        if (escala <= 0) {
            showToast('El denominador de escala debe ser estrictamente mayor que cero.', 'error');
            return;
        }

        if (distGraf <= 0) {
            showToast('La distancia gráfica debe ser estrictamente mayor que cero.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/calcular-distancia-real', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    escala: escala,
                    distancia_grafica: distGraf,
                    unidad_grafica: uGraf
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                showToast(data.error || 'Ocurrió un error al procesar el cálculo.', 'error');
                return;
            }

            renderCalcRealResult(data);
            showToast('Distancia real calculada con éxito.', 'success');
        } catch (err) {
            showToast('No se pudo conectar con el servidor de cálculo: ' + err.message, 'error');
        }
    });

    // Formulario B: Distancia Gráfica
    calcForms.grafica.addEventListener('submit', async (e) => {
        e.preventDefault();
        const escalaVal = document.getElementById('grafica-escala').value.trim();
        const distRealVal = document.getElementById('grafica-dist-real').value.trim();
        const uReal = document.getElementById('grafica-unidad-real').value;

        if (!escalaVal || !distRealVal) {
            showToast('Por favor complete todos los campos obligatorios.', 'error');
            return;
        }

        const escala = parseFloat(escalaVal);
        const distReal = parseFloat(distRealVal);

        if (isNaN(escala) || isNaN(distReal)) {
            showToast('Los valores ingresados deben ser numéricos.', 'error');
            return;
        }

        if (escala <= 0) {
            showToast('El denominador de escala debe ser estrictamente mayor que cero.', 'error');
            return;
        }

        if (distReal <= 0) {
            showToast('La distancia real debe ser estrictamente mayor que cero.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/calcular-distancia-grafica', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    escala: escala,
                    distancia_real: distReal,
                    unidad_real: uReal
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                showToast(data.error || 'Ocurrió un error al procesar el cálculo.', 'error');
                return;
            }

            renderCalcGraficaResult(data);
            showToast('Distancia gráfica calculada con éxito.', 'success');
        } catch (err) {
            showToast('No se pudo conectar con el servidor de cálculo: ' + err.message, 'error');
        }
    });

    // Formulario C: Calcular Escala
    calcForms.escala.addEventListener('submit', async (e) => {
        e.preventDefault();
        const distGrafVal = document.getElementById('escala-dist-grafica').value.trim();
        const uGraf = document.getElementById('escala-unidad-grafica').value;
        const distRealVal = document.getElementById('escala-dist-real').value.trim();
        const uReal = document.getElementById('escala-unidad-real').value;

        if (!distGrafVal || !distRealVal) {
            showToast('Por favor complete todos los campos obligatorios.', 'error');
            return;
        }

        const distGraf = parseFloat(distGrafVal);
        const distReal = parseFloat(distRealVal);

        if (isNaN(distGraf) || isNaN(distReal)) {
            showToast('Los valores ingresados deben ser numéricos.', 'error');
            return;
        }

        if (distGraf <= 0 || distReal <= 0) {
            showToast('Ambas distancias deben ser estrictamente mayores que cero.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/calcular-escala', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distancia_grafica: distGraf,
                    unidad_grafica: uGraf,
                    distancia_real: distReal,
                    unidad_real: uReal
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                showToast(data.error || 'Ocurrió un error al procesar el cálculo.', 'error');
                return;
            }

            renderCalcEscalaResult(data);
            showToast('Escala cartográfica calculada con éxito.', 'success');
        } catch (err) {
            showToast('No se pudo conectar con el servidor de cálculo: ' + err.message, 'error');
        }
    });

    // =========================================================================
    // 5. RENDERIZACIÓN DE RESULTADOS DE LA CALCULADORA
    // =========================================================================
    function showResultPanel() {
        document.getElementById('calc-result-empty').classList.add('hidden');
        document.getElementById('calc-result-data').classList.remove('hidden');
    }

    function renderCalcRealResult(data) {
        showResultPanel();
        document.getElementById('result-label').textContent = `Distancia Real (Escala ${data.escala_str}):`;
        document.getElementById('result-value').textContent = data.resultado_principal;
        document.getElementById('result-sub').textContent = `Equivalente a: ${data.resultado_secundario}`;

        const unitsGrid = document.getElementById('units-grid');
        unitsGrid.innerHTML = `
            <div class="unit-cell highlight">
                <span class="unit-tag">Kilómetros (km)</span>
                <span class="unit-number">${data.valores.km_fmt} km</span>
            </div>
            <div class="unit-cell highlight">
                <span class="unit-tag">Metros (m)</span>
                <span class="unit-number">${data.valores.m_fmt} m</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">Centímetros (cm)</span>
                <span class="unit-number">${data.valores.cm_fmt} cm</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">Milímetros (mm)</span>
                <span class="unit-number">${data.valores.mm_fmt} mm</span>
            </div>
        `;

        document.getElementById('result-formula-text').textContent = data.formula;
    }

    function renderCalcGraficaResult(data) {
        showResultPanel();
        document.getElementById('result-label').textContent = `Distancia Gráfica en Plano (Escala ${data.escala_str}):`;
        document.getElementById('result-value').textContent = data.resultado_principal;
        document.getElementById('result-sub').textContent = `Equivalente a: ${data.resultado_secundario}`;

        const unitsGrid = document.getElementById('units-grid');
        unitsGrid.innerHTML = `
            <div class="unit-cell highlight">
                <span class="unit-tag">Centímetros (cm)</span>
                <span class="unit-number">${data.valores.cm_fmt} cm</span>
            </div>
            <div class="unit-cell highlight">
                <span class="unit-tag">Milímetros (mm)</span>
                <span class="unit-number">${data.valores.mm_fmt} mm</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">Metros (m)</span>
                <span class="unit-number">${data.valores.m_fmt} m</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">Kilómetros (km)</span>
                <span class="unit-number">${data.valores.km_fmt} km</span>
            </div>
        `;

        document.getElementById('result-formula-text').textContent = data.formula;
    }

    function renderCalcEscalaResult(data) {
        showResultPanel();
        document.getElementById('result-label').textContent = `Escala Cartográfica Determinada:`;
        document.getElementById('result-value').textContent = data.escala_str;
        document.getElementById('result-sub').textContent = `${data.tipo_escala} | Denominador: ${data.denominador_fmt}`;

        const unitsGrid = document.getElementById('units-grid');
        unitsGrid.innerHTML = `
            <div class="unit-cell highlight">
                <span class="unit-tag">Escala Numérica</span>
                <span class="unit-number">${data.escala_str}</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">Denominador (N)</span>
                <span class="unit-number">${data.denominador_fmt}</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">D. Real Homogénea</span>
                <span class="unit-number">${data.datos_homogeneizados.distancia_real_m} m</span>
            </div>
            <div class="unit-cell">
                <span class="unit-tag">D. Gráfica Homogénea</span>
                <span class="unit-number">${data.datos_homogeneizados.distancia_grafica_m} m</span>
            </div>
        `;

        document.getElementById('result-formula-text').textContent = data.formula;
    }

    // =========================================================================
    // 6. MÓDULO 2: MAPA DIGITAL INTERACTIVO (LEAFLET + OSM)
    // =========================================================================
    let map = null;
    let markerA = null;
    let markerB = null;
    let geodesicLine = null;
    let currentDistanceMeters = null;

    const mapHintText = document.getElementById('map-hint-text');
    const stepBadge1 = document.getElementById('step-badge-1');
    const stepBadge2 = document.getElementById('step-badge-2');
    const stepBadge3 = document.getElementById('step-badge-3');
    const mapOfflineWarning = document.getElementById('map-warning');

    const mapResultsEmpty = document.getElementById('map-results-empty');
    const mapResultsData = document.getElementById('map-results-data');
    const mapStatusPill = document.getElementById('map-status-pill');

    function initMap() {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;

        // Inicializar mapa centrado en coordenadas equilibradas (ej. 10° lat, -20° lon)
        map = L.map('map', {
            center: [20.0, -10.0],
            zoom: 3,
            minZoom: 2,
            maxZoom: 19
        });
        window.leafletMap = map;

        // Capa de mosaicos OpenStreetMap
        const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> colaboradores | GeoScale'
        });

        // Detección de fallos en la carga de teselas
        osmLayer.on('tileerror', () => {
            if (mapOfflineWarning) {
                mapOfflineWarning.classList.remove('hidden');
            }
        });

        osmLayer.on('load', () => {
            if (mapOfflineWarning) {
                mapOfflineWarning.classList.add('hidden');
            }
        });

        osmLayer.addTo(map);

        // Control de escala visual estándar en esquina inferior izquierda (sólo informativo)
        L.control.scale({
            metric: true,
            imperial: false,
            position: 'bottomleft'
        }).addTo(map);

        // Evento de clic sobre el mapa para selección de puntos
        map.on('click', handleMapClick);
    }

    // Generador de Icono Personalizado
    function createCustomPin(letter, colorClass) {
        return L.divIcon({
            className: 'custom-pin-wrapper',
            html: `<div class="custom-pin ${colorClass}"><span>${letter}</span></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        });
    }

    function handleMapClick(e) {
        const { lat, lng } = e.latlng;

        if (!markerA) {
            // Fijar Punto A
            setPointA(lat, lng);
            mapHintText.innerHTML = '📍 Ahora haz clic sobre el mapa para fijar el <strong>Punto B</strong>';
            stepBadge1.classList.remove('active');
            stepBadge1.classList.add('completed');
            stepBadge2.classList.add('active');
            mapStatusPill.textContent = 'Punto A definido';
            mapStatusPill.className = 'status-indicator ready';
        } else if (!markerB) {
            // Fijar Punto B
            setPointB(lat, lng);
            stepBadge2.classList.remove('active');
            stepBadge2.classList.add('completed');
            stepBadge3.classList.add('completed');
            mapHintText.innerHTML = '✅ Medición completada. Puedes arrastrar los puntos o pulsar <strong>Eliminar Medición</strong>.';
            mapStatusPill.textContent = 'Medición Activa';
            mapStatusPill.className = 'status-indicator success';
            calcularDistanciaGeodesica();
        } else {
            // Si ya hay dos puntos, mover el Punto B a la nueva posición clicada
            markerB.setLatLng([lat, lng]);
            markerB.setPopupContent(`<strong>Punto B</strong><br>Lat: ${lat.toFixed(6)}°<br>Lon: ${lng.toFixed(6)}°`).openPopup();
            updatePolyline();
            calcularDistanciaGeodesica();
            showToast('Punto B actualizado a la nueva posición.', 'info');
        }
    }

    function setPointA(lat, lng) {
        const pinIcon = createCustomPin('A', 'pin-a');
        markerA = L.marker([lat, lng], {
            icon: pinIcon,
            draggable: true,
            title: 'Punto A (Origen)'
        }).addTo(map);

        markerA.bindPopup(`<strong>Punto de Origen (A)</strong><br>Lat: ${lat.toFixed(6)}°<br>Lon: ${lng.toFixed(6)}°`).openPopup();

        // Si el usuario arrastra el marcador A
        markerA.on('drag', () => {
            updatePolyline();
        });
        markerA.on('dragend', (ev) => {
            const pos = ev.target.getLatLng();
            markerA.setPopupContent(`<strong>Punto de Origen (A)</strong><br>Lat: ${pos.lat.toFixed(6)}°<br>Lon: ${pos.lng.toFixed(6)}°`);
            if (markerB) {
                calcularDistanciaGeodesica();
            }
        });
    }

    function setPointB(lat, lng) {
        const pinIcon = createCustomPin('B', 'pin-b');
        markerB = L.marker([lat, lng], {
            icon: pinIcon,
            draggable: true,
            title: 'Punto B (Destino)'
        }).addTo(map);

        markerB.bindPopup(`<strong>Punto de Destino (B)</strong><br>Lat: ${lat.toFixed(6)}°<br>Lon: ${lng.toFixed(6)}°`).openPopup();

        // Si el usuario arrastra el marcador B
        markerB.on('drag', () => {
            updatePolyline();
        });
        markerB.on('dragend', (ev) => {
            const pos = ev.target.getLatLng();
            markerB.setPopupContent(`<strong>Punto de Destino (B)</strong><br>Lat: ${pos.lat.toFixed(6)}°<br>Lon: ${pos.lng.toFixed(6)}°`);
            calcularDistanciaGeodesica();
        });

        updatePolyline();
    }

    function updatePolyline() {
        if (!markerA || !markerB) return;

        const latlngs = [markerA.getLatLng(), markerB.getLatLng()];

        if (geodesicLine) {
            geodesicLine.setLatLngs(latlngs);
        } else {
            geodesicLine = L.polyline(latlngs, {
                color: '#2563EB',
                weight: 4,
                opacity: 0.85,
                dashArray: '8, 8',
                lineCap: 'round'
            }).addTo(map);
        }
    }

    // Llamada al endpoint de cálculo de Haversine en Flask
    async function calcularDistanciaGeodesica() {
        if (!markerA || !markerB) {
            showToast('Selección incompleta: Se deben definir ambos puntos en el mapa.', 'error');
            return;
        }

        const pA = markerA.getLatLng();
        const pB = markerB.getLatLng();

        try {
            const res = await fetch('/api/calcular-distancia-geodesica', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    punto1: { lat: pA.lat, lon: pA.lng },
                    punto2: { lat: pB.lat, lon: pB.lng }
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                showToast(data.error || 'Error al calcular distancia geodésica.', 'error');
                return;
            }

            renderGeodesicResults(data);
        } catch (err) {
            // Respaldo de cálculo local Haversine si la red falla
            const localResult = haversineLocal(pA.lat, pA.lng, pB.lat, pB.lng);
            renderGeodesicResults(localResult);
            showToast('Cálculo geodésico realizado localmente.', 'info');
        }
    }

    function renderGeodesicResults(data) {
        if (mapResultsEmpty) mapResultsEmpty.classList.add('hidden');
        if (mapResultsData) mapResultsData.classList.remove('hidden');

        currentDistanceMeters = data.distancia_m;

        // Distancias principales
        document.getElementById('geo-dist-km').textContent = data.distancia_km_fmt;
        document.getElementById('geo-dist-m').textContent = data.distancia_m_fmt;

        // Punto A
        document.getElementById('pt-a-lat').textContent = `${data.punto1.lat.toFixed(6)}°`;
        document.getElementById('pt-a-lon').textContent = `${data.punto1.lon.toFixed(6)}°`;
        document.getElementById('pt-a-dms').textContent = data.punto1.lat_dms + ' / ' + data.punto1.lon_dms;

        // Punto B
        document.getElementById('pt-b-lat').textContent = `${data.punto2.lat.toFixed(6)}°`;
        document.getElementById('pt-b-lon').textContent = `${data.punto2.lon.toFixed(6)}°`;
        document.getElementById('pt-b-dms').textContent = data.punto2.lat_dms + ' / ' + data.punto2.lon_dms;

        // Azimut
        if (data.azimut_grados !== undefined) {
            document.getElementById('geo-azimut').textContent = `${data.azimut_grados}°`;
        }

        // Calcular proyección en plano con la escala actual
        updateScaleProjection();
    }

    // Botón: Eliminar Medición
    document.getElementById('btn-clear-map').addEventListener('click', () => {
        clearMapMeasurement();
        showToast('Medición eliminada. Puede seleccionar nuevos puntos.', 'info');
    });

    function clearMapMeasurement() {
        if (markerA) {
            map.removeLayer(markerA);
            markerA = null;
        }
        if (markerB) {
            map.removeLayer(markerB);
            markerB = null;
        }
        if (geodesicLine) {
            map.removeLayer(geodesicLine);
            geodesicLine = null;
        }

        currentDistanceMeters = null;

        // Resetear interfaz
        if (mapResultsEmpty) mapResultsEmpty.classList.remove('hidden');
        if (mapResultsData) mapResultsData.classList.add('hidden');

        stepBadge1.className = 'step-badge active';
        stepBadge2.className = 'step-badge';
        stepBadge3.className = 'step-badge';

        mapHintText.innerHTML = '📍 Haz clic sobre el mapa para fijar el <strong>Punto A</strong>';
        mapStatusPill.textContent = 'Esperando puntos';
        mapStatusPill.className = 'status-indicator ready';
    }

    // Proyector de escala para la distancia del mapa
    const btnCalcProj = document.getElementById('btn-calc-proj');
    const inputProjScale = document.getElementById('map-proj-scale');

    if (btnCalcProj && inputProjScale) {
        btnCalcProj.addEventListener('click', () => {
            updateScaleProjection();
        });
        inputProjScale.addEventListener('input', () => {
            updateScaleProjection();
        });
    }

    function updateScaleProjection() {
        if (!currentDistanceMeters || currentDistanceMeters <= 0) return;
        const scaleDenom = parseFloat(inputProjScale.value);
        if (isNaN(scaleDenom) || scaleDenom <= 0) {
            document.getElementById('proj-result-text').innerHTML = `<span style="color:#E11D48">Escala inválida</span>`;
            return;
        }

        // Distancia en plano = Distancia Real / Escala
        // currentDistanceMeters está en metros
        // En cm: (currentDistanceMeters * 100) / scaleDenom
        const distCm = (currentDistanceMeters * 100.0) / scaleDenom;
        const distMm = distCm * 10.0;

        let displayStr = '';
        if (distCm >= 1.0) {
            displayStr = `${distCm.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cm`;
        } else {
            displayStr = `${distMm.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`;
        }

        const scaleFmt = scaleDenom.toLocaleString('es-ES');
        document.getElementById('proj-result-text').innerHTML = `
            En un plano a 1:${scaleFmt} mediría: <strong>${displayStr}</strong>
        `;
    }

    // Función Haversine local de respaldo en JS (precisión geodésica idéntica al backend)
    function haversineLocal(lat1, lon1, lat2, lon2) {
        const R = 6371000.0; // Metros
        const toRad = deg => (deg * Math.PI) / 180.0;
        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const deltaPhi = toRad(lat2 - lat1);
        const deltaLambda = toRad(lon2 - lon1);

        const a = Math.sin(deltaPhi / 2.0) ** 2 +
                  Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2.0) ** 2);
        const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        const distM = R * c;
        const distKm = distM / 1000.0;

        const dmsFormat = (deg, isLat) => {
            const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'O');
            const absD = Math.abs(deg);
            const g = Math.floor(absD);
            const mFull = (absD - g) * 60;
            const m = Math.floor(mFull);
            const s = ((mFull - m) * 60).toFixed(2);
            return `${g}° ${m}' ${s}" ${dir}`;
        };

        return {
            success: true,
            distancia_m: distM,
            distancia_km: distKm,
            distancia_m_fmt: distM.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            distancia_km_fmt: distKm.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
            punto1: {
                lat: lat1, lon: lon1,
                lat_dms: dmsFormat(lat1, true),
                lon_dms: dmsFormat(lon1, false)
            },
            punto2: {
                lat: lat2, lon: lon2,
                lat_dms: dmsFormat(lat2, true),
                lon_dms: dmsFormat(lon2, false)
            },
            azimut_grados: 0
        };
    }

    // Inicializar mapa inmediatamente
    initMap();
});
