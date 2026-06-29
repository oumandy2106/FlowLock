import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import routes from "./routes.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(routes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(port, () => {
  console.log(`FlowLock backend running on http://localhost:${port}`);
});
