import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());

/** Health-check endpoint */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

export default app;
