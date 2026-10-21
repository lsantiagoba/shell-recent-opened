import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// GTK, GNOME Files and most other apps record opened documents here.
const XBEL_PATH = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);

const BOOKMARK_RE = /<bookmark\s([^>]*)>([\s\S]*?)<\/bookmark>/g;
const ATTRIBUTE_RE = /([\w:-]+)="([^"]*)"/g;
const MIME_RE = /<mime:mime-type\s+type="([^"]*)"/;
const APPLICATION_RE = /<bookmark:application\s+name="([^"]*)"/;
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

// Returns the newest documents first, skipping local files that no longer exist.
// Remote entries are kept as-is: checking them could block on a network mount.
export function readRecentDocuments(limit) {
    let text;
    try {
        const [ok, contents] = Gio.File.new_for_path(XBEL_PATH).load_contents(null);
        if (!ok)
            return [];
        text = new TextDecoder().decode(contents);
    } catch (e) {
        return [];
    }

    const documents = [];
    const items = parseXbel(text).sort((a, b) => b.timestamp - a.timestamp);

    for (const item of items) {
        if (documents.length >= limit)
            break;

        const file = Gio.File.new_for_uri(item.uri);
        const path = file.get_path();

        if (file.is_native() && !file.query_exists(null))
            continue;

        documents.push({
            uri: item.uri,
            mime: item.mime,
            name: file.get_basename(),
            folder: path ? GLib.path_get_dirname(path) : '',
        });
    }

    return documents;
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
