import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DBUS_INTERFACE, DBUS_PATH, installLauncher, pinLauncherOnce} from './dashLauncher.js';
import {RecentMenuButton} from './recentMenuButton.js';

// Applications are remembered by the focus they get, so this list is kept
// a bit longer than what the menu shows.
const MAX_TRACKED_APPS = 30;

export default class ShellRecentOpenedExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._button = new RecentMenuButton(this);
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._focusId = global.display.connect('notify::focus-window', () => this._trackFocusedApp());

        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE, {
            Show: () => this._button.menu.open(),
        });
        this._dbus.export(Gio.DBus.session, DBUS_PATH);

        // The Dash keeps a pinned ID until its desktop file shows up, so
        // pinning does not need to wait for the file to be written.
        pinLauncherOnce(this._settings);
        this._cancellable = new Gio.Cancellable();
        installLauncher(this._cancellable).catch(e => {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logError(e, 'Cannot add the recent items launcher to the Dash');
        });
    }

    disable() {
        this._cancellable.cancel();
        this._cancellable = null;

        this._dbus.unexport();
        this._dbus = null;

        if (this._focusId) {
            global.display.disconnect(this._focusId);
            this._focusId = 0;
        }

        this._button.destroy();
        this._button = null;
        this._settings = null;
    }

    _trackFocusedApp() {
        const window = global.display.focus_window;
        const app = window && Shell.WindowTracker.get_default().get_window_app(window);
        if (!app)
            return;

        const id = app.get_id();
        const ids = this._settings.get_strv('recent-apps').filter(item => item !== id);
        ids.unshift(id);

        this._settings.set_strv('recent-apps', ids.slice(0, MAX_TRACKED_APPS));
    }
}
