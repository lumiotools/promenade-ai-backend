import express from "express";
import cors from "cors";

import searchRouter from "./routes/search.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*",
  })
);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  })
});

app.use("/api/search", searchRouter);

export default app;
