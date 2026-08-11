/**
 * Normalize messy user input into a valid crawl URL.
 * Accepts: webingo.in, www.example.com/path, https://...
 */
export function normalizeUrl(input) {
    if (!input || typeof input !== 'string') return null;

    let raw = input.trim();
    if (!raw) return null;

    raw = raw.replace(/^[<"']+|[>"']+$/g, '');

    if (!/^https?:\/\//i.test(raw)) {
        raw = `https://${raw}`;
    }

    try {
        const url = new URL(raw);

        if (!['http:', 'https:'].includes(url.protocol)) return null;

        const host = url.hostname.toLowerCase();
        if (!host || host === '.') return null;

        const isLocalhost = host === 'localhost' || host.endsWith('.localhost');
        const hasDomain = host.includes('.') || isLocalhost;
        if (!hasDomain) return null;

        if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host) && !isLocalhost) {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

export function getDisplayDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}
