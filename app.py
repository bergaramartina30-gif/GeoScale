"""
GeoScale - Aplicación web para cálculo de escalas cartográficas y distancias geográficas.
Desarrollada con Flask, Leaflet y OpenStreetMap.
Orientada a estudiantes y profesionales de Ingeniería Civil, Topografía y Geodesia.
"""

from flask import Flask, render_template, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
import math
import os

app = Flask(__name__)

# Adaptación para despliegue en producción detrás de proxy inverso (Render, Cloudflare, etc.)
if os.environ.get('RENDER'):
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Factores de conversión a la unidad base: metro (m)
FACTORES_A_METROS = {
    'mm': 0.001,
    'cm': 0.01,
    'm': 1.0,
    'km': 1000.0
}

NOMBRES_UNIDADES = {
    'mm': 'milímetros (mm)',
    'cm': 'centímetros (cm)',
    'm': 'metros (m)',
    'km': 'kilómetros (km)'
}

RADIO_TIERRA_METROS = 6371000.0  # Radio medio de la Tierra (IUGG / WGS84 medio)

def validar_numero_positivo(valor, nombre_campo):
    """Valida que el valor sea numérico y estrictamente mayor que cero."""
    if valor is None:
        raise ValueError(f"El campo '{nombre_campo}' es obligatorio.")
    try:
        val_float = float(valor)
    except (ValueError, TypeError):
        raise ValueError(f"El valor ingresado para '{nombre_campo}' debe ser un número válido.")
    
    if math.isnan(val_float) or math.isinf(val_float):
        raise ValueError(f"El valor de '{nombre_campo}' no es un número finito válido.")
    
    if val_float <= 0:
        raise ValueError(f"El valor de '{nombre_campo}' debe ser estrictamente mayor que cero (0).")
    
    return val_float

def validar_unidad(unidad, nombre_campo='unidad'):
    """Valida que la unidad pertenezca a las permitidas (mm, cm, m, km)."""
    if not unidad or not isinstance(unidad, str):
        raise ValueError(f"Debe especificar una {nombre_campo} válida.")
    u = unidad.strip().lower()
    if u not in FACTORES_A_METROS:
        raise ValueError(f"Unidad '{unidad}' no válida. Opciones permitidas: mm, cm, m, km.")
    return u

def formatear_escala(denominador):
    """Formatea el denominador de escala al formato cartográfico estándar 1:N."""
    if abs(denominador - round(denominador)) < 1e-4:
        entero = int(round(denominador))
        # Formato con punto de miles como en español (ej. 1:50.000)
        return f"1:{entero:,.0f}".replace(",", ".")
    else:
        # Si tiene decimales relevantes
        return f"1:{denominador:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def formatear_numero(valor, decimales=2):
    """Formatea números con separador de miles y coma decimal en estilo español."""
    formateado = f"{valor:,.{decimales}f}"
    return formateado.replace(",", "X").replace(".", ",").replace("X", ".")

def decimal_a_dms(deg, es_latitud=True):
    """Convierte grados decimales a formato Grados, Minutos y Segundos (GMS/DMS)."""
    direccion = ""
    if es_latitud:
        direccion = "N" if deg >= 0 else "S"
    else:
        direccion = "E" if deg >= 0 else "O"
    
    deg_abs = abs(deg)
    grados = int(deg_abs)
    resto_min = (deg_abs - grados) * 60.0
    minutos = int(resto_min)
    segundos = (resto_min - minutos) * 60.0

    return f"{grados}° {minutos:02d}' {segundos:05.2f}\" {direccion}"

