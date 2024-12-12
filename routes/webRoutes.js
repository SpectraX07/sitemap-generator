// routes/sitemapRoutes.js
import express from 'express';
import { renderSitemapForm } from '../controllers/web/viewsController.js';

const router = express.Router();

// Route to generate sitemap
router.get('/generate-sitemap', renderSitemapForm);

export default router;
