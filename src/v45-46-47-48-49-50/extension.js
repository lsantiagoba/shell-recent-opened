import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {closeClearHistory} from './clearHistory.js';
import {DBUS_INTERFACE, DBUS_PATH, LAUNCHER_ID, installLauncher, pinLauncherOnce} from './dashLauncher.js';
import {RecentDocuments} from './recentFiles.js';
import {RecentGrid} from './recentGrid.js';
import {RecentMenuButton} from './recentMenuButton.js';

// Applications are remembered by the focus they get, so this list is kept
// a bit longer than what the menu shows.
const MAX_TRACKED_APPS = 30;

export default class ShellRecentOpenedExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // Shared by the menu and the app grid, so the history is read once.
        this._documents = new RecentDocuments(() => {
            this._button?.onDocumentsChanged();
            if (Main.overview.visible)
                this._grid?.update();
        });

        this._focusId = global.display.connect('notify::focus-window', () => this._trackFocusedApp());

        this._settingsIds = [
            this._settings.connect('changed::show-in-panel', () => this._syncPanelButton()),
            this._settings.connect('changed::show-in-app-grid', () => this._syncGrid()),
            this._settings.connect('changed::show-documents-in-app-grid', () => this._syncGrid()),
            this._settings.connect('changed::show-in-dash', () => this._syncDashFromSetting()),
        ];
        this._syncPanelButton();
        this._syncGrid();

        // Without the top bar button, the launcher opens the app grid,
        // where the recent rows are.
        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE, {
            Show: () => {
                if (this._button)
                    this._button.menu.open();
                else
                    Main.overview.showApps();
            },
        });
        this._dbus.export(Gio.DBus.session, DBUS_PATH);

        // The Dash keeps a pinned ID until its desktop file shows up, so
        // pinning does not need to wait for the file to be written.
        pinLauncherOnce(this._settings);
        this._syncSettingFromDash();
        this._favoritesId = global.settings.connect('changed::favorite-apps', () => this._syncSettingFromDash());

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

        global.settings.disconnect(this._favoritesId);
        global.display.disconnect(this._focusId);
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];

        closeClearHistory();

        this._grid?.destroy();
        this._grid = null;

        this._button?.destroy();
        this._button = null;

        this._documents.destroy();
        this._documents = null;
        this._settings = null;
    }

    _syncPanelButton() {
        const show = this._settings.get_boolean('show-in-panel');

        if (show && !this._button) {
            this._button = new RecentMenuButton(this, this._settings, this._documents);
            Main.panel.addToStatusArea(this.uuid, this._button);
        } else if (!show && this._button) {
            this._button.destroy();
            this._button = null;
        }
    }

    _syncGrid() {
        const show = this._settings.get_boolean('show-in-app-grid') ||
            this._settings.get_boolean('show-documents-in-app-grid');

        if (show && !this._grid) {
            this._grid = new RecentGrid(this._settings, this._documents);
            if (!this._grid.attach()) {
                console.warn(`${this.uuid}: cannot find the app grid, recent items are not shown there`);
                this._grid.destroy();
                this._grid = null;
            }
        } else if (!show && this._grid) {
            this._grid.destroy();
            this._grid = null;
        }
    }

    // The switch in the settings pins or unpins the launcher...
    _syncDashFromSetting() {
        const favorites = global.settings.get_strv('favorite-apps');
        const pinned = favorites.includes(LAUNCHER_ID);
        const show = this._settings.get_boolean('show-in-dash');

        if (show && !pinned)
            global.settings.set_strv('favorite-apps', [...favorites, LAUNCHER_ID]);
        else if (!show && pinned)
            global.settings.set_strv('favorite-apps', favorites.filter(id => id !== LAUNCHER_ID));
    }

    // ...and unpinning it from the Dash turns the switch off.
    _syncSettingFromDash() {
        const pinned = global.settings.get_strv('favorite-apps').includes(LAUNCHER_ID);
        if (this._settings.get_boolean('show-in-dash') !== pinned)
            this._settings.set_boolean('show-in-dash', pinned);
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
