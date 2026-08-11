import axios from 'axios';
import { URL } from 'url';
import robotsParserPkg from 'robots-parser';

class RobotsParser {
    constructor() {
        this.cache = new Map();
    }

    getOrigin(url) {
        return new URL(url).origin;
    }

    async getRobotsUrl(origin) {
        return `${origin}/robots.txt`;
    }

    async fetchRobotsTxt(origin) {
        try {
            const robotsUrl = await this.getRobotsUrl(origin);
            const response = await axios.get(robotsUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SitemapGenerator/1.0)' }
            });
            return response.data;
        } catch (error) {
            console.warn(`Could not fetch robots.txt for ${origin}:`, error.message);
            return null;
        }
    }

    async isAllowed(targetUrl, userAgent) {
        try {
            const origin = this.getOrigin(targetUrl);

            if (!this.cache.has(origin)) {
                const robotsTxt = await this.fetchRobotsTxt(origin);
                if (!robotsTxt) {
                    this.cache.set(origin, null);
                    return true;
                }

                const parser = robotsParserPkg(`${origin}/robots.txt`, robotsTxt);
                this.cache.set(origin, parser);
            }

            const parser = this.cache.get(origin);
            if (!parser) return true;

            const allowed = parser.isAllowed(targetUrl, userAgent || '*');
            // robots-parser returns undefined when no rule matches — treat as allowed
            return allowed !== false;
        } catch (error) {
            console.error('Error checking robots.txt:', error);
            return true;
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

export default new RobotsParser();
