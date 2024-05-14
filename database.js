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

const nbaGames = [
  {
    date: "Thursday, May 3, 2024",
    games: [
      {
        time: "7:30 PM ET",
        t1_name: "Cleveland Cavaliers",
        t2_name: "Orlando Magic",
      },
      //   {
      //     time: "9:30 PM ET",
      //     t1_name: "LA Clippers",
      //     t2_name: "Dallas Mavericks",
      //   },
    ],
  },
  //   {
  //     date: "Friday, May 4, 2024",
  //     games: [
  //       {
  //         time: "TBD",
  //         t1_name: "Philadelphia 76ers",
  //         t2_name: "New York Knicks",
  //       },
  //       {
  //         time: "TBD",
  //         t1_name: "Indiana Pacers",
  //         t2_name: "Milwaukee Bucks",
  //       },
  //       {
  //         time: "TBD",
  //         t1_name: "Minnesota Timberwolves",
  //         t2_name: "Denver Nuggets",
  //       },
  //     ],
  //   },
  //   {
  //     date: "Saturday, May 5, 2024",
  //     games: [
  //       {
  //         time: "1:00 PM ET",
  //         t1_name: "Orlando Magic",
  //         t2_name: "Cleveland Cavaliers",
  //       },
  //       {
  //         time: "8:00 PM ET",
  //         t1_name: "Dallas Mavericks",
  //         t2_name: "LA Clippers",
  //       },
  //     ],
  //   },
];

async function fetchNBAEventsBySpecificSportsbooks(sportsbooks) {
  await connectToMongoDB();

  let events = await EventModel.aggregate([
    {
      $match: {
        league: "NBA",
        sportsbook: { $in: sportsbooks },
        $or: [
          {
            $and: [
              { t1_name: "Los Angeles Lakers", t2_name: "Denver Nuggets" },
            ],
          },
          {
            $and: [
              { t1_name: "Los Angeles Clippers", t2_name: "Dallas Mavericks" },
            ],
          },
        ],
      },
    },
    {
      $sort: { created_at: -1 },
    },
    {
      $group: {
        _id: "$sportsbook",
        latestEvent: { $first: "$$ROOT" },
      },
    },
    {
      $project: {
        _id: 0,
        sportsbook: "$_id",
        t1_name: "$latestEvent.t1_name",
        t2_name: "$latestEvent.t2_name",
        t1_moneyline: "$latestEvent.t1_moneyline",
        t2_moneyline: "$latestEvent.t2_moneyline",
      },
    },
  ]);

  await closeMongoDBConnection();

  // add a best and average object in the odds array before returning it
  let t1_moneyline_best = -Infinity;
  let sportsbook1;
  let sportsbook2;
  let t2_moneyline_best = -Infinity;
  let t1_moneyline_total = 0;
  let t2_moneyline_total = 0;

  for (const event of events) {
    if (t1_moneyline_best < event.t1_moneyline) {
      t1_moneyline_best = event.t1_moneyline;
      sportsbook1 = event.sportsbook;
    }
    if (t2_moneyline_best < event.t2_moneyline) {
      t2_moneyline_best = event.t2_moneyline;
      sportsbook2 = event.sportsbook;
    }

    t1_moneyline_total += event.t1_moneyline;
    t2_moneyline_total += event.t2_moneyline;
  }

  events.push(
    ...[
      {
        sportsbook: `Best,${sportsbook1},${sportsbook2}`,
        t1_moneyline: t1_moneyline_best,
        t2_moneyline: t2_moneyline_best,
      },
      {
        sportsbook: "Average",
        t1_moneyline: parseFloat((t1_moneyline_total / 9).toFixed(2)),
        t2_moneyline: parseFloat((t2_moneyline_total / 9).toFixed(2)),
      },
    ]
  );

  return events;
}

async function fetchMostRecentNBAEventsBySportsbook(t1_name, t2_name) {
  // Ensure you connect to the database before performing queries
  await connectToMongoDB();

  const mostRecentEvents = await EventModel.aggregate([
    // Match NBA events only and check if either team name matches the provided names
    {
      $match: {
        league: "NBA",
        $or: [{ t1_name: t1_name }, { t2_name: t2_name }],
      },
    },
    // Sort documents by sportsbook and descending creation date
    { $sort: { sportsbook: 1, created_at: -1 } },
    {
      $group: {
        _id: "$sportsbook",
        // Get the most recent document for each sportsbook
        latestEvent: { $first: "$$ROOT" },
      },
    },
    // Optionally project the fields you want to return
    {
      $project: {
        _id: 0,
        sportsbook: "$_id",
        eventDetails: "$latestEvent",
      },
    },
  ]);

  // Close the connection after the query
  await closeMongoDBConnection();
  return mostRecentEvents;
}

