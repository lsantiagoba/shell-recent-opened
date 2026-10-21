import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');

// GTK, GNOME Files and most other apps record opened documents here.
const XBEL_PATH = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);

// Matches the largest value allowed for the max-items setting.
const MAX_DOCUMENTS = 30;

// Apps often rewrite the history several times in a row, so reloading waits
// until things settle.
const RELOAD_DELAY_MS = 300;

const BOOKMARK_RE = /<bookmark\s([^>]*)>([\s\S]*?)<\/bookmark>/g;
const ATTRIBUTE_RE = /([\w:-]+)="([^"]*)"/g;
const MIME_RE = /<mime:mime-type\s+type="([^"]*)"/;
// What GTK itself writes when the history is empty.
const EMPTY_XBEL = `<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0"
      xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks"
      xmlns:mime="http://www.freedesktop.org/standards/shared-mime-info"
>
</xbel>
`;
const XML_ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"};

function unescapeXml(text) {
    return text.replace(/&(amp|lt|gt|quot|apos);/g, entity => XML_ENTITIES[entity]);
}

function parseAttributes(source) {
    const attributes = {};
    for (const [, name, value] of source.matchAll(ATTRIBUTE_RE))
        attributes[name] = unescapeXml(value);
    return attributes;
}

function toUnixTime(isoDate) {
    const date = isoDate ? GLib.DateTime.new_from_iso8601(isoDate, null) : null;
    return date ? date.to_unix() : 0;
}

// Pure text-in, data-out so it can be checked outside of GNOME Shell.
export function parseXbel(text) {
    const items = [];

    for (const [, rawAttributes, body] of text.matchAll(BOOKMARK_RE)) {
        const {href, visited, modified} = parseAttributes(rawAttributes);
        if (!href)
            continue;

        items.push({
            uri: href,
            timestamp: toUnixTime(visited ?? modified),
            mime: body.match(MIME_RE)?.[1] ?? null,
        });
    }

    return items;
}

async function fileExists(file, cancellable) {
    try {
        await file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable);
        return true;
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return false;
        throw e;
    }
}

// Returns the newest documents first, skipping local files that no longer exist.
// Remote entries are kept as-is: checking them could hang on a network mount.
async function loadRecentDocuments(file, cancellable) {
    let text;
    try {
        const [contents] = await file.load_contents_async(cancellable);
        text = new TextDecoder().decode(contents);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return [];
        throw e;
    }

    const documents = [];
    const items = parseXbel(text).sort((a, b) => b.timestamp - a.timestamp);

    for (const item of items) {
        if (documents.length >= MAX_DOCUMENTS)
            break;

        const document = Gio.File.new_for_uri(item.uri);
        if (document.is_native() && !await fileExists(document, cancellable))
            continue;

        const path = document.get_path();
        documents.push({
            uri: item.uri,
            mime: item.mime,
            name: document.get_basename(),
            folder: path ? GLib.path_get_dirname(path) : '',
        });
    }

    return documents;
}

// Keeps the newest documents in memory and reloads them in the background
// whenever another app writes the history, so building the menu does no IO.
export class RecentDocuments {
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._documents = [];
        this._generation = 0;
        this._reloadId = 0;
        this._cancellable = new Gio.Cancellable();

        this._file = Gio.File.new_for_path(XBEL_PATH);
        this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitorId = this._monitor.connect('changed', () => this._scheduleReload());

        this._reload();
    }

    get(limit) {
        return this._documents.slice(0, limit);
    }

    destroy() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }

        this._cancellable.cancel();
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._onChanged = null;
    }

    _scheduleReload() {
        if (this._reloadId)
            return;

        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DELAY_MS, () => {
            this._reloadId = 0;
            this._reload();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _reload() {
        // A newer reload may finish first; only the latest one is kept.
        const generation = ++this._generation;

        let documents;
        try {
            documents = await loadRecentDocuments(this._file, this._cancellable);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            logError(e, 'Cannot read the recently used files');
            documents = [];
        }

        if (generation !== this._generation || this._cancellable.is_cancelled())
            return;

        this._documents = documents;
        this._onChanged?.();
    }
}

// GTK apps watch this file and reload it, so emptying it clears their recent
// lists too. PRIVATE keeps the file readable only by its owner, as GTK does.
export function clearRecentDocuments() {
    const contents = new GLib.Bytes(new TextEncoder().encode(EMPTY_XBEL));

    Gio.File.new_for_path(XBEL_PATH).replace_contents_bytes_async(
        contents, null, false, Gio.FileCreateFlags.PRIVATE, null, (file, result) => {
            try {
                file.replace_contents_finish(result);
            } catch (e) {
                logError(e, 'Cannot clear the recently used files');
            }
        });
}
