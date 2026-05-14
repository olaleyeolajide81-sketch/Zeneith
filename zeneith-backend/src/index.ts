import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./routes";
import { startIndexer } from "./indexer";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());
app.use("/", routes);

app.listen(PORT, () => {
  console.log(`[zeneith-backend] Listening on http://localhost:${PORT}`);
  startIndexer();
});
