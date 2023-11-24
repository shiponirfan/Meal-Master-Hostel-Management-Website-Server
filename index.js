const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Meal Master Hostel Management Website Server");
});
app.listen(port, () => {
  console.log(
    `Meal Master Hostel Management Website Server Running On Port ${port}`
  );
});