def calcular_rumbo_azimut(lat1, lon1, lat2, lon2):
    """Calcula el azimut inicial (orientación) entre dos puntos en grados sexagesimales."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    theta = math.atan2(y, x)
    azimut = (math.degrees(theta) + 360.0) % 360.0
    return azimut

@app.route('/')
def index():
    """Ruta principal que sirve la aplicación web interactiva."""
    return render_template('index.html')

@app.route('/api/calcular-distancia-real', methods=['POST'])
def api_calcular_distancia_real():
    """
    Operación A: Calcular Distancia Real
    Distancia real = Distancia gráfica × Denominador de escala
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'No se enviaron datos para el cálculo.'}), 400
        
        escala = validar_numero_positivo(data.get('escala'), 'Denominador de escala')
        dist_graf = validar_numero_positivo(data.get('distancia_grafica'), 'Distancia gráfica')
        u_graf = validar_unidad(data.get('unidad_grafica'), 'unidad de distancia gráfica')

        # Distancia real en la misma unidad que la distancia gráfica
        dist_real_misma_unidad = dist_graf * escala

        # Convertir a metros base
        dist_real_m = dist_real_misma_unidad * FACTORES_A_METROS[u_graf]

        # Convertir a todas las unidades estándar
        dist_real_km = dist_real_m / 1000.0
        dist_real_cm = dist_real_m * 100.0
        dist_real_mm = dist_real_m * 1000.0

        # Seleccionar la unidad más legible para el resultado principal
        if dist_real_m >= 1000.0:
            res_principal = f"{formatear_numero(dist_real_km, 3)} km"
            res_secundario = f"{formatear_numero(dist_real_m, 2)} m"
        elif dist_real_m >= 1.0:
            res_principal = f"{formatear_numero(dist_real_m, 2)} m"
            res_secundario = f"{formatear_numero(dist_real_km, 4)} km"
        else:
            res_principal = f"{formatear_numero(dist_real_cm, 2)} cm"
            res_secundario = f"{formatear_numero(dist_real_mm, 1)} mm"

        formula_explicacion = (
            f"Distancia real = {formatear_numero(dist_graf, 2)} {u_graf} × "
            f"{formatear_numero(escala, 0)} = {formatear_numero(dist_real_misma_unidad, 2)} {u_graf}"
        )

        return jsonify({
            'success': True,
            'operacion': 'distancia_real',
            'escala_str': formatear_escala(escala),
            'resultado_principal': res_principal,
            'resultado_secundario': res_secundario,
            'valores': {
                'km': round(dist_real_km, 4),
                'km_fmt': formatear_numero(dist_real_km, 4),
                'm': round(dist_real_m, 3),
                'm_fmt': formatear_numero(dist_real_m, 2),
                'cm': round(dist_real_cm, 2),
                'cm_fmt': formatear_numero(dist_real_cm, 2),
                'mm': round(dist_real_mm, 1),
                'mm_fmt': formatear_numero(dist_real_mm, 1)
            },
            'formula': formula_explicacion
        })

    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error interno en el servidor: {str(e)}'}), 500

