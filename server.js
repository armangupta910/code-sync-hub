import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 10000;
const root = path.join(process.cwd(), "dist");

// Serve static files from dist
app.use(express.static(root, { index: false }));

// Simple health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Fallback to index.html for SPA routes
app.get("*", (req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
