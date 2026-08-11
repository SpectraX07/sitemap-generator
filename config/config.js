export default {
    crawler: {
        maxDepth: parseInt(process.env.MAX_DEPTH || '10', 10),
        maxPages: parseInt(process.env.MAX_PAGES || '0', 10), // 0 = unlimited
        maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3', 10),
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000, // 1 second
        respectRobotsTxt: false,
        allowedContentTypes: ['text/html', 'application/xhtml+xml'],
        userAgent: 'Mozilla/5.0 (compatible; SitemapGenerator/1.0; +https://github.com/SpectraX07/sitemap-generator)',
        ignoreRobotsTxt: false,
        excludePatterns: [], // Array of regex patterns to exclude
        includePatterns: [], // Array of regex patterns to include
        customPriorities: {}, // Map of URL patterns to priorities
        crawlDelay: parseInt(process.env.CRAWL_DELAY || '500', 10), // Milliseconds between request batches
        renderJavaScript: false,
        checkMobileFriendly: false,
        checkBrokenLinks: false,
        followRedirects: true,
        maxRedirects: 5,
        customHeaders: {}, // Custom HTTP headers
        cookies: {}, // Custom cookies
        proxyUrl: '', // Proxy server URL
        httpAuth: {
            username: '',
            password: ''
        }
    },
    sitemap: {
        defaultChangefreq: 'daily',
        defaultPriority: 0.8,
        cacheExpiration: 24 * 60 * 60, // 24 hours in seconds
        supportedFormats: ['xml', 'txt', 'html'],
        compressionEnabled: true,
        includeLastmod: true,
        includeImages: true,
        includeVideos: true,
        includeNews: false,
        includeHreflang: false,
        customChangefreq: {}, // Map of URL patterns to change frequencies
        maxUrlsPerFile: 50000, // Split into multiple sitemaps if exceeded
        validateUrls: true,
        languages: [], // Supported languages for hreflang
        imageOptions: {
            includeLicense: false,
            includeGeolocation: false
        },
        videoOptions: {
            includeThumbnails: true,
            includeDescription: true,
            includeDuration: true
        },
        newsOptions: {
            includeGenres: true,
            includeKeywords: true,
            includePublicationDate: true
        }
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    }
};
