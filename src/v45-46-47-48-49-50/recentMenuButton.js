import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readRecentDocuments} from './recentFiles.js';

const ICON_SIZE = 32;
const FALLBACK_APP_ICON = 'application-x-executable';

export const RecentMenuButton = GObject.registerClass(
class RecentMenuButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, extension.metadata.name);

        this._settings = extension.getSettings();

        this.add_child(new St.Icon({
            icon_name: 'document-open-recent-symbolic',
            style_class: 'system-status-icon',
        }));

        // PopupMenu refuses to open while it is empty, so the menu is filled
        // right away and then refreshed every time it opens.
        this._rebuild();
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open)
                this._rebuild();
        });
    }

    _rebuild() {
        this.menu.removeAll();

        try {
            const limit = this._settings.get_uint('max-items');
            const apps = this._recentApps(limit);
            const documents = this._recentDocuments(limit);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(
                _('Recent applications')));
            this._addItems(apps, _('No applications yet'));

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(
                _('Recent documents')));
            this._addItems(documents, _('No documents yet'));
        } catch (e) {
            logError(e, 'Cannot build the recent items menu');
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(String(e), {reactive: false}));
        }
    }

    _recentApps(limit) {
        const system = Shell.AppSystem.get_default();

        return this._settings.get_strv('recent-apps')
            .map(id => system.lookup_app(id))
            .filter(app => app && (app.app_info?.should_show() ?? true))
            .slice(0, limit)
            .map(app => ({
                title: app.get_name(),
                subtitle: '',
                icon: app.get_icon() ?? new Gio.ThemedIcon({name: FALLBACK_APP_ICON}),
                activate: () => app.activate(),
            }));
    }

    _recentDocuments(limit) {
        return readRecentDocuments(limit).map(doc => ({
            title: doc.name,
            subtitle: doc.folder,
            icon: doc.mime
                ? Gio.content_type_get_icon(doc.mime)
                : new Gio.ThemedIcon({name: FALLBACK_APP_ICON}),
            activate: () => this._openUri(doc.uri),
        }));
    }

    _addItems(entries, emptyText) {
        if (entries.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(emptyText, {reactive: false}));
            return;
        }

        for (const entry of entries) {
            const item = new PopupMenu.PopupBaseMenuItem();
            item.add_child(this._buildRow(entry));
            item.connect('activate', () => entry.activate());
            this.menu.addMenuItem(item);
        }
    }

    _buildRow({title, subtitle, icon}) {
        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 12px;'});

        row.add_child(new St.Icon({gicon: icon, icon_size: ICON_SIZE}));

        const labels = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        labels.add_child(new St.Label({text: title, x_align: Clutter.ActorAlign.START}));
        if (subtitle) {
            labels.add_child(new St.Label({
                text: subtitle,
                style_class: 'dim-label',
                x_align: Clutter.ActorAlign.START,
            }));
        }
        row.add_child(labels);

        return row;
    }

    _openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (e) {
            logError(e, `Cannot open recent document ${uri}`);
        }
    }
});
