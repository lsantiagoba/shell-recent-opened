import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ShellRecentOpenedPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({icon_name: 'document-open-recent-symbolic'});
        window.add(page);

        const switchRow = (key, title, subtitle = '') => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        const places = new Adw.PreferencesGroup({title: _('Top bar and Dash')});
        places.add(switchRow('show-in-panel', _('Top bar button')));
        places.add(switchRow('show-in-dash', _('Dash launcher'),
            _('Opens the top bar menu, or the app grid when the button is hidden')));
        page.add(places);

        const grid = new Adw.PreferencesGroup({title: _('App grid')});
        grid.add(switchRow('show-in-app-grid', _('Recent applications')));
        grid.add(switchRow('show-documents-in-app-grid', _('Recent documents')));
        page.add(grid);

        const general = new Adw.PreferencesGroup();
        const items = Adw.SpinRow.new_with_range(1, 30, 1);
        items.title = _('Items per section');
        items.value = settings.get_uint('max-items');
        items.connect('notify::value', () => settings.set_uint('max-items', Math.round(items.value)));
        general.add(items);
        page.add(general);
    }
}
