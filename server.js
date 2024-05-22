import express from "express";
import cors from "cors";
import mongoose from "mongoose";
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

app.get("/moneyline/:league/:sportsbooks", async (req, res) => {
  const { league, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

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
        $lookup: {
          from: "upcomings",
          localField: "league",
          foreignField: "league",
          as: "upcomingDetails",
        },
      },
      {
        $unwind: {
          path: "$upcomingDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            t1_name: "$t1_name",
            t2_name: "$t2_name",
            sportsbook: "$sportsbook",
          },
          doc: { $first: "$$ROOT" },
          date: { $first: "$upcomingDetails.date" },
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
          date: { $first: "$date" },
        },
      },
      {
        $addFields: {
          avg_t1_moneyline: {
            $round: [{ $avg: "$moneylines.t1_moneyline" }, 2],
          },
          avg_t2_moneyline: {
            $round: [{ $avg: "$moneylines.t2_moneyline" }, 2],
          },
          best_t1_moneyline: { $max: "$moneylines.t1_moneyline" },
          best_t2_moneyline: { $max: "$moneylines.t2_moneyline" },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          moneylines: 1,
          date: 1,
          avg_t1_moneyline: 1,
          avg_t2_moneyline: 1,
          best_t1_moneyline: 1,
          best_t2_moneyline: 1,
          best_t1_moneyline_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$moneylines",
                  as: "line",
                  cond: {
                    $eq: ["$$line.t1_moneyline", "$best_t1_moneyline"],
                  },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          best_t2_moneyline_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$moneylines",
                  as: "line",
                  cond: {
                    $eq: ["$$line.t2_moneyline", "$best_t2_moneyline"],
                  },
                },
              },
              in: "$$this.sportsbook",
            },
          },
        },
      },
      {
        $sort: { t1_name: 1, t2_name: 1 },
      },
    ];

    const events = await EventModel.aggregate(pipeline);
    await closeMongoDBConnection();
    res.json(events);
  } catch (error) {
    console.error("Failed to fetch moneyline odds with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

app.get("/total/:league/:sportsbooks", async (req, res) => {
  const { league, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    const pipeline = [
      {
        $match: {
          league: league,
          sportsbook: { $in: sportsbookArray },
          $or: [{ t1_total: { $ne: null } }, { t2_total: { $ne: null } }],
        },
      },
      {
        $lookup: {
          from: "upcomings",
          localField: "league",
          foreignField: "league",
          as: "upcomingDetails",
        },
      },
      {
        $unwind: {
          path: "$upcomingDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            t1_name: "$t1_name",
            t2_name: "$t2_name",
            sportsbook: "$sportsbook",
          },
          t1_total: { $first: "$t1_total" },
          t2_total: { $first: "$t2_total" },
          t1_total_line: { $first: "$t1_total_line" },
          t2_total_line: { $first: "$t2_total_line" },
          date: { $first: "$upcomingDetails.date" },
        },
      },
      {
        $group: {
          _id: { t1_name: "$_id.t1_name", t2_name: "$_id.t2_name" },
          totals: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_total: "$t1_total",
              t2_total: "$t2_total",
              t1_total_line: "$t1_total_line",
              t2_total_line: "$t2_total_line",
            },
          },
          date: { $max: "$date" },
        },
      },
      {
        $addFields: {
          best_t1_total: { $max: "$totals.t1_total" },
          best_t2_total: { $max: "$totals.t2_total" },
        },
      },
      {
        $addFields: {
          best_t1_total_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$totals",
                  as: "total",
                  cond: { $eq: ["$$total.t1_total", "$best_t1_total"] },
                },
              },
              as: "filteredTotal",
              in: "$$filteredTotal.sportsbook",
            },
          },
          best_t2_total_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$totals",
                  as: "total",
                  cond: { $eq: ["$$total.t2_total", "$best_t2_total"] },
                },
              },
              as: "filteredTotal",
              in: "$$filteredTotal.sportsbook",
            },
          },
          best_t1_total_info: {
            $first: {
              $filter: {
                input: "$totals",
                as: "total",
                cond: { $eq: ["$$total.t1_total", "$best_t1_total"] },
              },
            },
          },
          best_t2_total_info: {
            $first: {
              $filter: {
                input: "$totals",
                as: "total",
                cond: { $eq: ["$$total.t2_total", "$best_t2_total"] },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          totals: 1,
          date: 1,
          best_t1_total: 1,
          best_t2_total: 1,
          best_t1_total_line: "$best_t1_total_info.t1_total_line",
          best_t2_total_line: "$best_t2_total_info.t2_total_line",
          best_t1_total_sportsbooks: 1,
          best_t2_total_sportsbooks: 1,
        },
      },
      {
        $sort: { t1_name: 1, t2_name: 1 },
      },
    ];

    const events = await EventModel.aggregate(pipeline);
    await closeMongoDBConnection();
    res.json(events);
  } catch (error) {
    console.error("Failed to fetch total lines with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
