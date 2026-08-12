const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EventHarbor API is running",
  });
});

app.listen(4000, () => {
  console.log("GadgetSimp API running on port 4000");
});