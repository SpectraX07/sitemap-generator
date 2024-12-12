// routes/sitemapRoutes.js
import express from 'express';
import apiRoutes from './apiRoutes.js';
import webRoutes from './webRoutes.js';

const router = express.Router();

// Route to generate sitemap
router.get('/api', apiRoutes);
router.get('/web', webRoutes);

export default router;