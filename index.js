const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

// JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    // All Collection
    const mealCollection = client.db("mealMasterDB").collection("meals");
    const userCollection = client.db("mealMasterDB").collection("users");
    const paymentCollection = client
      .db("mealMasterDB")
      .collection("payments-history");
    const requestedCollection = client
      .db("mealMasterDB")
      .collection("requested-meals");
    const membershipCollection = client
      .db("mealMasterDB")
      .collection("membership");

    // JWT Token Create
    app.post("/api/v1/auth/access-token", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_KEY, {
        expiresIn: "1day",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });
    // JWT Token Cancel
    app.post("/api/v1/auth/access-cancel", async (req, res) => {
      const user = req.body;
      res.clearCookie("token", { maxAge: 0 }).send({ logout: true });
    });

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

    // Get Single Meal
    app.get("/api/v1/meal/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await mealCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/meal/:id", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Get Membership Price
    app.get("/api/v1/membership", async (req, res) => {
      try {
        const result = await membershipCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/membership:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Get User With User Role
    app.get("/api/v1/auth/user/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const query = { userEmail: email };
        const option = { projection: { _id: 0, userRole: 1, userBadge: 1 } };
        const user = await userCollection.findOne(query, option);
        res.send(user);
      } catch (error) {
        console.error("Error in /api/v1/auth/users/email:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Add User With User Role
    app.post("/api/v1/auth/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { userEmail: user.userEmail };
        const userExists = await userCollection.findOne(query);
        if (userExists) {
          return res.send({ message: "user already exists", insertedId: null });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/membership:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Post Request Meal
    app.post("/api/v1/requested-meal", verifyToken, async (req, res) => {
      try {
        const query = req.body;
        const result = await requestedCollection.insertOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/requested-meal:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Get Request Meal
    app.get(
      "/api/v1/auth/requested-meal/:email",
      verifyToken,
      async (req, res) => {
        try {
          const email = req.params.email;
          if (email !== req.decoded.email) {
            return res.status(403).send({ message: "forbidden access" });
          }
          const query = { userEmail: email };
          const result = await requestedCollection.find(query).toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/auth/requested-meal/email:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Update Meal Like Count
    app.post("/api/v1/meal/like-update/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateLike = {
          $inc: {
            likes: 1,
          },
        };
        const result = await mealCollection.updateOne(query, updateLike);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/meal/like-update:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Update User Badge
    app.post("/api/v1/auth/user/:email", verifyToken, async (req, res) => {
      try {
        const { badge } = req.body;
        console.log("User badge", badge);
        const email = req.params.email;
        const query = { userEmail: email };
        const updateBadge = {
          $set: {
            userBadge: badge,
          },
        };
        const result = await userCollection.updateOne(query, updateBadge);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/auth/user:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Create Stripe Payment Intent
    app.post(
      "/api/v1/auth/create-payment-intent",
      verifyToken,
      async (req, res) => {
        try {
          const { price } = req.body;
          const amount = parseInt(price * 100);
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ["card"],
          });
          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        } catch (error) {
          console.error("Error in /api/v1/auth/create-payment-intent:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Save Stripe Payment History
    app.post("/api/v1/auth/payments-history", verifyToken, async (req, res) => {
      try {
        const query = req.body;
        const result = await paymentCollection.insertOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/auth/payments-history:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Get Payment History
    app.get(
      "/api/v1/auth/payments-history/:email",
      verifyToken,
      async (req, res) => {
        try {
          const email = req.params.email;
          if (email !== req.decoded.email) {
            return res.status(403).send({ message: "forbidden access" });
          }
          const query = { email: email };
          const result = await paymentCollection.find(query).toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/auth/payments-history/email:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

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
