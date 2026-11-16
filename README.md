# Deck-Seinen

🌐 **English** | [Español](README.es.md)

A **Decky Loader** plugin (Steam Deck / SteamOS) based on [**SyncSeinen**](https://github.com/Mrpapita2124/syncseinen) to synchronize PC game saves, emulator saves, and custom folders with **Google Drive**, **OneDrive**, and **Dropbox** using **rclone**.

> 💡 **Looking for the desktop app for Windows and Linux?**
> Check out the main repository: [**SyncSeinen (Windows & Linux)**](https://github.com/Mrpapita2124/syncseinen).
> **Deck-Seinen** shares the exact same metadata format (`_SyncSeinen_Metadata`) and save folder (`SyncSeinen_games_saves`), so you can seamlessly sync your saves between your PC and your Steam Deck.

---

## ✨ Key Features

- ☁️ **Multi-cloud with bundled rclone:** Supports **Google Drive**, **OneDrive**, and **Dropbox** via the built-in **Services** view, signing in directly through the Steam browser (`rclone` for Linux x86_64 is bundled inside the plugin).
- 🎮 **Quick Access Menu (QAM):**
  - Displays only the syncs created or linked on your Steam Deck, grouped by cloud provider.
  - Real-time status (**Pending** if the last *Push* came from another device like your PC, or **Up to date**).
  - Live **rclone** progress bar with percentage and transfer details when syncing.
  - Quick actions for **sync**, **Pull**, **Push**, **View path**, **Delete** (choose between removing only from Steam Deck or also from your cloud account), **Refresh status**, and a **Power / Standby** toggle.
  - Built-in **English / Español** language switcher in **Services → Settings**.
- 🔄 **Sync here (pull saves from your cloud to Steam Deck):**
  - Lists game saves stored in your cloud from other devices.
  - Automatically detects save paths across Steam/Proton prefixes (`compatdata` on internal SSD and SD card via `libraryfolders.vdf`), native Linux folders, Steam `userdata`, EmuDeck, and Flatpak emulators, or lets you pick a folder manually.
- 📤 **Upload (push saves from Steam Deck to your cloud):**
  - Scans Steam/Proton and emulator saves with **SteamGridDB** covers, plus a **Refresh** button.
  - **Add manual:** Choose a name, cloud service, search covers in a floating **DuckDuckGo** modal, and select a folder or **specific files** (automatically ignoring unselected files and subfolders).
- 📁 **Built-in read-only file explorer:**
  - Inspired by Decky File Manager with quick bookmarks (`Home`, `Emulation/saves`, `Steam compatdata`, `SD Card`) to browse and select paths/files safely without modifying or deleting anything.

---

## 📦 Installation on Steam Deck

1. Download `DeckSeinen-DeckyPlugin.zip` from the [**Releases**](https://github.com/Mrpapita2124/Deck-Seinen/releases) page.
2. On your Steam Deck (Gaming Mode), open the **Decky Loader** Quick Access Menu → **Settings** → **Developer** → **Install Plugin from ZIP** and select the downloaded archive.
   *(Alternatively, extract the `DeckSeinen` folder into `/home/deck/homebrew/plugins/`.)*

---

## 🛠️ Building from Source

```bash
npm install
npm run build
```