function findBestBettingLines(events) {
  let bestOddsMap = {};

  events.forEach((event) => {
    const {
      sportsbook,
      league,
      t1_name,
      t2_name,
      t1_moneyline,
      t2_moneyline,
      t1_total,
      t2_total,
      t1_total_line,
      t2_total_line,
      t1_spread_margin,
      t2_spread_margin,
      t1_spread,
      t2_spread,
    } = event.eventDetails;

    const matchupKey = `${t1_name} vs ${t2_name}`;

    // Ensure initialization of matchup entry
    if (!bestOddsMap[matchupKey]) {
      bestOddsMap[matchupKey] = {
        home_team: t1_name,
        away_team: t2_name,
        league: league,
        odds: [],
      };
    }

    const currentMatchup = bestOddsMap[matchupKey];

    // Update betting lines with the best odds found
    updateBestOdds(
      currentMatchup.odds,
      `${t1_name} Moneyline`,
      "Moneyline",
      sportsbook,
      t1_moneyline
    );
    updateBestOdds(
      currentMatchup.odds,
      `${t2_name} Moneyline`,
      "Moneyline",
      sportsbook,
      t2_moneyline
    );
    // updateBestOdds(
    //   currentMatchup.odds,
    //   `${t1_name} Total Over ${t1_total_line}`,
    //   "Total",
    //   sportsbook,
    //   t1_total
    // );
    // updateBestOdds(
    //   currentMatchup.odds,
    //   `${t2_name} Total Under ${t2_total_line}`,
    //   "Total",
    //   sportsbook,
    //   t2_total
    // );
    // updateBestOdds(
    //   currentMatchup.odds,
    //   `${t1_name} Spread Over ${t1_spread_margin}`,
    //   "Spread",
    //   sportsbook,
    //   t1_spread
    // );
    // updateBestOdds(
    //   currentMatchup.odds,
    //   `${t2_name} Spread Under ${t2_spread_margin}`,
    //   "Spread",
    //   sportsbook,
    //   t2_spread
    // );
  });

  // Convert the map to an array for output
  return Object.values(bestOddsMap);
}

function updateBestOdds(oddsArray, name, marketName, sportsbook, newPrice) {
  const existing = oddsArray.find((odd) => odd.name === name);
  if (!existing) {
    oddsArray.push({
      name: name,
      market_name: marketName,
      sportsbook: sportsbook,
      best_price: newPrice,
    });
  } else if (existing.best_price < newPrice) {
    existing.best_price = newPrice;
    existing.sportsbook = sportsbook;
  }

  // if (name === "Cleveland Cavaliers Moneyline") {
  //   console.log("");
  //   console.log("name ", name);
  //   console.log("sportsbook ", sportsbook);
  //   console.log("newPrice ", newPrice);
  //   console.log("");
  // }
}

// You can then use this function to fetch events and find best betting lines:
async function processEvents() {
  for (const nbaGame of nbaGames) {
    for (const game of nbaGame.games) {
      const events = await fetchMostRecentNBAEventsBySportsbook(
        game.t1_name,
        game.t2_name
      );
      const markets = findBestBettingLines(events);

      for (const market of markets) {
        console.log(`home_team: ${market.home_team}`);
        console.log(`away_team: ${market.away_team}`);
        console.log(`league: ${market.league}`);
        for (const odd of market.odds) {
          console.log(odd);
        }
      }
    }
  }
}

// Start processing
// processEvents();

// const events = await fetchMostRecentNBAEventsBySportsbook();

// // console.log(events);

// console.log(findBestBettingLines(events));

// Export the function along with existing functions
export {
  connectToMongoDB,
  closeMongoDBConnection,
  fetchMostRecentNBAEventsBySportsbook,
  findBestBettingLines,
  fetchNBAEventsBySpecificSportsbooks,
};
