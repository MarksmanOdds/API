import express from "express";
import cors from "cors";
import mongoose, { connect } from "mongoose";
import EventModel from "./Models/Event.js";

const CONNECTION_STRING =
  "mongodb+srv://lukedasios:lukedasios@cluster0.yck0xr9.mongodb.net/?retryWrites=true&w=majority";

async function connectToMongoDB() {
  await mongoose.connect(CONNECTION_STRING);
}

async function closeMongoDBConnection() {
  await mongoose.connection.close();
}

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(cors());

app.get("/odds/:league/:sportsbooks/:market", async (req, res) => {
  const { league, sportsbooks, market } = req.params;
  if (market !== "moneyline") {
    return res
      .status(400)
      .send("This endpoint currently supports only 'moneyline' market.");
  }

  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    // Start building the aggregation pipeline
    const pipeline = [
      {
        $match: {
          league: league,
          sportsbook: { $in: sportsbookArray },
          $or: [
            { t1_moneyline: { $ne: null } },
            { t2_moneyline: { $ne: null } },
          ],
        },
      },
      {
        $sort: { created_at: -1 },
      },
      {
        $group: {
          _id: {
            t1_name: "$t1_name",
            t2_name: "$t2_name",
            sportsbook: "$sportsbook",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $group: {
          _id: { t1_name: "$doc.t1_name", t2_name: "$doc.t2_name" },
          moneylines: {
            $push: {
              sportsbook: "$doc.sportsbook",
              t1_moneyline: "$doc.t1_moneyline",
              t2_moneyline: "$doc.t2_moneyline",
            },
          },
        },
      },
      {
        $unwind: "$moneylines",
      },
      {
        $sort: { "moneylines.sportsbook": 1 },
      },
      {
        $group: {
          _id: "$_id",
          moneylines: { $push: "$moneylines" },
          avg_t1_moneyline: { $first: "$avg_t1_moneyline" },
          avg_t2_moneyline: { $first: "$avg_t2_moneyline" },
          best_t1_moneyline: { $first: "$best_t1_moneyline" },
          best_t2_moneyline: { $first: "$best_t2_moneyline" },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          moneylines: 1,
          avg_t1_moneyline: {
            $round: [{ $avg: "$moneylines.t1_moneyline" }, 2],
          },
          avg_t2_moneyline: {
            $round: [{ $avg: "$moneylines.t2_moneyline" }, 2],
          },
          best_t1_moneyline: { $max: "$moneylines.t1_moneyline" },
          best_t2_moneyline: { $max: "$moneylines.t2_moneyline" },
          best_t1_moneyline_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$moneylines",
                  as: "line",
                  cond: {
                    $eq: [
                      "$$line.t1_moneyline",
                      { $max: "$moneylines.t1_moneyline" },
                    ],
                  },
                },
              },
              as: "line",
              in: "$$line.sportsbook",
            },
          },
          best_t2_moneyline_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$moneylines",
                  as: "line",
                  cond: {
                    $eq: [
                      "$$line.t2_moneyline",
                      { $max: "$moneylines.t2_moneyline" },
                    ],
                  },
                },
              },
              as: "line",
              in: "$$line.sportsbook",
            },
          },
        },
      },
      {
        $sort: { t1_name: 1, t2_name: 1 }, // Sorting alphabetically by team names
      },
    ];

    // Execute the aggregation pipeline
    const events = await EventModel.aggregate(pipeline);

    await closeMongoDBConnection();

    // Send the results
    res.json(events);
  } catch (error) {
    console.error("Failed to fetch moneyline odds with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
