// Frontend origins allowed to call the API with credentials and to frame deployed sites.
export const allowedOrigins = [
  "http://localhost:5173",
  "https://genweb-ai-delta.vercel.app",
  "https://genwebai-dca16.web.app",
  process.env.CLIENT_URL,
].filter(Boolean)
