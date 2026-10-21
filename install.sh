#!/bin/bash

# SPDX-FileCopyrightText: 2026 lsbcodes
# SPDX-License-Identifier: GPL-2.0-or-later

# Installation script for Shell Recent Opened
set -e

EXTENSION_UUID="shell-recent-opened@lsantiagoba"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/src/v45-46-47-48-49-50"
SCHEMA_DIR="$SCRIPT_DIR/schemas"
PO_DIR="$SCRIPT_DIR/po"
GETTEXT_DOMAIN="shell-recent-opened"

# Detect GNOME Shell version
SHELL_VERSION=$(gnome-shell --version | cut -d ' ' -f3 | cut -d '.' -f1)

if [[ $SHELL_VERSION -lt 45 ]]
then
    echo "This extension requires GNOME Shell 45 or higher."
    echo "Current version: $SHELL_VERSION"
    echo "Exiting with no changes."
    exit 1
fi

for tool in msgfmt glib-compile-schemas; do
    if ! command -v "$tool" > /dev/null 2>&1; then
        echo "$tool is required to install the extension."
        exit 1
    fi
done

echo -e "\n\n\t~~~~~~~~~~~~~~~~ Shell Recent Opened ~~~~~~~~~~~~~~~~\n"
echo -e "\tRunning installation script...\n"
echo -e "\t1. GNOME Shell version $SHELL_VERSION detected"

echo -e "\t2. Creating extension directory..."
mkdir -p "$EXTENSION_DIR"

# Remove files left by older packages before installing the current source.
echo -e "\t3. Copying extension files..."
find "$EXTENSION_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/"
cp "$SOURCE_DIR"/*.js "$EXTENSION_DIR/"

# A manual install has to compile the schema itself.
echo -e "\t4. Installing GSettings schema..."
mkdir -p "$EXTENSION_DIR/schemas"
cp "$SCHEMA_DIR"/*.gschema.xml "$EXTENSION_DIR/schemas/"
glib-compile-schemas "$EXTENSION_DIR/schemas"

# Compile gettext catalogs in the layout expected by GNOME Shell.
echo -e "\t5. Compiling translations..."
for language in $(cat "$PO_DIR/LINGUAS"); do
    locale_dir="$EXTENSION_DIR/locale/$language/LC_MESSAGES"
    mkdir -p "$locale_dir"
    msgfmt "$PO_DIR/$language.po" -o "$locale_dir/$GETTEXT_DOMAIN.mo"
done

echo -e "\t6. Enabling extension..."
if command -v gnome-extensions &> /dev/null; then
    gnome-extensions enable $EXTENSION_UUID || echo -e "\t   (Extension will be enabled after restart)"
else
    echo -e "\t   (Extension will be enabled after restart)"
fi

echo -e "\n\t-----------------------------------------------"
echo -e "\t| Shell Recent Opened is installed successfully |"
echo -e "\t-----------------------------------------------"
echo -e "\n\tPlease restart GNOME Shell:"
echo -e "\t  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "\t  - On Wayland: Log out and log back in"
echo -e "\n\t~~~~~~~~~~~~~~~~~~ Thank You ~~~~~~~~~~~~~~~~~~\n"

exit 0
