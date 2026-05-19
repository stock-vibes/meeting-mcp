import { createServer } from 'http';

const PORT = process.env.PORT || 8787;

// Import worker logic inline
const server = createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  let body = null;
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });
  }
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: body || undefined
  });
  const { default: worker } = await import('./src/worker.js');
  const response = await worker.fetch(request, {}, {});
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
});

server.listen(PORT, () => console.log(`Meeting Intelligence MCP running on port ${PORT}`));
