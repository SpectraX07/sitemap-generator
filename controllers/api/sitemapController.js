import { SitemapStream, streamToPromise } from 'sitemap';
import { createGzip } from 'zlib';
import { promisify } from 'util';
import { URL } from 'url';
import config from '../../config/config.js';
import crawler from '../../utils/crawler.js';
import cache from '../../utils/cache.js';
import { normalizeUrl } from '../../utils/urlNormalize.js';
import xmlFormatter from 'xml-formatter';

const gzip = promisify(createGzip);

let lastCrawlResult = null;

const sendSitemapResponse = async (res, urls, metadata, format, compress = false) => {
    const sitemap = await formatSitemap(urls, metadata, format, compress);
    const contentTypes = { xml: 'application/xml', txt: 'text/plain', html: 'text/html' };
    res.setHeader('Content-Type', contentTypes[format]);
    if (compress && sitemap.type === 'single') {
        res.setHeader('Content-Encoding', 'gzip');
    }
    return res.send(sitemap.type === 'index' ? sitemap.index : sitemap.content);
};

const parseBool = (value, defaultValue) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return defaultValue;
};

const formatSitemap = async (urls, metadata, format, compress = false) => {
    if (!urls || urls.length === 0) {
        throw new Error('No URLs found to generate sitemap');
    }

    switch (format) {
        case 'xml': {
            const urlChunks = [];
            for (let i = 0; i < urls.length; i += config.sitemap.maxUrlsPerFile) {
                urlChunks.push(urls.slice(i, i + config.sitemap.maxUrlsPerFile));
            }

            const sitemaps = await Promise.all(
                urlChunks.map(async (chunk, index) => {
                    const stream = new SitemapStream({ hostname: new URL(urls[0]).origin });

                    for (const url of chunk) {
                        const urlMetadata = metadata[url] || {};
                        const urlEntry = {
                            url,
                            changefreq: urlMetadata.changefreq,
                            priority: urlMetadata.priority,
                            ...(config.sitemap.includeLastmod && urlMetadata.lastmod && { lastmod: urlMetadata.lastmod })
                        };

                        if (config.sitemap.includeImages && urlMetadata.images?.length > 0) {
                            urlEntry.img = urlMetadata.images.map(img => ({
                                url: img.loc,
                                caption: img.title
                            }));
                        }

                        stream.write(urlEntry);
                    }
                    stream.end();

                    let sitemap = await streamToPromise(stream);
                    sitemap = xmlFormatter(sitemap.toString(), {
                        indentation: '  ',
                        collapseContent: true
                    });

                    return {
                        filename: `sitemap${urlChunks.length > 1 ? `-${index + 1}` : ''}.xml`,
                        content: sitemap
                    };
                })
            );

            if (sitemaps.length > 1) {
                const indexStream = new SitemapStream({ hostname: new URL(urls[0]).origin });
                const now = new Date().toISOString();

                for (const sitemap of sitemaps) {
                    indexStream.write({
                        url: `${new URL(urls[0]).origin}/sitemaps/${sitemap.filename}`,
                        lastmod: now
                    });
                }
                indexStream.end();

                let indexContent = await streamToPromise(indexStream);
                indexContent = xmlFormatter(indexContent.toString(), {
                    indentation: '  ',
                    collapseContent: true
                });

                if (compress) {
                    return { type: 'index', sitemaps, index: await gzip(indexContent) };
                }
                return { type: 'index', sitemaps, index: indexContent };
            }

            if (compress) {
                return { type: 'single', content: await gzip(sitemaps[0].content) };
            }
            return { type: 'single', content: sitemaps[0].content };
        }
        case 'txt':
            return { type: 'single', content: urls.join('\n') };
        case 'html': {
            const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sitemap - ${urls.length} pages</title>
    <style>
        body { font-family: Inter, system-ui, sans-serif; margin: 40px; color: #1e293b; background: #f8fafc; }
        h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
        .stats { color: #64748b; margin-bottom: 2rem; }
        .url-list { list-style: none; padding: 0; }
        .url-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
        .url-link { color: #2563eb; text-decoration: none; font-weight: 500; }
        .url-link:hover { text-decoration: underline; }
        .meta { color: #64748b; font-size: 0.875rem; margin-top: 4px; }
    </style>
</head>
<body>
    <h1>Visual Sitemap</h1>
    <p class="stats">${urls.length} pages · Updated ${new Date().toLocaleString()}</p>
    <ul class="url-list">
        ${urls
                    .map(url => {
                        const m = metadata[url] || {};
                        return `<li class="url-item">
            <a href="${url}" class="url-link">${url}</a>
            ${m.title ? `<div class="meta">${m.title}</div>` : ''}
        </li>`;
                    })
                    .join('')}
    </ul>
</body>
</html>`;
            return { type: 'single', content: template };
        }
        default:
            throw new Error('Unsupported format');
    }
};

export const crawlProgress = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = (progress) => send({ type: 'progress', ...progress });
    const onComplete = (result) => {
        lastCrawlResult = result;
        send({ type: 'complete', stats: result.stats, urlCount: result.urls.length });
    };

    crawler.on('progress', onProgress);
    crawler.on('complete', onComplete);

    if (crawler.progress) {
        send({ type: 'progress', ...crawler.progress, phase: 'crawling' });
    }

    req.on('close', () => {
        crawler.off('progress', onProgress);
        crawler.off('complete', onComplete);
    });
};

export const cancelCrawl = (_req, res) => {
    crawler.cancel();
    res.json({ success: true, message: 'Crawl cancelled' });
};

export const getSitePreview = async (req, res) => {
    try {
        const { url } = req.query;
        const normalized = normalizeUrl(url);
        if (!normalized) {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        const parsed = new URL(normalized);

        res.json({
            domain: parsed.hostname,
            favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
            url: parsed.origin
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const generateSitemap = async (req, res) => {
    try {
        const {
            url,
            format = 'xml',
            nocache = false,
            compress = false,
            ignoreRobots,
            maxDepth,
            includeImages = true,
            includeVideos = true,
            includeNews = false,
            includeHreflang = false,
            checkBrokenLinks = false,
            renderJavaScript = false,
            customHeaders,
            crawlDelay
        } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'Please provide a URL' });
        }

        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) {
            return res.status(400).json({
                error: 'Invalid URL format',
                details: 'Enter a domain like example.com or a full URL like https://example.com'
            });
        }
        if (!config.sitemap.supportedFormats.includes(format)) {
            return res.status(400).json({ error: 'Unsupported format' });
        }

        const ignoreRobotsTxt = parseBool(ignoreRobots, config.crawler.ignoreRobotsTxt);

        if (!nocache) {
            const cached = cache.get(normalizedUrl, {
                format,
                compress,
                ignoreRobots: ignoreRobotsTxt,
                maxDepth,
                includeImages,
                includeVideos,
                includeNews,
                includeHreflang
            });
            if (cached) {
                const contentTypes = { xml: 'application/xml', txt: 'text/plain', html: 'text/html' };
                res.setHeader('Content-Type', contentTypes[format]);
                if (compress) res.setHeader('Content-Encoding', 'gzip');
                return res.send(cached);
            }
        }

        const crawlerOptions = {
            ignoreRobotsTxt,
            maxDepth: maxDepth ? parseInt(maxDepth, 10) : config.crawler.maxDepth,
            renderJavaScript: parseBool(renderJavaScript, false),
            checkBrokenLinks: parseBool(checkBrokenLinks, false),
            customHeaders: customHeaders ? JSON.parse(customHeaders) : {},
            crawlDelay: crawlDelay ? parseInt(crawlDelay, 10) : config.crawler.crawlDelay
        };

        config.sitemap.includeImages = parseBool(includeImages, true);
        config.sitemap.includeVideos = parseBool(includeVideos, true);
        config.sitemap.includeNews = parseBool(includeNews, false);
        config.sitemap.includeHreflang = parseBool(includeHreflang, false);

        console.log(`Starting crawl for ${normalizedUrl} with options:`, crawlerOptions);
        const result = await crawler.crawl(normalizedUrl, crawlerOptions);
        lastCrawlResult = result;
        console.log('Crawl completed:', result.stats);

        if (!result.urls || result.urls.length === 0) {
            return res.status(404).json({
                error: 'No URLs found',
                details: 'The crawler could not find any valid URLs on the website. Try enabling "Ignore robots.txt" if the site blocks crawlers.'
            });
        }

        if (!nocache) {
            const sitemap = await formatSitemap(result.urls, result.metadata, format, parseBool(compress, false));
            cache.set(normalizedUrl, sitemap.type === 'single' ? sitemap.content : sitemap.index, {
                format,
                compress,
                ignoreRobots: ignoreRobotsTxt,
                maxDepth,
                includeImages,
                includeVideos,
                includeNews,
                includeHreflang
            });
        }

        return sendSitemapResponse(
            res,
            result.urls,
            result.metadata,
            format,
            parseBool(compress, false)
        );
    } catch (error) {
        console.error('Error generating sitemap:', error);
        return res.status(500).json({
            error: 'An error occurred while generating the sitemap',
            details: error.message
        });
    }
};

export const getLastCrawlResult = (_req, res) => {
    if (!lastCrawlResult) {
        return res.status(404).json({ error: 'No crawl result available' });
    }
    res.json({
        urlCount: lastCrawlResult.urls.length,
        stats: lastCrawlResult.stats,
        urls: lastCrawlResult.urls,
        metadata: lastCrawlResult.metadata
    });
};

export const formatLastResult = async (req, res) => {
    try {
        const { format = 'xml', compress = false } = req.query;

        if (!lastCrawlResult?.urls?.length) {
            return res.status(404).json({
                error: 'No crawl result available',
                details: 'Run a crawl first before switching output format.'
            });
        }

        if (!config.sitemap.supportedFormats.includes(format)) {
            return res.status(400).json({ error: 'Unsupported format' });
        }

        return sendSitemapResponse(
            res,
            lastCrawlResult.urls,
            lastCrawlResult.metadata,
            format,
            parseBool(compress, false)
        );
    } catch (error) {
        console.error('Error formatting sitemap:', error);
        return res.status(500).json({
            error: 'An error occurred while formatting the sitemap',
            details: error.message
        });
    }
};
