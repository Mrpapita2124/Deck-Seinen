# Deck-Seinen

🌐 [English](README.md) | **Español**

Plugin para **Decky Loader** (Steam Deck / SteamOS) basado en [**SyncSeinen**](https://github.com/Mrpapita2124/syncseinen) para sincronizar partidas guardadas de videojuegos de PC, emuladores y carpetas personalizadas con **Google Drive**, **OneDrive** y **Dropbox** usando **rclone**.

> 💡 **¿Buscas la aplicación de escritorio para Windows y Linux?**
> Visita el repositorio principal: [**SyncSeinen (Windows & Linux)**](https://github.com/Mrpapita2124/syncseinen).
> **Deck-Seinen** comparte exactamente el mismo formato de metadatos (`_SyncSeinen_Metadata`) y carpeta de partidas (`SyncSeinen_games_saves`), por lo que puedes sincronizar tus saves entre tu PC y tu Steam Deck de forma transparente.

---

## ✨ Características Principales

- ☁️ **Multi-nube con rclone integrado:** Soporta **Google Drive**, **OneDrive** y **Dropbox** desde la vista **Services**, iniciando sesión directamente con el navegador de Steam (incluye `rclone` para Linux x86_64 integrado en el plugin).
- 🎮 **Panel Rápido (QAM):**
  - Muestra únicamente las sincronizaciones creadas o vinculadas en tu Steam Deck, agrupadas por servicio.
  - Estado (**Pending** si el último *Push* vino de otro dispositivo como tu PC, o **Up to date**).
  - Barra de progreso en tiempo real con porcentaje y detalle de transferencia de `rclone` al sincronizar.
  - Botones directos de **sync**, **Pull**, **Push**, **Ver ruta**, **Eliminar** (permite elegir entre eliminar solo de la Steam Deck o también de tu cuenta en la nube), **Refresh status** y botón de **Apagar / En espera**.
  - Selector de idioma **English / Español** en **Services → Settings / Ajustes**.
- 🔄 **Sync here (traer saves desde tu nube a la Steam Deck):**
  - Lista los saves de videojuegos guardados en tu nube desde otros dispositivos.
  - Detecta automáticamente rutas de guardado en prefixes Proton (`compatdata` en SSD interno y tarjeta SD vía `libraryfolders.vdf`), rutas nativas de Linux, `userdata`, EmuDeck y Flatpak; muestra la ruta detectada o te permite elegirla manualmente.
- 📤 **Upload (subir saves desde la Steam Deck):**
  - Escanea partidas guardadas de Steam/Proton y emuladores con carátulas de **SteamGridDB** y botón de **Refresh / Refrescar**.
  - **Add manual:** Permite elegir nombre, servicio, buscar carátula en una ventana flotante con **DuckDuckGo**, y seleccionar una carpeta o **archivos específicos** (ignorando automáticamente los archivos y subcarpetas no seleccionados).
- 📁 **Explorador de archivos integrado (solo lectura):**
  - Inspirado en Decky File Manager con accesos rápidos (`Home`, `Emulation/saves`, `Steam compatdata`, `SD Card`), diseñado únicamente para navegar y seleccionar rutas/archivos sin modificar ni eliminar nada.

---

## 📦 Instalación en Steam Deck

1. Descarga `DeckSeinen-DeckyPlugin.zip` desde la sección de [**Releases**](https://github.com/Mrpapita2124/Deck-Seinen/releases).
2. En tu Steam Deck (Modo Juego), abre el menú rápido de **Decky Loader** → **Configuración** → **Developer** (modo desarrollador) → **Install Plugin from ZIP** y selecciona el archivo descargado.
   *(También puedes descomprimir la carpeta `DeckSeinen` dentro de `/home/deck/homebrew/plugins/`).*

---

## 🛠️ Compilación desde código fuente

```bash
npm install
npm run build
```