@app.route('/api/calcular-distancia-grafica', methods=['POST'])
def api_calcular_distancia_grafica():
    """
    Operación B: Calcular Distancia Gráfica
    Distancia gráfica = Distancia real / Denominador de escala
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'No se enviaron datos para el cálculo.'}), 400
        
        escala = validar_numero_positivo(data.get('escala'), 'Denominador de escala')
        dist_real = validar_numero_positivo(data.get('distancia_real'), 'Distancia real')
        u_real = validar_unidad(data.get('unidad_real'), 'unidad de distancia real')

        if escala == 0:
            return jsonify({'success': False, 'error': 'Error: División por cero. El denominador de escala no puede ser cero.'}), 400

        # Distancia gráfica en la misma unidad que la distancia real
        dist_graf_misma_unidad = dist_real / escala

        # Convertir a metros base
        dist_graf_m = dist_graf_misma_unidad * FACTORES_A_METROS[u_real]

        # Convertir a todas las unidades estándar
        dist_graf_cm = dist_graf_m * 100.0
        dist_graf_mm = dist_graf_m * 1000.0
        dist_graf_km = dist_graf_m / 1000.0

        # En cartografía, las distancias gráficas en papel/plano suelen expresarse en cm o mm
        if dist_graf_cm >= 1.0:
            res_principal = f"{formatear_numero(dist_graf_cm, 2)} cm"
            res_secundario = f"{formatear_numero(dist_graf_mm, 1)} mm"
        elif dist_graf_mm >= 1.0:
            res_principal = f"{formatear_numero(dist_graf_mm, 2)} mm"
            res_secundario = f"{formatear_numero(dist_graf_cm, 3)} cm"
        else:
            res_principal = f"{formatear_numero(dist_graf_mm, 3)} mm"
            res_secundario = f"{formatear_numero(dist_graf_m, 5)} m"

        formula_explicacion = (
            f"Distancia gráfica = {formatear_numero(dist_real, 2)} {u_real} / "
            f"{formatear_numero(escala, 0)} = {formatear_numero(dist_graf_cm, 3)} cm"
        )

        return jsonify({
            'success': True,
            'operacion': 'distancia_grafica',
            'escala_str': formatear_escala(escala),
            'resultado_principal': res_principal,
            'resultado_secundario': res_secundario,
            'valores': {
                'cm': round(dist_graf_cm, 3),
                'cm_fmt': formatear_numero(dist_graf_cm, 2),
                'mm': round(dist_graf_mm, 2),
                'mm_fmt': formatear_numero(dist_graf_mm, 2),
                'm': round(dist_graf_m, 5),
                'm_fmt': formatear_numero(dist_graf_m, 4),
                'km': round(dist_graf_km, 8),
                'km_fmt': formatear_numero(dist_graf_km, 6)
            },
            'formula': formula_explicacion
        })

    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error interno en el servidor: {str(e)}'}), 500

@app.route('/api/calcular-escala', methods=['POST'])
def api_calcular_escala():
    """
    Operación C: Calcular Escala
    Denominador de escala = Distancia real / Distancia gráfica (en la misma unidad)
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'No se enviaron datos para el cálculo.'}), 400
        
        dist_graf = validar_numero_positivo(data.get('distancia_grafica'), 'Distancia gráfica')
        u_graf = validar_unidad(data.get('unidad_grafica'), 'unidad de distancia gráfica')
        dist_real = validar_numero_positivo(data.get('distancia_real'), 'Distancia real')
        u_real = validar_unidad(data.get('unidad_real'), 'unidad de distancia real')

        # Convertir ambas a metros para homogeneizar las unidades
        dist_graf_m = dist_graf * FACTORES_A_METROS[u_graf]
        dist_real_m = dist_real * FACTORES_A_METROS[u_real]

        if dist_graf_m == 0:
            return jsonify({'success': False, 'error': 'Error: División por cero. La distancia gráfica no puede ser cero.'}), 400

        # Denominador de escala
        denominador = dist_real_m / dist_graf_m

        if denominador <= 0:
            return jsonify({'success': False, 'error': 'El cálculo arrojó un denominador inválido (menor o igual a cero).'}), 400

        escala_str = formatear_escala(denominador)

        formula_explicacion = (
            f"E = Distancia real en m / Distancia gráfica en m = "
            f"{formatear_numero(dist_real_m, 3)} m / {formatear_numero(dist_graf_m, 4)} m = "
            f"{formatear_numero(denominador, 2)}"
        )

        # Si es escala de reducción típica en cartografía:
        tipo_escala = "Escala de reducción (Cartográfica / Topográfica)"
        if denominador < 1:
            tipo_escala = "Escala de ampliación (Detalle de ingeniería de precisión)"

        return jsonify({
            'success': True,
            'operacion': 'escala',
            'denominador': round(denominador, 2),
            'denominador_fmt': formatear_numero(denominador, 0) if abs(denominador - round(denominador)) < 0.01 else formatear_numero(denominador, 2),
            'escala_str': escala_str,
            'resultado_principal': escala_str,
            'tipo_escala': tipo_escala,
            'datos_homogeneizados': {
                'distancia_real_m': round(dist_real_m, 3),
                'distancia_grafica_m': round(dist_graf_m, 4)
            },
            'formula': formula_explicacion
        })

    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error interno en el servidor: {str(e)}'}), 500

