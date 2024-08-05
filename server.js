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

app.get("/moneyline/:league/:region/:sportsbooks", async (req, res) => {
  const { league, region, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    const pipeline = [
      {
        $match: {
          league: league,
          $or: [{ region: region }, { region: null }],
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
            { $sort: { created_at: -1 } },
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
          },
          doc: { $first: "$$ROOT" },
          date: { $first: "$upcomingDetails.date" },
          game_interval_type: { $first: "$upcomingDetails.game_interval_type" },
          current_game_interval: {
            $first: "$upcomingDetails.current_game_interval",
          },
          t1_score: { $first: "$upcomingDetails.t1_score" },
          t2_score: { $first: "$upcomingDetails.t2_score" },
          status: { $first: "$upcomingDetails.status" },
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
          game_interval_type: { $first: "$game_interval_type" },
          current_game_interval: { $first: "$current_game_interval" },
          t1_score: { $first: "$t1_score" },
          t2_score: { $first: "$t2_score" },
          status: { $first: "$status" },
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
          game_interval_type: 1,
          current_game_interval: 1,
          t1_score: 1,
          t2_score: 1,
          status: 1,
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
                  cond: { $eq: ["$$odd.t1_odds", "$best_t1_odds"] },
                },
              },
              as: "item",
              in: "$$item.sportsbook",
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
              as: "item",
              in: "$$item.sportsbook",
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

app.get("/total/:league/:region/:sportsbooks", async (req, res) => {
  const { league, region, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    const pipeline = [
      {
        $match: {
          league: league,
          $or: [{ region: region }, { region: null }],
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
            { $sort: { created_at: -1 } },
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
          },
          doc: { $first: "$$ROOT" },
          date: { $first: "$upcomingDetails.date" },
          game_interval_type: { $first: "$upcomingDetails.game_interval_type" },
          current_game_interval: {
            $first: "$upcomingDetails.current_game_interval",
          },
          t1_score: { $first: "$upcomingDetails.t1_score" },
          t2_score: { $first: "$upcomingDetails.t2_score" },
          status: { $first: "$upcomingDetails.status" },
        },
      },
      {
        $group: {
          _id: { t1_name: "$_id.t1_name", t2_name: "$_id.t2_name" },
          odds: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_odds: "$doc.t1_total",
              t2_odds: "$doc.t2_total",
              t1_odds_line: "$doc.t1_total_line",
              t2_odds_line: "$doc.t2_total_line",
            },
          },
          date: { $first: "$date" },
          game_interval_type: { $first: "$game_interval_type" },
          current_game_interval: { $first: "$current_game_interval" },
          t1_score: { $first: "$t1_score" },
          t2_score: { $first: "$t2_score" },
          status: { $first: "$status" },
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
          best_t1_odds_line: { $max: "$odds.t1_odds_line" },
          best_t2_odds_line: { $max: "$odds.t2_odds_line" },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          odds: 1,
          date: 1,
          game_interval_type: 1,
          current_game_interval: 1,
          t1_score: 1,
          t2_score: 1,
          status: 1,
          avg_t1_odds: 1,
          avg_t2_odds: 1,
          best_t1_odds: 1,
          best_t2_odds: 1,
          best_t1_odds_line: 1,
          best_t2_odds_line: 1,
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
    console.error("Failed to fetch total lines with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

app.get("/spread/:league/:region/:sportsbooks", async (req, res) => {
  const { league, region, sportsbooks } = req.params;
  const sportsbookArray = sportsbooks.split(",");

  try {
    await connectToMongoDB();

    const pipeline = [
      {
        $match: {
          league: league,
          $or: [{ region: region }, { region: null }],
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
          },
          doc: { $first: "$$ROOT" },
          date: { $first: "$upcomingDetails.date" },
          game_interval_type: { $first: "$upcomingDetails.game_interval_type" },
          current_game_interval: {
            $first: "$upcomingDetails.current_game_interval",
          },
          t1_score: { $first: "$upcomingDetails.t1_score" },
          t2_score: { $first: "$upcomingDetails.t2_score" },
          status: { $first: "$upcomingDetails.status" },
        },
      },
      {
        $group: {
          _id: { t1_name: "$_id.t1_name", t2_name: "$_id.t2_name" },
          odds: {
            $push: {
              sportsbook: "$_id.sportsbook",
              t1_odds: "$doc.t1_spread",
              t2_odds: "$doc.t2_spread",
              t1_odds_line: "$doc.t1_spread_margin",
              t2_odds_line: "$doc.t2_spread_margin",
            },
          },
          date: { $first: "$date" },
          game_interval_type: { $first: "$game_interval_type" },
          current_game_interval: { $first: "$current_game_interval" },
          t1_score: { $first: "$t1_score" },
          t2_score: { $first: "$t2_score" },
          status: { $first: "$status" },
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
          best_t1_odds_line: { $max: "$odds.t1_odds_line" },
          best_t2_odds_line: { $max: "$odds.t2_odds_line" },
        },
      },
      {
        $project: {
          _id: 0,
          t1_name: "$_id.t1_name",
          t2_name: "$_id.t2_name",
          odds: 1,
          date: 1,
          game_interval_type: 1,
          current_game_interval: 1,
          t1_score: 1,
          t2_score: 1,
          status: 1,
          avg_t1_odds: 1,
          avg_t2_odds: 1,
          best_t1_odds: 1,
          best_t2_odds: 1,
          best_t1_odds_line: 1,
          best_t2_odds_line: 1,
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
    console.error("Failed to fetch spread lines with aggregation:", error);
    res.status(500).send("Internal server error");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
