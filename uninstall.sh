#!/bin/bash

# SPDX-FileCopyrightText: 2026 lsbcodes
# SPDX-License-Identifier: GPL-2.0-or-later

# Uninstallation script for Shell Recent Opened
set -e

EXTENSION_UUID="shell-recent-opened@lsantiagoba"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
LAUNCHER_ID="shell-recent-opened.desktop"
LAUNCHER_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/applications/$LAUNCHER_ID"
SETTINGS_PATH="/org/gnome/shell/extensions/shell-recent-opened/"

echo -e "\n\n\t~~~~~~~~~~~~~~~~ Shell Recent Opened ~~~~~~~~~~~~~~~~\n"
echo -e "\tRunning uninstallation script...\n"

# Check if extension is installed
if [ ! -d "$EXTENSION_DIR" ]; then
    echo -e "\t⚠️  Extension is not installed."
    echo -e "\n\t~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n"
    exit 0
fi

# Disable the extension
echo -e "\t1. Disabling extension..."
if command -v gnome-extensions &> /dev/null; then
    gnome-extensions disable $EXTENSION_UUID 2>/dev/null || echo -e "\t   (Extension was not enabled)"
else
    echo -e "\t   (Skipping - gnome-extensions command not found)"
fi

# Remove files
echo -e "\t2. Removing extension files..."
if [ -d "$EXTENSION_DIR" ]; then
    rm -rf "$EXTENSION_DIR"
    echo -e "\t   Files removed successfully"
fi

# The extension keeps its Dash launcher on disable, so it is removed here.
echo -e "\t3. Removing the Dash launcher..."
rm -f "$LAUNCHER_FILE"
if command -v gsettings &> /dev/null; then
    favorites=$(gsettings get org.gnome.shell favorite-apps)
    cleaned=$(echo "$favorites" | sed -e "s/, '$LAUNCHER_ID'//" -e "s/'$LAUNCHER_ID', //" -e "s/'$LAUNCHER_ID'//")
    if [ "$favorites" != "$cleaned" ]; then
        gsettings set org.gnome.shell favorite-apps "$cleaned"
    fi
fi
# Lets a later install pin the launcher again.
if command -v dconf &> /dev/null; then
    dconf reset "${SETTINGS_PATH}dash-pinned"
fi
echo -e "\t   Launcher removed"

echo -e "\n\t------------------------------------------------"
echo -e "\t| Shell Recent Opened uninstalled successfully  |"
echo -e "\t------------------------------------------------"
echo -e "\n\tPlease restart GNOME Shell:"
echo -e "\t  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "\t  - On Wayland: Log out and log back in"
echo -e "\n\t~~~~~~~~~~~~~~~~~~ Thank You ~~~~~~~~~~~~~~~~~~\n"

exit 0
