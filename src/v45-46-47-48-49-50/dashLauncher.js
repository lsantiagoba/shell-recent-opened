import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

export const LAUNCHER_ID = 'shell-recent-opened.desktop';
export const DBUS_PATH = '/org/gnome/Shell/Extensions/RecentOpened';
export const DBUS_INTERFACE = `
<node>
    <interface name="org.gnome.Shell.Extensions.RecentOpened">
        <method name="Show"/>
    </interface>
</node>`;

// The launcher has no program of its own: it asks the running shell, through
// the D-Bus object this extension exports, to open the recent items menu.
const LAUNCHER_CONTENTS = `[Desktop Entry]
Type=Application
Name=Recent Items
Name[es]=Recientes
Comment=Show recently opened applications and documents
Comment[es]=Muestra las aplicaciones y documentos abiertos recientemente
Icon=document-open-recent
Exec=gdbus call --session --dest org.gnome.Shell --object-path ${DBUS_PATH} --method org.gnome.Shell.Extensions.RecentOpened.Show
Terminal=false
StartupNotify=false
Categories=Utility;
`;

// Kept on disable on purpose, like a pinned Dash icon: the shell disables
// extensions on every screen lock, and removing it would reorder the Dash.
export async function installLauncher(cancellable) {
    const dir = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'applications']));
    try {
        await dir.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }

    const contents = new GLib.Bytes(new TextEncoder().encode(LAUNCHER_CONTENTS));
    await dir.get_child(LAUNCHER_ID).replace_contents_bytes_async(
        contents, null, false, Gio.FileCreateFlags.NONE, cancellable);
}

// Pins the launcher only once, so a user who unpins it keeps it unpinned.
export function pinLauncherOnce(settings) {
    if (settings.get_boolean('dash-pinned'))
        return;

    const favorites = global.settings.get_strv('favorite-apps');
    if (!favorites.includes(LAUNCHER_ID))
        global.settings.set_strv('favorite-apps', [...favorites, LAUNCHER_ID]);

    settings.set_boolean('dash-pinned', true);
}
