import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import apiRoutes from "./routes/index.js";
import publicRoutes from "./routes/public.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import careplanRoutes from "./routes/careplans.js";

const app = express();

// Security headers (XSS, content-type sniffing, clickjacking, etc.)
app.use(helmet());

// Gzip/Brotli compression for API responses
app.use(compression());

// CORS — lock to known origins in production
const isProduction = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  "https://plan-partner.netlify.app",
  "https://mediimate.in",
  "https://www.mediimate.in",
  "https://mediimate.com",
  "https://www.mediimate.com",
  "https://mediimate.connectifytechnologies.com",
];
if (!isProduction) {
  ALLOWED_ORIGINS.push("http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173");
}
app.use(cors({
  origin: isProduction ? ALLOWED_ORIGINS : true,
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// Production: rate limit API to support 10k+ users without abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 500 : 2000, // 500 req/15min per IP in production
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
});
// Auth (register/login) mounted first so they are always available
app.use("/api", authRoutes);
app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", careplanRoutes);
app.use("/api", apiRoutes);

export default app;
