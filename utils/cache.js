import config from '../config/config.js';

class Cache {
    constructor() {
        this.cache = new Map();
    }

    generateKey(url, options = {}) {
        return `${url}-${JSON.stringify(options)}`;
    }

    set(url, sitemap, options = {}) {
        const key = this.generateKey(url, options);
        this.cache.set(key, {
            data: sitemap,
            timestamp: Date.now(),
            options
        });
    }

    get(url, options = {}) {
        const key = this.generateKey(url, options);
        const cached = this.cache.get(key);

        if (!cached) return null;

        const age = (Date.now() - cached.timestamp) / 1000; // age in seconds
        if (age > config.sitemap.cacheExpiration) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    clear() {
        this.cache.clear();
    }

    clearExpired() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            const age = (now - value.timestamp) / 1000;
            if (age > config.sitemap.cacheExpiration) {
                this.cache.delete(key);
            }
        }
    }
}

export default new Cache(); 