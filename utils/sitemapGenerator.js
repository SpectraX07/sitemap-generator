import axios from 'axios';
import * as cheerio from 'cheerio';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import xmlFormatter from 'xml-formatter';
import { URL } from 'url';

class SitemapGenerator {
    constructor(baseUrl) {
        this.baseUrl = new URL(baseUrl);
        this.visitedUrls = new Set();
        this.sitemapUrls = new Set();
        this.maxUrls = 50000; // Maximum number of URLs in sitemap
        this.axiosInstance = axios.create({
            timeout: 30000, // 30 seconds
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Consider only 2xx and 3xx as success
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        });
        console.log(`Initialized sitemap generator for: ${this.baseUrl.href}`);
    }

    isValidUrl(url) {
        try {
            const parsedUrl = new URL(url);
            const isValid = parsedUrl.hostname === this.baseUrl.hostname;
            console.log(`Checking URL validity: ${url} -> ${isValid}`);
            return isValid;
        } catch (error) {
            console.error(`Invalid URL format: ${url}`);
            return false;
        }
    }

    normalizeUrl(url) {
        try {
            // Handle hash fragments and query parameters
            const parsedUrl = new URL(url);
            // Remove hash fragments
            parsedUrl.hash = '';
            // Keep query parameters as they might be important for some pages
            const normalized = parsedUrl.href.replace(/\/$/, '');
            console.log(`Normalized URL: ${url} -> ${normalized}`);
            return normalized;
        } catch (error) {
            console.error(`Error normalizing URL ${url}:`, error.message);
            return url;
        }
    }

    async testUrl(url) {
        console.log(`Testing URL accessibility: ${url}`);
        try {
            const response = await this.axiosInstance.get(url, {
                timeout: 10000 // 10 second timeout for testing
            });
            const contentType = response.headers['content-type'] || '';
            const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
            const isAccessible = response.status >= 200 && response.status < 400 && isHtml;
            console.log(`URL ${url} accessibility: ${isAccessible} (status: ${response.status}, content-type: ${contentType})`);
            return isAccessible;
        } catch (error) {
            console.error(`Error testing URL ${url}:`, error.message);
            return false;
        }
    }

    async crawlPage(url, depth = 0) {
        if (depth > 10) { // Limit crawl depth
            console.log(`Maximum depth reached for ${url}`);
            return;
        }

        if (this.sitemapUrls.size >= this.maxUrls) {
            console.log('Maximum URL limit reached');
            return;
        }
        
        try {
            console.log(`\nCrawling: ${url} (depth: ${depth})`);
            
            // Test URL accessibility
            if (!await this.testUrl(url)) {
                console.warn(`URL not accessible: ${url}`);
                return;
            }
            
            const response = await this.axiosInstance.get(url);
            
            if (!response.data) {
                console.warn(`No data received from ${url}`);
                return;
            }

            const $ = cheerio.load(response.data);
            
            // Add current URL to sitemap
            const normalizedUrl = this.normalizeUrl(url);
            if (!this.sitemapUrls.has(normalizedUrl)) {
                this.sitemapUrls.add(normalizedUrl);
                console.log(`Added to sitemap: ${normalizedUrl}`);
            }
            
            // Find all links on the page
            const links = $('a[href]')
                .map((_, element) => {
                    const href = $(element).attr('href');
                    // Skip empty hrefs and javascript: links
                    if (!href || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) {
                        return null;
                    }
                    return href;
                })
                .get()
                .filter(link => link !== null);
            
            console.log(`Found ${links.length} links on ${url}`);
            
            // Process each link
            for (const link of links) {
                try {
                    let absoluteUrl;
                    
                    // Handle relative URLs
                    if (link.startsWith('/')) {
                        absoluteUrl = new URL(link, url).href;
                        console.log(`Converted relative URL: ${link} -> ${absoluteUrl}`);
                    } else if (link.startsWith('http')) {
                        absoluteUrl = link;
                    } else if (!link.includes(':')) {
                        // Handle relative URLs without leading slash
                        absoluteUrl = new URL(link, url).href;
                        console.log(`Converted relative URL: ${link} -> ${absoluteUrl}`);
                    } else {
                        console.log(`Skipping invalid link: ${link}`);
                        continue;
                    }
                    
                    // Normalize URL
                    absoluteUrl = this.normalizeUrl(absoluteUrl);
                    
                    // Check if URL is valid and hasn't been visited
                    if (this.isValidUrl(absoluteUrl) && !this.visitedUrls.has(absoluteUrl)) {
                        this.visitedUrls.add(absoluteUrl);
                        console.log(`Added to visited URLs: ${absoluteUrl}`);
                        // Add a small delay to avoid overwhelming the server
                        await new Promise(resolve => setTimeout(resolve, 200));
                        await this.crawlPage(absoluteUrl, depth + 1);
                    } else {
                        console.log(`Skipping URL (invalid or already visited): ${absoluteUrl}`);
                    }
                } catch (error) {
                    console.error(`Error processing link ${link}:`, error.message);
                }
            }
        } catch (error) {
            console.error(`Error crawling ${url}:`, error.message);
        }
    }

    async generateSitemap() {
        try {
            console.log(`\nStarting sitemap generation for ${this.baseUrl.href}`);
            
            // Start crawling from the base URL
            await this.crawlPage(this.baseUrl.href);
            
            if (this.sitemapUrls.size === 0) {
                console.error('No valid URLs found to include in sitemap');
                throw new Error('No valid URLs found to include in sitemap');
            }
            
            console.log(`\nFound ${this.sitemapUrls.size} URLs for sitemap:`);
            for (const url of this.sitemapUrls) {
                console.log(`- ${url}`);
            }
            
            // Create sitemap stream
            const smStream = new SitemapStream({ hostname: this.baseUrl.href });
            
            // Create a promise to handle the stream
            const sitemap = await new Promise((resolve, reject) => {
                const chunks = [];
                
                // Handle stream events
                smStream.on('data', chunk => chunks.push(chunk));
                smStream.on('error', reject);
                smStream.on('end', () => resolve(Buffer.concat(chunks).toString()));
                
                // Add URLs to sitemap
                for (const url of this.sitemapUrls) {
                    smStream.write({ 
                        url,
                        changefreq: 'daily',
                        priority: url === this.baseUrl.href ? 1.0 : 0.7,
                        lastmod: new Date().toISOString()
                    });
                }
                
                smStream.end();
            });
            
            // Format XML for better readability
            const formattedXml = xmlFormatter(sitemap, {
                indentation: '  ',
                collapseContent: true,
            });
            
            console.log('\nSitemap generation completed successfully');
            return formattedXml;
        } catch (error) {
            console.error('Error generating sitemap:', error);
            throw error;
        }
    }
}

export default SitemapGenerator; 