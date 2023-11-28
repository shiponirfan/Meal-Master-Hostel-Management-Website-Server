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
    const reviewCollection = client.db("mealMasterDB").collection("reviews");
    const upcomingMealCollection = client
      .db("mealMasterDB")
      .collection("upcoming-meals");
    const paymentCollection = client
      .db("mealMasterDB")
      .collection("payments-history");
    const requestedCollection = client
      .db("mealMasterDB")
      .collection("requested-meals");
    const membershipCollection = client
      .db("mealMasterDB")
      .collection("membership");

    // Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { userEmail: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.userRole === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

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

        const totalItemsCount = await mealCollection.countDocuments(query);
        const totalPagesCount = Math.ceil(totalItemsCount / limit);

        res.send({ result, totalPagesCount });
      } catch (error) {
        console.error("Error in /api/v1/meals:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // All Upcoming Meals
    app.get("/api/v1/upcoming-meals", async (req, res) => {
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
          sortValue.likes = sort;
        }

        // Pagination Options
        const pages = parseInt(req.query.pages);
        const limit = parseInt(req.query.limit);
        const skip = (pages - 1) * limit;

        const result = await upcomingMealCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort(sortValue)
          .toArray();

        // Total Number Of Pages
        const totalItemsCount = await upcomingMealCollection.countDocuments(
          query
        );
        const totalPagesCount = Math.ceil(totalItemsCount / limit);

        res.send({ result, totalPagesCount });
      } catch (error) {
        console.error("Error in /api/v1/upcoming-meals:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Add Meal
    app.post("/api/v1/meal", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const query = req.body;
        const result = await mealCollection.insertOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/meal", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    // Publish Upcoming Meal
    app.post(
      "/api/v1/upcoming-meal-publish/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const findMeal = { _id: new ObjectId(id) };
          const getMeal = await upcomingMealCollection.findOne(findMeal);
          const insertToAllMeals = await mealCollection.insertOne(getMeal);

          if (insertToAllMeals.insertedId) {
            const deleteMeal = await upcomingMealCollection.deleteOne(findMeal);
            if (deleteMeal.deletedCount > 0) {
              res.send(deleteMeal);
            }
          }
        } catch (error) {
          console.error("Error in /api/v1/upcoming-meal", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Upcoming Meal
    app.post(
      "/api/v1/upcoming-meal",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const query = req.body;
          const result = await upcomingMealCollection.insertOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/upcoming-meal", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

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

    // Get All User With User Role
    app.get(
      "/api/v1/auth/users",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          let query = {};

          const searchQuery = req.query.searchQuery;
          if (searchQuery) {
            query.$or = [
              { userName: { $regex: new RegExp(searchQuery, "i") } },
              { userEmail: { $regex: new RegExp(searchQuery, "i") } },
            ];
          }

          // Pagination
          const pages = parseInt(req.query.pages);
          const limit = parseInt(req.query.limit);
          const skip = (pages - 1) * limit;

          const result = await userCollection
            .find(query)
            .skip(skip)
            .limit(limit)
            .toArray();

          const totalItemsCount = await userCollection.countDocuments(query);
          const totalPagesCount = Math.ceil(totalItemsCount / limit);

          res.send({ result, totalPagesCount });
        } catch (error) {
          console.error("Error in /api/v1/auth/users:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Users Make Admin
    app.patch(
      "/api/v1/auth/make-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: {
              userRole: "Admin",
            },
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1//auth/make-admin/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

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

    // Get Reviews
    app.get("/api/v1/reviews", async (req, res) => {
      try {
        let review = {};
        const email = req.query.email;
        if (email) {
          review = { reviewerEmail: email };
        }

        // Pagination
        const pages = parseInt(req.query.pages);
        const limit = parseInt(req.query.limit);
        const skip = (pages - 1) * limit;

        const sortByRating = req.query.sortByRating;
        const sortByLikes = req.query.sortByLikes;
        const sortValue = {};
        if (sortByRating) {
          sortValue.reviewRating = sortByRating;
        }
        if (sortByLikes) {
          sortValue.reviewLikes = sortByLikes;
        }

        const result = await reviewCollection
          .find(review)
          .skip(skip)
          .limit(limit)
          .sort(sortValue)
          .toArray();

        const totalItemsCount = await reviewCollection.countDocuments(review);
        const totalPagesCount = Math.ceil(totalItemsCount / limit);

        res.send({ result, totalPagesCount });
      } catch (error) {
        console.error("Error in /api/v1/reviews:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Post Reviews
    app.post("/api/v1/reviews", verifyToken, async (req, res) => {
      try {
        const query = req.body;
        const result = await reviewCollection.insertOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/reviews:", error);
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

    // Update Review
    app.patch("/api/v1/updated-review/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const review = req.body;
        const updateReview = {
          $set: {
            reviewDetails: review.reviewDetails,
            reviewRating: review.reviewRating,
          },
        };
        const result = await reviewCollection.updateOne(query, updateReview);
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/updated-review/id:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    // Update Meal
    app.patch(
      "/api/v1/update-meal/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const meal = req.body;
          const updateMeal = {
            $set: meal,
          };
          const result = await mealCollection.updateOne(query, updateMeal);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/meal/update-meal/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Get Request Meal
    app.get("/api/v1/auth/requested-meal", verifyToken, async (req, res) => {
      try {
        let userEmail = {};
        const email = req.query.email;
        const searchQuery = req.query.search;

        if (email) {
          if (email !== req.decoded.email) {
            return res.status(403).send({ message: "forbidden access" });
          }
          userEmail = { userEmail: email };
        } else {
          const decodedEmail = req.decoded.email;
          const adminQuery = { userEmail: decodedEmail };
          const user = await userCollection.findOne(adminQuery);
          const isAdmin = user?.userRole === "Admin";
          if (!isAdmin) {
            return res.status(403).send({ message: "forbidden access" });
          }
        }

        if (searchQuery) {
          userEmail = {
            $or: [
              { userName: { $regex: new RegExp(searchQuery, "i") } },
              { userEmail: { $regex: new RegExp(searchQuery, "i") } },
            ],
          };
        }

        const userResult = await requestedCollection.find(userEmail).toArray();

        const mealId = userResult.map((id) => new ObjectId(id.mealId));
        const mealQuery = { _id: { $in: mealId } };

        const options = {
          projection: { _id: 1, mealTitle: 1, likes: 1, reviews: 1 },
        };
        const getMeal = await mealCollection.find(mealQuery, options).toArray();

        const requestedMealStatusMap = {};
        userResult.forEach((item) => {
          const mealIdString = item.mealId.toString();
          if (!requestedMealStatusMap[mealIdString]) {
            requestedMealStatusMap[mealIdString] = [];
          }
          requestedMealStatusMap[mealIdString].push({
            requestedMealId: item._id,
            status: item.status,
            userName: item.userName,
            userEmail: item.userEmail,
          });
        });

        const result = [];
        getMeal.forEach((meal) => {
          const mealIdString = meal._id.toString();
          const requestedMealStatusArray =
            requestedMealStatusMap[mealIdString] || [];

          requestedMealStatusArray.sort((a, b) => {
            const customOrder = { Pending: 0, Delivered: 1 };
            return customOrder[a.status] - customOrder[b.status];
          });

          requestedMealStatusArray.forEach((requestedMealStatus) => {
            result.push({ ...meal, requestedMealStatus });
          });
        });
        result.sort((a, b) => {
          const customOrder = { Pending: 0, Delivered: 1 };
          return (
            customOrder[a.requestedMealStatus.status] -
            customOrder[b.requestedMealStatus.status]
          );
        });

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;
        const paginatedResult = result.slice(skip, skip + perPage);
        res.send({
          totalItems: result.length,
          totalPages: Math.ceil(result.length / perPage),
          currentPage: page,
          perPage: perPage,
          data: paginatedResult,
        });
      } catch (error) {
        console.error("Error in /api/v1/auth/requested-meal/email:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Serve Meal Status Update
    app.post(
      "/api/v1/meal-serve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: {
              status: "Delivered",
            },
          };
          const result = await requestedCollection.updateOne(query, updateDoc);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/meal-serve/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Delete Request Meal
    app.delete(
      "/api/v1/auth/requested-meal/:id",
      verifyToken,
      async (req, res) => {
        try {
          const email = req.query.email;
          if (email !== req.decoded.email) {
            return res.status(403).send({ message: "forbidden access" });
          }
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await requestedCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/auth/requested-meal/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Delete Review
    app.delete(
      "/api/v1/auth/review-delete/:id",
      verifyToken,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await reviewCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/auth/review-delete/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Delete Meal
    app.delete(
      "/api/v1/meal/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await mealCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/meal/id:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Update Meal Review Count
    app.post(
      "/api/v1/meal/meal-review-update/:id",
      verifyToken,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const updateReview = {
            $inc: {
              reviews: 1,
            },
          };
          const result = await mealCollection.updateOne(query, updateReview);
          res.send(result);
        } catch (error) {
          console.error("Error in /api/v1/meal/meal-review-update:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

    // Update Review Like Count
    app.post("/api/v1/review-like-update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateReviewLike = {
          $inc: {
            reviewLikes: 1,
          },
        };
        const result = await reviewCollection.updateOne(
          query,
          updateReviewLike
        );
        res.send(result);
      } catch (error) {
        console.error("Error in /api/v1/review-like-update:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

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
