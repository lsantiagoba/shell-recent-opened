import Clutter from 'gi://Clutter';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {clearRecentDocuments} from './recentFiles.js';

let dialog = null;

// Recent files are shared by every GTK app, so clearing them asks first,
// like the Privacy panel of GNOME Settings does.
export function confirmClearHistory(settings) {
    if (dialog)
        return;

    dialog = new ModalDialog.ModalDialog();
    dialog.connect('destroy', () => (dialog = null));

    dialog.contentLayout.add_child(new Dialog.MessageDialogContent({
        title: _('Clear recent history?'),
        description: _('This removes the list of recent applications and the recently opened files of all applications.'),
    }));
    dialog.setButtons([{
        label: _('Cancel'),
        action: () => dialog.close(),
        key: Clutter.KEY_Escape,
    }, {
        label: _('Clear'),
        action: () => {
            settings.set_strv('recent-apps', []);
            clearRecentDocuments();
            dialog.close();
        },
        default: true,
    }]);
    dialog.open();
}

// The extension is disabled on every screen lock; an open dialog must go too.
export function closeClearHistory() {
    dialog?.destroy();
}
