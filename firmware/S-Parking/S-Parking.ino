#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_VL53L0X.h>
#include <ArduinoJson.h>
#include "arduino_secrets.h"

// --- Hardware ---
Adafruit_VL53L0X sensor = Adafruit_VL53L0X();
#define LED_RED_PIN 13
#define LED_GREEN_PIN 12
#define LED_BLUE_PIN 14 // Se agrega el pin Azul por si acaso, aunque Ámbar es Rojo+Verde

// --- Configuración ---
const char* ssid = SECRET_SSID;
const char* password = SECRET_PASS;
const char* spot_id = SECRET_SPOT_ID;

// URLs
String urlIngest = SECRET_GCP_URL_INGEST;
String urlGet = SECRET_GCP_URL_GET;

// --- Variables de Estado ---
int estadoLocalSensor = -1; // Lo que ve el sensor (0 o 1)
int estadoNube = -1;        // Lo que dice la nube (0, 1 o 2)
int estadoFinal = -1;       // El color que decidimos mostrar

// --- Temporizadores ---
unsigned long lastSensorRead = 0;
unsigned long lastCloudPoll = 0;
const long sensorInterval = 500;    // Leer sensor rápido (0.5s) para respuesta inmediata al estacionar
const long cloudPollInterval = 15000; // Consultar reserva cada 15s

void setup() {
  Serial.begin(115200);
  
  // Configurar LEDs
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  setColor(0, 0, 0); // Apagar todo

  // Iniciar Sensor
  if (!sensor.begin()) {
    Serial.println(F("Error al iniciar VL53L0X"));
    while (1);
  }
  
  // Conectar WiFi
  connectToWiFi();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. LEER SENSOR (Frecuencia alta)
  if (currentMillis - lastSensorRead >= sensorInterval) {
    lastSensorRead = currentMillis;
    readLocalSensor();
    updateLEDs(); // Actualizar luces basado en la info más reciente
  }

  // 2. CONSULTAR NUBE (Frecuencia media)
  if (currentMillis - lastCloudPoll >= cloudPollInterval) {
    lastCloudPoll = currentMillis;
    checkCloudStatus(); 
    // Nota: updateLEDs se llamará en el siguiente ciclo de sensor
  }
}

// --- Funciones Principales ---

void readLocalSensor() {
  VL53L0X_RangingMeasurementData_t measure;
  sensor.rangingTest(&measure, false);

  int nuevoEstadoSensor;

  if (measure.RangeStatus != 4 && measure.RangeMilliMeter < 400) {
    nuevoEstadoSensor = 0; // Ocupado fisicamente
  } else {
    nuevoEstadoSensor = 1; // Disponible fisicamente
  }

  // Si el estado físico cambió, enviamos INMEDIATAMENTE a la nube
  if (nuevoEstadoSensor != estadoLocalSensor) {
    estadoLocalSensor = nuevoEstadoSensor;
    Serial.print("Cambio físico detectado: ");
    Serial.println(estadoLocalSensor);
    sendStateToCloud(estadoLocalSensor);
  }
}

void checkCloudStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(urlGet); // Usamos la URL de lectura
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    
    DynamicJsonDocument doc(4096); 
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      bool encontrado = false;
      for (JsonObject spot : doc.as<JsonArray>()) {
        const char* id = spot["id"];
        if (strcmp(id, spot_id) == 0) {
          int statusNubeLeido = spot["status"]; // 0, 1 o 2
          estadoNube = statusNubeLeido;
          encontrado = true;

          Serial.print("Sincronizando. Local: ");
          Serial.print(estadoLocalSensor);
          Serial.print(" | Nube: ");
          Serial.println(estadoNube);

          // --- LÓGICA DE AUTOCORRECCIÓN (SELF-HEALING) ---
          
          // CASO A: Yo estoy Verde (1), Nube dice Ocupado (0).
          // Significa: El mensaje de salida se perdió.
          // Acción: Reenviar "Disponible" a la fuerza.
          if (estadoLocalSensor == 1 && estadoNube == 0) {
            Serial.println("¡Desincronización detectada! Forzando actualización a DISPONIBLE...");
            sendStateToCloud(1);
          }

          // CASO B: Yo estoy Rojo (0), Nube dice Disponible (1) o Reservado (2).
          // Significa: El mensaje de llegada se perdió.
          // Acción: Reenviar "Ocupado" a la fuerza.
          if (estadoLocalSensor == 0 && (estadoNube == 1 || estadoNube == 2)) {
             Serial.println("¡Desincronización detectada! Forzando actualización a OCUPADO...");
             sendStateToCloud(0);
          }
          
          break;
        }
      }
      if (!encontrado) Serial.println("ID de puesto no encontrado en la respuesta.");
    } else {
      Serial.print("Error JSON: ");
      Serial.println(error.c_str());
    }
  } else {
    Serial.print("Error HTTP GET: ");
    Serial.println(httpCode);
  }
  http.end();
}

void sendStateToCloud(int status) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(urlIngest);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["spot_id"] = spot_id;
  doc["status"] = status;
  
  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.POST(requestBody);
  Serial.print("Enviado a ingest. Codigo: ");
  Serial.println(httpResponseCode); // 200 significa éxito
  http.end();
}

void updateLEDs() {
  // LÓGICA DE PRIORIDAD VISUAL
  
  // 1. Prioridad Máxima: Si hay un auto físico, es ROJO.
  if (estadoLocalSensor == 0) {
    setColor(1, 0, 0); // Rojo
    return;
  }

  // 2. Si no hay auto, verificamos si hay Reserva en la nube
  if (estadoNube == 2) {
    // AMBAR (Rojo + Verde)
    setColor(1, 1, 0); 
    return;
  }

  // 3. Si no hay auto y no hay reserva
  setColor(0, 1, 0); // Verde (Disponible)
}

// Helper para controlar LED RGB (Anodo Común o Catodo Común?)
// Tu resumen dice: "Anodo Común (pin largo a 3.3V)".
// Esto significa que LOW enciende el LED y HIGH lo apaga.
void setColor(int red, int green, int blue) {
  // Invertimos lógica para Ánodo Común
  // 1 (On) -> Escribimos LOW
  // 0 (Off) -> Escribimos HIGH
  digitalWrite(LED_RED_PIN, red ? LOW : HIGH);
  digitalWrite(LED_GREEN_PIN, green ? LOW : HIGH);
  digitalWrite(LED_BLUE_PIN, blue ? LOW : HIGH);
}

void connectToWiFi() {
  Serial.print("Conectando a WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA); // Asegurar modo estación
  WiFi.begin(ssid, password);
  
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n¡WiFi Conectado!");
    Serial.print("IP asignada: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFallo al conectar WiFi. Reiniciando...");
    delay(1000);
    ESP.restart();
  }
}