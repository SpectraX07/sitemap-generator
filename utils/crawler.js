import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import config from '../config/config.js';
import robotsParser from './robotsParser.js';
import EventEmitter from 'events';
import puppeteer from 'puppeteer';

class Crawler extends EventEmitter {
    constructor() {
        super();
        this.visited = new Set();
        this.queue = [];
        this.errors = [];
        this.metadata = new Map();
        this.browser = null;
        this.cancelled = false;
    }

    cancel() {
        this.cancelled = true;
    }

    emitProgress(currentUrl = null) {
        const data = {
            ...this.progress,
            currentUrl,
            phase: this.cancelled ? 'cancelled' : 'crawling'
        };
        this.emit('progress', data);
    }

    async crawl(baseUrl, options = {}) {
        this.cancelled = false;

        try {
            this.baseUrl = baseUrl;
            this.options = {
                ...config.crawler,
                ...options
            };

            try {
                const urlObj = new URL(baseUrl);
                this.baseUrl = urlObj.href;
                this.baseDomain = urlObj.hostname;
            } catch {
                throw new Error(`Invalid base URL: ${baseUrl}`);
            }

            if (this.options.renderJavaScript) {
                this.browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
            }

            this.visited.clear();
            this.queue = [{ url: this.baseUrl, depth: 0 }];
            this.errors = [];
            this.metadata.clear();
            this.progress = {
                total: 1,
                processed: 0,
                successful: 0,
                failed: 0,
                brokenLinks: 0
            };

            this.emitProgress(this.baseUrl);
            await this.processQueue();

            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }

            if (this.errors.length > 0) {
                console.warn(`Completed with ${this.errors.length} errors`);
            }

            const result = {
                urls: Array.from(this.visited),
                metadata: Object.fromEntries(this.metadata),
                errors: this.errors,
                stats: this.progress,
                ...(this.options.maxPages > 0 && this.visited.size >= this.options.maxPages
                    ? { truncated: true, maxPages: this.options.maxPages }
                    : {})
            };

            this.emit('complete', result);
            return result;
        } catch (error) {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            console.error('Crawler error:', error);
            throw error;
        }
    }

    async processQueue() {
        const inFlight = new Set();
        const maxPages = this.options.maxPages || 0;

        while ((this.queue.length > 0 || inFlight.size > 0) && !this.cancelled) {
            if (maxPages > 0 && this.visited.size >= maxPages) {
                this.queue = [];
            }

            while (
                this.queue.length > 0 &&
                inFlight.size < this.options.maxConcurrentRequests &&
                !this.cancelled &&
                (maxPages === 0 || this.visited.size < maxPages)
            ) {
                const { url, depth } = this.queue.shift();
                const task = this.processUrl(url, depth)
                    .catch(error => {
                        console.error(`Error processing ${url}:`, error.message);
                        this.handleError(url, error);
                    })
                    .finally(() => inFlight.delete(task));
                inFlight.add(task);
            }

            if (inFlight.size > 0) {
                await Promise.race(inFlight);
            }

            if (this.options.crawlDelay > 0 && this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.options.crawlDelay));
            }
        }
    }

    shouldProcessUrl(url, urlObj) {
        if (this.options.includePatterns.length > 0) {
            if (!this.options.includePatterns.some(pattern => new RegExp(pattern).test(url))) {
                return false;
            }
        }

        if (this.options.excludePatterns.some(pattern => new RegExp(pattern).test(url))) {
            return false;
        }

        return urlObj.hostname === this.baseDomain;
    }

    async processUrl(url, depth = 0) {
        if (
            this.cancelled ||
            depth >= this.options.maxDepth ||
            this.visited.has(url) ||
            (this.options.maxPages > 0 && this.visited.size >= this.options.maxPages)
        ) {
            return;
        }

        try {
            let urlObj;
            try {
                urlObj = new URL(url);
                url = urlObj.href;
            } catch {
                console.warn(`Skipping invalid URL: ${url}`);
                return;
            }

            if (!this.shouldProcessUrl(url, urlObj)) {
                return;
            }

            this.emitProgress(url);

            if (!this.options.ignoreRobotsTxt) {
                const isAllowed = await robotsParser.isAllowed(url, this.options.userAgent);
                if (!isAllowed) {
                    console.log(`Skipping ${url} - not allowed by robots.txt`);
                    return;
                }
            }

            const response = await this.makeRequest(url);
            if (!response) return;

            const contentType = response.headers['content-type'];
            if (!contentType || !this.options.allowedContentTypes.some(type => contentType.includes(type))) {
                console.log(`Skipping ${url} - unsupported content type: ${contentType}`);
                return;
            }

            this.visited.add(url);
            this.progress.processed++;
            this.progress.successful++;

            const metadata = await this.extractMetadata(url, response);
            this.metadata.set(url, metadata);

            const $ = cheerio.load(response.data);
            const links = this.extractLinks($, url);

            for (const link of links) {
                if (!this.visited.has(link) && !this.queue.some(item => item.url === link)) {
                    this.queue.push({ url: link, depth: depth + 1 });
                    this.progress.total++;
                }
            }

            if (this.options.checkBrokenLinks) {
                await this.checkBrokenLinks(links);
            }

            this.emitProgress(url);
            console.log(`Processed ${url} - Found ${links.size} links`);
        } catch (error) {
            this.handleError(url, error);
        }
    }

    async makeRequest(url, retryCount = 0) {
        try {
            if (this.options.renderJavaScript) {
                return await this.makeRequestWithPuppeteer(url);
            }
            return await this.makeRequestWithAxios(url);
        } catch (error) {
            if (
                retryCount < this.options.retryAttempts &&
                (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.response?.status === 429)
            ) {
                const delay = this.options.retryDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRequest(url, retryCount + 1);
            }
            throw error;
        }
    }

    async makeRequestWithAxios(url) {
        const requestConfig = {
            timeout: this.options.timeout,
            headers: {
                'User-Agent': this.options.userAgent,
                Accept: 'text/html,application/xhtml+xml',
                ...this.options.customHeaders
            },
            maxRedirects: this.options.maxRedirects,
            validateStatus: status => status < 400
        };

        if (this.options.proxyUrl) {
            requestConfig.proxy = {
                protocol: new URL(this.options.proxyUrl).protocol,
                host: new URL(this.options.proxyUrl).hostname,
                port: new URL(this.options.proxyUrl).port
            };
        }

        if (this.options.httpAuth.username && this.options.httpAuth.password) {
            requestConfig.auth = this.options.httpAuth;
        }

        return axios.get(url, requestConfig);
    }

    async makeRequestWithPuppeteer(url) {
        const page = await this.browser.newPage();
        try {
            await page.setExtraHTTPHeaders(this.options.customHeaders);

            if (Object.keys(this.options.cookies).length > 0) {
                await page.setCookie(
                    ...Object.entries(this.options.cookies).map(([name, value]) => ({
                        name,
                        value,
                        domain: new URL(url).hostname
                    }))
                );
            }

            const response = await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: this.options.timeout
            });

            return {
                data: await page.content(),
                headers: response.headers(),
                status: response.status()
            };
        } finally {
            await page.close();
        }
    }

    async extractMetadata(url, response) {
        const $ = cheerio.load(response.data);
        const metadata = {
            lastmod: response.headers['last-modified'] || new Date().toISOString(),
            changefreq: this.getChangeFrequency(url),
            priority: this.getPriority(url),
            title: $('title').text().trim(),
            description:
                $('meta[name="description"]').attr('content') ||
                $('meta[property="og:description"]').attr('content') ||
                '',
            images: [],
            videos: [],
            news: null,
            languages: []
        };

        if (config.sitemap.includeImages) {
            $('img').each((_, element) => {
                const img = {
                    loc: $(element).attr('src'),
                    title: $(element).attr('alt') || ''
                };
                if (img.loc) metadata.images.push(img);
            });
        }

        if (config.sitemap.includeVideos) {
            $('video, [type="video/mp4"], [type="video/webm"]').each((_, element) => {
                const video = {
                    loc: $(element).attr('src') || $(element).find('source').attr('src'),
                    title: $(element).attr('title') || ''
                };
                if (video.loc) metadata.videos.push(video);
            });
        }

        if (config.sitemap.includeNews) {
            const newsMetadata = {
                title: $('meta[property="og:title"]').attr('content') || metadata.title,
                publicationDate: $('meta[property="article:published_time"]').attr('content')
            };
            if (newsMetadata.title) metadata.news = newsMetadata;
        }

        if (config.sitemap.includeHreflang) {
            $('link[rel="alternate"][hreflang]').each((_, element) => {
                metadata.languages.push({
                    lang: $(element).attr('hreflang'),
                    href: $(element).attr('href')
                });
            });
        }

        return metadata;
    }

    getChangeFrequency(url) {
        for (const [pattern, freq] of Object.entries(config.sitemap.customChangefreq)) {
            if (new RegExp(pattern).test(url)) {
                return freq;
            }
        }
        return config.sitemap.defaultChangefreq;
    }

    getPriority(url) {
        for (const [pattern, priority] of Object.entries(this.options.customPriorities)) {
            if (new RegExp(pattern).test(url)) {
                return priority;
            }
        }
        return config.sitemap.defaultPriority;
    }

    async checkBrokenLinks(links) {
        for (const link of links) {
            try {
                const response = await axios.head(link, {
                    timeout: this.options.timeout / 2,
                    validateStatus: null
                });
                if (response.status >= 400) {
                    this.progress.brokenLinks++;
                    this.errors.push({
                        url: link,
                        error: `Broken link (Status: ${response.status})`,
                        code: response.status,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                this.progress.brokenLinks++;
                this.errors.push({
                    url: link,
                    error: 'Broken link (Connection failed)',
                    code: error.code,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    extractLinks($, baseUrl) {
        const links = new Set();
        try {
            $('a').each((_, element) => {
                const href = $(element).attr('href');
                if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                    try {
                        const fullUrl = new URL(href, baseUrl);
                        fullUrl.hash = '';
                        if (!this.options.includeQueryParams) {
                            fullUrl.search = '';
                        }
                        const normalizedUrl = fullUrl.href;

                        if (this.shouldProcessUrl(normalizedUrl, fullUrl)) {
                            links.add(normalizedUrl);
                        }
                    } catch {
                        // skip invalid href
                    }
                }
            });
        } catch (error) {
            console.error('Error extracting links:', error);
        }
        return links;
    }

    handleError(url, error) {
        this.progress.processed++;
        this.progress.failed++;

        this.errors.push({
            url,
            error: error.message,
            code: error.code || error.response?.status,
            timestamp: new Date().toISOString()
        });

        this.emitProgress(url);
        console.error(`Error crawling ${url}:`, error.message);
    }
}

export default new Crawler();
