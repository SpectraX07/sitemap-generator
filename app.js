// app.js
import express from 'express';
import dotenv from 'dotenv';
import manageRoutes from './routes/manageRoutes.js';
import webRoutes from './routes/webRoutes.js';
import apiRoutes from './routes/apiRoutes.js';

dotenv.config();

const app = express();

// Use the sitemap routes
// app.use('/', manageRoutes);
app.use('/web', webRoutes);
app.use('/api', apiRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});
