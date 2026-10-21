<p align="center">
  <img src="assets/shell-recent-opened.svg" width="128" alt="Shell Recent Opened icon">
</p>

# Shell Recent Opened

A GNOME Shell extension that shows your recently opened applications and documents in one menu, available from the top bar and from the Dash.

## Features

- **Recent applications:** The apps you used most recently, in order. Click one to bring it back.
- **Recent documents:** Files from the shared GNOME history (`~/.local/share/recently-used.xbel`), which GTK and GNOME apps write to. Click one to open it with its default app. Local files that no longer exist are hidden.
- **Clear history:** One menu item clears both the list of recent applications and the recently opened files, after asking for confirmation. The files history is shared by all GTK and GNOME apps, so their recent lists are cleared too.
- **Top bar button:** A "recent" icon in the top bar opens the menu.
- **Dash launcher:** A **Recent Items** launcher is pinned to the Dash once and opens the same menu. If you unpin it, it stays unpinned.
- **Localized UI:** Uses standard gettext catalogs and follows the system language automatically.

## Supported GNOME Shell Versions

- GNOME 45
- GNOME 46
- GNOME 47
- GNOME 48
- GNOME 49
- GNOME 50

## Project Structure

```
src/v45-46-47-48-49-50/
├── extension.js          # Entry point: panel button, app tracking and D-Bus object
├── recentMenuButton.js   # Top bar button and its menu
├── recentFiles.js        # Reads recently used documents
├── dashLauncher.js       # Dash launcher and its D-Bus interface
└── metadata.json
schemas/                  # GSettings schema
po/                       # Translations
assets/                   # Icon
```

## Settings

Schema: `org.gnome.shell.extensions.shell-recent-opened`

| Key | Default | Meaning |
| --- | --- | --- |
| `max-items` | `8` | Items shown per section (1–30) |
| `recent-apps` | `[]` | Application IDs, filled automatically |
| `dash-pinned` | `false` | Set once the Dash launcher has been pinned |

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/shell-recent-opened@lsantiagoba/schemas set org.gnome.shell.extensions.shell-recent-opened max-items 12
```

## Installation

### From Source

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/lsantiagoba/shell-recent-opened.git
   cd shell-recent-opened
   ```

2. Run the provided installation script:
   ```bash
   # Debian/Ubuntu: sudo apt install gettext libglib2.0-bin
   ./install.sh
   ```

3. Restart GNOME Shell:
   - **X11:** Press `Alt` + `F2`, type `r`, and press `Enter`.
   - **Wayland:** Log out and log back in. This is needed after every install or update, because GNOME Shell caches extension code.

4. Enable the extension:
   You can enable it using the "Extensions" app, "Extension Manager", or via the command line:
   ```bash
   gnome-extensions enable shell-recent-opened@lsantiagoba
   ```

## Notes

- Applications are tracked from the moment the extension is enabled, when their windows get focus. Apps used before that are not listed.
- Remote documents (for example over SFTP) are listed without checking that they still exist, because that check could block the shell on a slow network mount.
- The Dash launcher is kept when the extension is disabled, since GNOME disables extensions on every screen lock. `./uninstall.sh` removes it.

## Packaging

To create the `.zip` for extensions.gnome.org:

```bash
./pack-extension.sh
```

## Uninstallation

```bash
./uninstall.sh
```

This also removes the Dash launcher and unpins it.

## License

Copyright (C) 2026 lsbcodes

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.

SPDX-License-Identifier: `GPL-2.0-or-later`
