S-Parking 🚗💨



Sistema Inteligente de Gestión de Estacionamientos con IoT y Cloud Computing



S-Parking es una solución integral diseñada para digitalizar la gestión de estacionamientos. El proyecto combina hardware de bajo costo (sensores láser y microcontroladores) con una arquitectura de microservicios en la nube para ofrecer monitoreo en tiempo real, reservas de puestos y análisis de demanda predictivo.



👨‍💻 Sobre el Desarrollador



Este proyecto fue diseñado y desarrollado íntegramente por Joaquín Troncoso, Ingeniero en Infraestructura y Plataformas Tecnológicas. Representa la convergencia de mis habilidades en desarrollo Full Stack, administración de servicios Cloud y electrónica aplicada (IoT).



🚀 Características Principales



Monitoreo en Tiempo Real: Visualización dinámica de la ocupación mediante Google Maps API.



Arquitectura Serverless: Backend escalable utilizando Google Cloud Run y Firestore para una alta disponibilidad con costos optimizados.



Sincronización Inteligente (Self-Healing): Lógica implementada en el firmware del ESP32 que detecta desincronizaciones entre el estado físico y la base de datos, corrigiéndolas automáticamente.



Módulo de Analítica: Motor de recomendaciones que analiza métricas como el Coeficiente de Variación y Tiempo Crítico de ocupación para optimizar la gestión comercial.



Sistema de Reservas: Interfaz de usuario para usuarios finales con validación de patentes y timers de expiración.



Herramientas de Administración: Interfaz para crear zonas y puestos de estacionamiento masivamente (Line Builder) mediante arrastre en el mapa.



🛠️ Stack Tecnológico



Frontend



JavaScript (Vanilla ES6+): Arquitectura modular sin frameworks pesados para maximizar la velocidad.



Tailwind CSS: Diseño responsivo y moderno.



Google Maps API: Renderizado de capas personalizadas y herramientas de dibujo.



Chart.js: Visualización de datos históricos y tendencias.



Backend \& Cloud



Node.js: Servicios RESTful desplegados en contenedores.



Google Cloud Run: Ejecución de funciones y lógica de negocio.



Firebase Authentication: Gestión segura de identidades.



Cloud Firestore: Base de datos NoSQL para estados en tiempo real.



Hardware (IoT)



ESP32 DevKit v1: Cerebro del dispositivo con conectividad WiFi.



VL53L0X (Time-of-Flight): Sensor láser de alta precisión para detectar presencia de vehículos.



LEDs RGB WS2812B: Señalización visual de estados (Libre, Ocupado, Reservado).



📐 Arquitectura del Sistema



Ingesta: El sensor ESP32 detecta cambios y envía una petición POST cifrada al endpoint en Cloud Run.



Procesamiento: Cloud Run valida la petición, actualiza Firestore y dispara tareas programadas para snapshots históricos.



Consumo: El Dashboard Web realiza polling adaptativo (pausándose si la pestaña no está visible) para reducir el consumo de recursos y costos de API.



🔧 Configuración para Desarrollo



Requisitos



Node.js y npm instalados.



Cuenta en Google Cloud Platform con facturación habilitada (para Cloud Run).



API Key de Google Maps.



Instalación



Clona este repositorio.



Crea un archivo js/config/config.js basado en js/config/config.example.js y completa tus credenciales.



Para el hardware, completa el archivo arduino\_secrets.h dentro de la carpeta /firmware.



📄 Licencia



Este proyecto es propiedad de Joaquín Troncoso. Todos los derechos reservados. Desarrollado como proyecto final de título en Duoc UC.



Si deseas contactarme para saber más sobre este proyecto o mi perfil profesional, puedes encontrarme en LinkedIn.

