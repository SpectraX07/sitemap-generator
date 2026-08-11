import express from 'express';
import {
    generateSitemap,
    formatLastResult,
    crawlProgress,
    cancelCrawl,
    getSitePreview,
    getLastCrawlResult
} from '../controllers/api/sitemapController.js';

const router = express.Router();

router.get('/sitemap', generateSitemap);
router.get('/sitemap/progress', crawlProgress);
router.post('/sitemap/cancel', cancelCrawl);
router.get('/sitemap/preview', getSitePreview);
router.get('/sitemap/result', getLastCrawlResult);
router.get('/sitemap/format', formatLastResult);

export default router;