@app.route('/api/calcular-distancia-geodesica', methods=['POST'])
def api_calcular_distancia_geodesica():
    """
    Módulo 2: Cálculo de distancia geodésica mediante la fórmula de Haversine.
    Calcula la distancia en línea recta sobre la superficie de la esfera terrestre.
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'No se enviaron coordenadas para la medición.'}), 400
        
        p1 = data.get('punto1')
        p2 = data.get('punto2')

        if not p1 or not p2:
            return jsonify({
                'success': False,
                'error': 'Selección incompleta: Se deben definir tanto el Punto 1 como el Punto 2 en el mapa.'
            }), 400

        try:
            lat1 = float(p1.get('lat'))
            lon1 = float(p1.get('lon'))
            lat2 = float(p2.get('lat'))
            lon2 = float(p2.get('lon'))
        except (ValueError, TypeError):
            return jsonify({
                'success': False,
                'error': 'Las coordenadas de los puntos deben ser números válidos.'
            }), 400

        # Validaciones de rango geográfico WGS84
        for nombre, lat, lon in [("Punto 1", lat1, lon1), ("Punto 2", lat2, lon2)]:
            if not (-90.0 <= lat <= 90.0):
                return jsonify({
                    'success': False,
                    'error': f"La latitud del {nombre} ({lat}) debe estar en el rango de -90° a 90°."
                }), 400
            if not (-180.0 <= lon <= 180.0):
                return jsonify({
                    'success': False,
                    'error': f"La longitud del {nombre} ({lon}) debe estar en el rango de -180° a 180°."
                }), 400

        # Caso puntos idénticos
        if abs(lat1 - lat2) < 1e-9 and abs(lon1 - lon2) < 1e-9:
            return jsonify({
                'success': True,
                'distancia_m': 0.0,
                'distancia_km': 0.0,
                'distancia_m_fmt': "0,00",
                'distancia_km_fmt': "0,000",
                'resultado_principal': "0,00 m (0,000 km)",
                'mensaje': 'Ambos puntos coinciden exactamente en la misma ubicación.',
                'punto1': {
                    'lat': lat1, 'lon': lon1,
                    'lat_dms': decimal_a_dms(lat1, True),
                    'lon_dms': decimal_a_dms(lon1, False)
                },
                'punto2': {
                    'lat': lat2, 'lon': lon2,
                    'lat_dms': decimal_a_dms(lat2, True),
                    'lon_dms': decimal_a_dms(lon2, False)
                },
                'azimut': 0.0
            })

        # --- Fórmula de Haversine ---
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
        
        # Corrección de estabilidad numérica para puntos antipodales o flotantes
        a = min(1.0, max(0.0, a))
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        distancia_metros = RADIO_TIERRA_METROS * c
        distancia_kilometros = distancia_metros / 1000.0

        # Cálculo de orientación geodésica (azimut)
        azimut = calcular_rumbo_azimut(lat1, lon1, lat2, lon2)

        return jsonify({
            'success': True,
            'distancia_m': round(distancia_metros, 2),
            'distancia_km': round(distancia_kilometros, 4),
            'distancia_m_fmt': formatear_numero(distancia_metros, 2),
            'distancia_km_fmt': formatear_numero(distancia_kilometros, 3),
            'resultado_principal': f"{formatear_numero(distancia_kilometros, 3)} km ({formatear_numero(distancia_metros, 2)} m)",
            'punto1': {
                'lat': lat1,
                'lon': lon1,
                'lat_fmt': f"{lat1:.6f}",
                'lon_fmt': f"{lon1:.6f}",
                'lat_dms': decimal_a_dms(lat1, True),
                'lon_dms': decimal_a_dms(lon1, False)
            },
            'punto2': {
                'lat': lat2,
                'lon': lon2,
                'lat_fmt': f"{lat2:.6f}",
                'lon_fmt': f"{lon2:.6f}",
                'lat_dms': decimal_a_dms(lat2, True),
                'lon_dms': decimal_a_dms(lon2, False)
            },
            'azimut_grados': round(azimut, 2),
            'radio_tierra_m': RADIO_TIERRA_METROS,
            'formula_haversine': 'd = 2 · R · atan2(√a, √(1−a)) con R = 6.371 km'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Error en el cálculo geodésico: {str(e)}'}), 500

if __name__ == '__main__':
    # Soporte para variable de entorno PORT en Render o local
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
