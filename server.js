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
          let: {
            event_league: "$league",
            event_t1_name: "$t1_name",
            event_t2_name: "$t2_name",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$league", "$$event_league"] },
                    { $eq: ["$t1_name", "$$event_t1_name"] },
                    { $eq: ["$t2_name", "$$event_t2_name"] },
                  ],
                },
              },
            },
          ],
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
          _id: { t1_name: "$_id.t1_name", t2_name: "$_id.t2_name" },
          odds: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_odds: "$doc.t1_moneyline",
              t2_odds: "$doc.t2_moneyline",
            },
          },
          date: { $first: "$date" },
        },
      },
      {
        $addFields: {
          avg_t1_odds: {
            $round: [{ $avg: "$odds.t1_odds" }, 2],
          },
          avg_t2_odds: {
            $round: [{ $avg: "$odds.t2_odds" }, 2],
          },
          best_t1_odds: { $max: "$odds.t1_odds" },
          best_t2_odds: { $max: "$odds.t2_odds" },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          odds: 1,
          date: 1,
          avg_t1_odds: 1,
          avg_t2_odds: 1,
          best_t1_odds: 1,
          best_t2_odds: 1,
          best_t1_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: {
                    $eq: ["$$odd.t1_odds", "$best_t1_odds"],
                  },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          best_t2_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: {
                    $eq: ["$$odd.t2_odds", "$best_t2_odds"],
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
          let: {
            event_league: "$league",
            event_t1_name: "$t1_name",
            event_t2_name: "$t2_name",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$league", "$$event_league"] },
                    { $eq: ["$t1_name", "$$event_t1_name"] },
                    { $eq: ["$t2_name", "$$event_t2_name"] },
                  ],
                },
              },
            },
            { $sort: { date: -1 } }, // Sorting inside lookup to get latest date first
            { $limit: 1 }, // Limiting to the most recent date
          ],
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
            date: "$upcomingDetails.date",
          },
          total_details: { $first: "$$ROOT" },
        },
      },
      {
        $group: {
          _id: {
            t1_name: "$_id.t1_name",
            t2_name: "$_id.t2_name",
            date: "$_id.date",
          },
          odds: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_odds: "$total_details.t1_total",
              t2_odds: "$total_details.t2_total",
              t1_odds_line: "$total_details.t1_total_line",
              t2_odds_line: "$total_details.t2_total_line",
            },
          },
          best_t1_odds: { $max: "$total_details.t1_total" },
          best_t2_odds: { $max: "$total_details.t2_total" },
          avg_t1_odds: { $avg: "$total_details.t1_total" },
          avg_t2_odds: { $avg: "$total_details.t2_total" },
        },
      },
      {
        $addFields: {
          best_t1_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: { $eq: ["$$odd.t1_odds", "$best_t1_odds"] },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          best_t2_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: { $eq: ["$$odd.t2_odds", "$best_t2_odds"] },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          best_t1_odds_info: {
            $first: {
              $filter: {
                input: "$odds",
                as: "odd",
                cond: { $eq: ["$$odd.t1_odds", "$best_t1_odds"] },
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
          odds: 1,
          date: "$_id.date",
          best_t1_odds: 1,
          best_t2_odds: 1,
          best_t1_odds_sportsbooks: 1,
          best_t2_odds_sportsbooks: 1,
          best_t1_odds_line: "$best_t1_odds_info.t1_odds_line",
          best_t2_odds_line: "$best_t1_odds_info.t2_odds_line",
          avg_t1_odds: { $round: ["$avg_t1_odds", 2] }, // Rounding to 2 decimal places
          avg_t2_odds: { $round: ["$avg_t2_odds", 2] }, // Rounding to 2 decimal places
        },
      },
      {
        $sort: { t1_name: 1, t2_name: 1, date: 1 },
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

app.get("/spread/:league/:sportsbooks", async (req, res) => {
  const { league, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    const pipeline = [
      {
        $match: {
          league: league,
          sportsbook: { $in: sportsbookArray },
          $or: [{ t1_spread: { $ne: null } }, { t2_spread: { $ne: null } }],
        },
      },
      {
        $lookup: {
          from: "upcomings",
          let: {
            event_league: "$league",
            event_t1_name: "$t1_name",
            event_t2_name: "$t2_name",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$league", "$$event_league"] },
                    { $eq: ["$t1_name", "$$event_t1_name"] },
                    { $eq: ["$t2_name", "$$event_t2_name"] },
                  ],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 1 },
          ],
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
            date: "$upcomingDetails.date",
          },
          t1_spread: { $first: "$t1_spread" },
          t2_spread: { $first: "$t2_spread" },
          t1_spread_margin: { $first: "$t1_spread_margin" },
          t2_spread_margin: { $first: "$t2_spread_margin" },
        },
      },
      {
        $group: {
          _id: {
            t1_name: "$_id.t1_name",
            t2_name: "$_id.t2_name",
            date: "$_id.date",
          },
          odds: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_odds: "$t1_spread",
              t2_odds: "$t2_spread",
              t1_odds_line: "$t1_spread_margin",
              t2_odds_line: "$t2_spread_margin",
            },
          },
          best_t1_odds: { $max: "$t1_spread" },
          best_t2_odds: { $max: "$t2_spread" },
          avg_t1_odds: { $avg: "$t1_spread" },
          avg_t2_odds: { $avg: "$t2_spread" },
        },
      },
      {
        $addFields: {
          best_t1_odds_info: {
            $first: {
              $filter: {
                input: "$odds",
                as: "odd",
                cond: { $eq: ["$$odd.t1_odds", "$best_t1_odds"] },
              },
            },
          },
          best_t2_odds_info: {
            $first: {
              $filter: {
                input: "$odds",
                as: "odd",
                cond: { $eq: ["$$odd.t2_odds", "$best_t2_odds"] },
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
          date: "$_id.date",
          odds: 1,
          best_t1_odds: 1,
          best_t2_odds: 1,
          best_t1_odds_line: "$best_t1_odds_info.t1_odds_line",
          best_t2_odds_line: "$best_t2_odds_info.t2_odds_line",
          best_t1_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: { $eq: ["$$odd.t1_odds", "$best_t1_odds"] },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          best_t2_odds_sportsbooks: {
            $map: {
              input: {
                $filter: {
                  input: "$odds",
                  as: "odd",
                  cond: { $eq: ["$$odd.t2_odds", "$best_t2_odds"] },
                },
              },
              in: "$$this.sportsbook",
            },
          },
          avg_t1_odds: { $round: ["$avg_t1_odds", 2] }, // Rounding to 2 decimal places
          avg_t2_odds: { $round: ["$avg_t2_odds", 2] }, // Rounding to 2 decimal places
        },
      },
      {
        $sort: { t1_name: 1, t2_name: 1, date: 1 },
      },
    ];

    const events = await EventModel.aggregate(pipeline);
    await closeMongoDBConnection();
    res.json(events);
  } catch (error) {
    console.error("Failed to fetch spread lines with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
