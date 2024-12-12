// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import { SitemapStream } from 'sitemap';
// import { URL } from 'url';
// import xmlFormatter from 'xml-formatter';

// // Function to recursively crawl the site and get all internal links
// async function crawlSite(baseUrl, visited = new Set(), stream, maxDepth = 3, currentDepth = 0) {
//     if (visited.has(baseUrl) || currentDepth >= maxDepth) return;
//     visited.add(baseUrl);

//     try {
//         const { data } = await axios.get(baseUrl);
//         const $ = cheerio.load(data);
//         const links = new Set();

//         // Find all links on the current page
//         $('a').each((_, element) => {
//             const href = $(element).attr('href');
//             if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
//                 const fullUrl = new URL(href, baseUrl).href; // Resolves relative URLs
//                 const linkDomain = new URL(fullUrl).hostname;

//                 // Only add internal links (links from the same domain)
//                 if (linkDomain === new URL(baseUrl).hostname) {
//                     links.add(fullUrl);
//                 }
//             }
//         });

//         // Add the current page to the sitemap stream
//         stream.write({ url: baseUrl, changefreq: 'daily', priority: 0.8 });

//         // Recursively crawl all unique links
//         for (const link of links) {
//             await crawlSite(link, visited, stream, maxDepth, currentDepth + 1);
//         }
//     } catch (error) {
//         console.error(`Error crawling ${baseUrl}:`, error.message);
//     }
// }

// // Controller to handle sitemap generation
// export const generateSitemap = async (req, res) => {
//     const { url } = req.query;
//     if (!url) {
//         return res.status(400).send('Please provide a valid URL.');
//     }

//     try {
//         const stream = new SitemapStream({ hostname: url });

//         // Collect the XML data into a string
//         let sitemapXml = '';
//         stream.on('data', (chunk) => {
//             sitemapXml += chunk.toString();
//         });

//         // Start crawling the site
//         await crawlSite(url, new Set(), stream);

//         // End the stream
//         stream.end();

//         // Wait for the stream to finish and then format the XML
//         stream.on('finish', () => {
//             const formattedXml = xmlFormatter(sitemapXml); // Properly formats the XML
//             res.setHeader('Content-Type', 'application/xml');
//             res.send(formattedXml);
//         });
//     } catch (error) {
//         console.error('Error generating sitemap:', error.message);
//         res.status(500).send('An error occurred while generating the sitemap.');
//     }
// };

import axios from 'axios';
import * as cheerio from 'cheerio';
import { SitemapStream } from 'sitemap';
import { URL } from 'url';

// Function to recursively crawl the site and stream XML
async function crawlSiteStream(baseUrl, visited = new Set(), stream, res, maxDepth = 3, currentDepth = 0) {
    if (visited.has(baseUrl) || currentDepth >= maxDepth) return;
    visited.add(baseUrl);

    try {
        const { data } = await axios.get(baseUrl);
        const $ = cheerio.load(data);
        const links = new Set();

        // Find all links on the current page
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
                const fullUrl = new URL(href, baseUrl).href;
                const linkDomain = new URL(fullUrl).hostname;

                // Only add internal links
                if (linkDomain === new URL(baseUrl).hostname) {
                    links.add(fullUrl);
                }
            }
        });

        // Write the current page to the sitemap stream
        stream.write({ url: baseUrl, changefreq: 'daily', priority: 0.8 });

        // Send the formatted XML chunk to the client
        const chunk = `
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>\n`;
        res.write(chunk);

        // Recursively crawl all unique links
        for (const link of links) {
            await crawlSiteStream(link, visited, stream, res, maxDepth, currentDepth + 1);
        }
    } catch (error) {
        console.error(`Error crawling ${baseUrl}:`, error.message);
    }
}

// Controller to stream sitemap generation
export const generateSitemap = async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).send('Please provide a valid URL.');
    }

    try {
        const stream = new SitemapStream({ hostname: url });

        // Set headers for the response
        res.setHeader('Content-Type', 'application/xml');
        res.write(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`);

        // Crawl the site and stream the data
        await crawlSiteStream(url, new Set(), stream, res);

        // End the sitemap
        res.write('</urlset>');
        res.end();
    } catch (error) {
        console.error('Error generating sitemap:', error.message);
        res.status(500).send('An error occurred while generating the sitemap.');
    }
};
