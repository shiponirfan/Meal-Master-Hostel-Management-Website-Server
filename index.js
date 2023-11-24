const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-ujyuzy1-shard-00-00.pzomx9u.mongodb.net:27017,ac-ujyuzy1-shard-00-01.pzomx9u.mongodb.net:27017,ac-ujyuzy1-shard-00-02.pzomx9u.mongodb.net:27017/?ssl=true&replicaSet=atlas-lf5h1l-shard-0&authSource=admin&retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    // All Collection
    const mealCollection = client.db("mealMasterDB").collection("meals");

    // All Meals
    app.get("/api/v1/meals", async (req, res) => {
      try {
        let query = {};

        // Filter By Meal Type
        const mealType = req.query.mealType;
        if (mealType) {
          query.mealType = mealType;
        }

        // Search field
        const mealTitle = req.query.mealTitle;
        if (mealTitle) {
          query.mealTitle = { $regex: mealTitle, $options: "i" };
        }

        // Sort By Price
        const sort = req.query.sort;
        const sortValue = {};
        if (sort) {
          sortValue.price = sort;
        }

        // Pagination Options
        const pages = parseInt(req.query.pages);
        const limit = parseInt(req.query.limit);
        const skip = (pages - 1) * limit;

        const result = await mealCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort(sortValue)
          .toArray();

        res.send({ result });
      } catch (error) {
        console.error("Error in /api/v1/meals:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Meal Master Hostel Management Website Server");
});
app.listen(port, () => {
  console.log(
    `Meal Master Hostel Management Website Server Running On Port ${port}`
  );
});
