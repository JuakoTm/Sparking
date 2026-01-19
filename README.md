# S-Parking: Ecosistema IoT & Cloud para Estacionamientos Inteligentes 🚗💨

<p align="center">
  <img src="https://img.shields.io/badge/IoT-ESP32%20%7C%20C++-blue?style=for-the-badge&logo=espressif" />
  <img src="https://img.shields.io/badge/Cloud-Google%20Cloud%20Platform-orange?style=for-the-badge&logo=google-cloud" />
  <img src="https://img.shields.io/badge/Database-Firestore-ffca28?style=for-the-badge&logo=firebase" />
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS%20%7C%20Tailwind-38bdf8?style=for-the-badge&logo=tailwind-css" />
</p>

---

## 📌 Visión General
**S-Parking** es una solución de infraestructura inteligente diseñada para optimizar la gestión de estacionamientos. El sistema integra hardware embebido con microservicios en la nube para proporcionar datos en tiempo real, reducir la fricción en el usuario final y ofrecer analítica de demanda para la toma de decisiones estratégicas.

> **Proyecto destacado por:** Joaquín Troncoso - Ingeniero (E) en Infraestructura y Plataformas Tecnológicas @ **Duoc UC**.

---

## 📸 Demostración Visual
Para una mejor experiencia, he incluido capturas del funcionamiento real del sistema:

| Dashboard en Tiempo Real | Hardware IoT (ESP32) | Análisis de Demanda |
| :---: | :---: | :---: |
| ![Dashboard](./screenshots/dashboard.png) | ![Hardware](./screenshots/hardware.png) | ![Analytics](./screenshots/analytics.png) |

---

## 🏗️ Arquitectura del Sistema (Cloud-Native)

El sistema se apoya en una arquitectura orientada a servicios, garantizando baja latencia y alta integridad de datos:

1. **Edge Layer (IoT)**: Nodos basados en **ESP32** utilizan sensores **VL53L0X (Time-of-Flight)** para medir distancias con precisión láser. Implementan una lógica de **Self-Healing** que sincroniza el estado local con la nube cada 15s.
2. **Serverless Backend**: Microservicios desplegados en **Google Cloud Run (Node.js)** gestionan la ingesta de datos a través de una API RESTful.
3. **Real-time Data**: Utilización de **Cloud Firestore** como base de datos NoSQL para reflejar cambios de estado en milisegundos.
4. **Analytics Layer**: Tareas programadas (**Cloud Scheduler**) capturan snapshots horarios para generar reportes de tendencias y picos de demanda.

---

## 🛠️ Stack Tecnológico

### Infraestructura & Cloud
* **Google Cloud Platform**: Cloud Run, Cloud Scheduler, Secret Manager.
* **Firebase**: Hosting, Firestore, Authentication.
* **Redes**: Protocolos HTTP/JSON para comunicación IoT-Cloud.

### Hardware (Electrónica)
* **Microcontrolador**: ESP32 DevKit v1.
* **Sensor**: Adafruit VL53L0X (Lidar-based).
* **Señalización**: LEDs RGB WS2812B (Protocolo de señalización visual).

### Frontend
* **Visualización**: Google Maps JavaScript API (Capas personalizadas).
* **Gráficos**: Chart.js para análisis de demanda.
* **Estilos**: Tailwind CSS (Mobile-First Design).

---

## 🚀 Desafíos Técnicos Resueltos

* **Sincronización Bidireccional**: Resolución de conflictos de estado cuando se pierde la conexión WiFi, priorizando siempre la lectura física del sensor sobre el estado en caché.
* **Optimización de Costos API**: Implementación de **Page Visibility API** en el frontend para pausar el polling de datos cuando el usuario no está viendo la pestaña, reduciendo peticiones innecesarias a GCP.
* **Escalabilidad**: El sistema permite la creación masiva de puestos mediante una herramienta de "Line Builder" desarrollada sobre la API de mapas para despliegues rápidos en estacionamientos reales.

---

## 📂 Estructura del Proyecto

```text
├── firmware/          # Código C++ para ESP32 y lógica de sensores.
├── web-dashboard/     # Aplicación web y microservicios (GCP).
├── docs/              # Documentación técnica completa.
├── screenshots/       # Capturas de pantalla de la plataforma.
└── README.md          # Presentación del proyecto.
```

---

## 👤 Sobre mí

**Joaquín Troncoso Muñoz** *Ingeniero en Infraestructura y Plataformas Tecnológicas (E) en Duoc UC.*

* **Certificación**: Scrum Fundamentals Certified (SFC™).
* **Formación**: Azure Fundamentals (AZ-900) en proceso.
* **Enfoque**: Implementación de soluciones escalables, ciberseguridad y automatización Cloud.

<p align="left">
  <a href="https://www.linkedin.com/in/joaquint/" target="_blank">
    <img src="https://img.shields.io/badge/LinkedIn-Connect-blue?style=for-the-badge&logo=linkedin" alt="LinkedIn" />
  </a>
  <a href="mailto:joaquin.ltm@gmail.com">
    <img src="https://img.shields.io/badge/Email-Contact-red?style=for-the-badge&logo=gmail" alt="Email" />
  </a>
</p>

---
*Desarrollado con profesionalismo para transformar la infraestructura urbana.*