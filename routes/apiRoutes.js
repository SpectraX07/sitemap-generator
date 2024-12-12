// routes/sitemapRoutes.js
import express from 'express';
import { generateSitemap } from '../controllers/api/sitemapController.js';

const router = express.Router();

// Route to generate sitemap
router.get('/generate-sitemap', generateSitemap);

export default router;
