export function errorHandler(err, req, res, _next) {
  console.error("API Error:", err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}
