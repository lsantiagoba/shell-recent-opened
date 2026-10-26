import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {confirmClearHistory} from './clearHistory.js';

// Each row has to fit on one line above the grid, even on small screens.
const MAX_ROW_ITEMS = 10;
const FALLBACK_DOCUMENT_ICON = 'text-x-generic';

// The app grid is not a public API: this is where GNOME Shell 45 to 50 keep it.
function findAppDisplay() {
    return Main.overview._overview?._controls?._appDisplay ?? null;
}

function sameItems(a, b) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
}

// The shell's app icon, without its drop handling: dropping a grid icon on
// it would otherwise create an app folder with an app the grid doesn't own.
const RecentAppIcon = GObject.registerClass(
class RecentAppIcon extends AppDisplay.AppIcon {
    _init(app) {
        // Dragging is off for the same reason: the grid would treat a drop as
        // moving one of its own icons, and would unpin the app from the Dash.
        super._init(app, {isDraggable: false, expandTitleOnHover: false});
    }

    handleDragOver() {
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop() {
        return false;
    }
});

// A document tile styled like an app icon. Clicking it opens the document
// with its default application.
const DocumentTile = GObject.registerClass(
class DocumentTile extends AppDisplay.AppViewItem {
    _init(document) {
        super._init({style_class: 'overview-tile', accessible_name: document.name}, false, false);

        this._id = document.uri;
        this._uri = document.uri;
        this._gicon = document.mime
            ? Gio.content_type_get_icon(document.mime)
            : new Gio.ThemedIcon({name: FALLBACK_DOCUMENT_ICON});

        this.icon = new IconGrid.BaseIcon(document.name, {
            createIcon: size => new St.Icon({gicon: this._gicon, icon_size: size}),
            setSizeManually: true,
        });
        this.set_child(this.icon);
        this.label_actor = this.icon.label;

        this._cancellable = new Gio.Cancellable();
        this.connect('destroy', () => this._cancellable.cancel());
        this._loadThumbnail();
    }

    // Pictures and other files the file manager already previewed get their
    // thumbnail instead of a generic file type icon.
    _loadThumbnail() {
        const file = Gio.File.new_for_uri(this._uri);
        if (!file.is_native())
            return;

        file.query_info_async('thumbnail::path', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW, this._cancellable, (source, result) => {
                let path;
                try {
                    path = source.query_info_finish(result).get_attribute_byte_string('thumbnail::path');
                } catch {
                    return;
                }
                if (!path)
                    return;

                this._gicon = new Gio.FileIcon({file: Gio.File.new_for_path(path)});
                if (this.icon.icon)
                    this.icon.icon.gicon = this._gicon;
            });
    }

    vfunc_clicked() {
        try {
            Gio.AppInfo.launch_default_for_uri(this._uri, global.create_app_launch_context(0, -1));
        } catch (e) {
            logError(e, `Cannot open recent document ${this._uri}`);
            return;
        }
        Main.overview.hide();
    }

    handleDragOver() {
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop() {
        return false;
    }
});

// A titled row of tiles.
const Section = GObject.registerClass(
class Section extends St.BoxLayout {
    _init(title) {
        super._init({vertical: true, x_align: Clutter.ActorAlign.CENTER, style: 'spacing: 6px;'});

        this.add_child(new St.Label({
            text: title,
            style_class: 'dim-label',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        this.tiles = new St.BoxLayout({x_align: Clutter.ActorAlign.CENTER, style: 'spacing: 12px;'});
        this.add_child(this.tiles);

        this.keys = [];
    }

    // Keeps the existing tiles when nothing changed, so an open right-click
    // menu is not destroyed under the pointer.
    setItems(keys, createTile) {
        if (sameItems(keys, this.keys))
            return;

        this.keys = keys;
        this.tiles.destroy_all_children();
        for (const key of keys)
            this.tiles.add_child(createTile(key));
    }
});

// Recent applications and documents shown above the pages of the app grid.
export const RecentGrid = GObject.registerClass(
class RecentGrid extends St.BoxLayout {
    _init(settings, documents) {
        super._init({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: 'padding-bottom: 12px; spacing: 12px;',
        });

        this._settings = settings;
        this._documents = documents;

        this._apps = new Section(_('Recent applications'));
        this.add_child(this._apps);

        this._docs = new Section(_('Recent documents'));
        this.add_child(this._docs);

        this._clearButton = new St.Button({
            label: _('Clear history'),
            style_class: 'button',
            x_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        this._clearButton.connect('clicked', () => confirmClearHistory(this._settings));
        this.add_child(this._clearButton);

        // Recent apps change on every focus change; rebuilding only while
        // the overview is visible avoids work the user never sees.
        this._signals = [
            [Main.overview, Main.overview.connect('showing', () => this.update())],
            [settings, settings.connect('changed', (s, key) => {
                if (key !== 'recent-apps' || Main.overview.visible)
                    this.update();
            })],
        ];

        this.connect('destroy', () => {
            for (const [object, id] of this._signals)
                object.disconnect(id);
            this._signals = [];
        });

        this.update();
    }

    // Returns false when the app grid could not be found.
    attach() {
        const box = findAppDisplay()?._box;
        if (!box)
            return false;

        box.insert_child_at_index(this, 0);
        return true;
    }

    update() {
        const limit = Math.min(this._settings.get_uint('max-items'), MAX_ROW_ITEMS);

        const system = Shell.AppSystem.get_default();
        const apps = this._settings.get_boolean('show-in-app-grid')
            ? this._settings.get_strv('recent-apps')
                .map(id => system.lookup_app(id))
                .filter(app => app && (app.app_info?.should_show() ?? true))
                .slice(0, limit)
            : [];
        const appsById = new Map(apps.map(app => [app.get_id(), app]));
        this._apps.setItems([...appsById.keys()], id => new RecentAppIcon(appsById.get(id)));
        this._apps.visible = apps.length > 0;

        const docs = this._settings.get_boolean('show-documents-in-app-grid')
            ? this._documents.get(limit)
            : [];
        const docsByUri = new Map(docs.map(doc => [doc.uri, doc]));
        this._docs.setItems([...docsByUri.keys()], uri => new DocumentTile(docsByUri.get(uri)));
        this._docs.visible = docs.length > 0;

        this._clearButton.visible = this._apps.visible || this._docs.visible;
        this.visible = this._clearButton.visible;

        this._syncTileSize();
    }

    // Matches the icon size the grid picked for the current screen, and gives
    // every tile the same width so long file names are cut, not stretched.
    _syncTileSize() {
        const gridSize = findAppDisplay()?._grid?.layout_manager?._iconSize;

        for (const tile of [...this._apps.tiles.get_children(), ...this._docs.tiles.get_children()]) {
            if (gridSize > 0)
                tile.icon.setIconSize(gridSize);
            tile.width = Math.round(tile.icon.iconSize * 1.5) + 16;
        }
    }
});
