// Import necessary modules
import express from "express";
import {
  fetchMostRecentNBAEventsBySportsbook,
  findBestBettingLines,
  fetchNBAEventsBySpecificSportsbooks,
} from "./database.js";
import cors from "cors";

// Initialize express app
const app = express();
const PORT = 3001; // Default port for the server

// Middleware to parse JSON bodies
app.use(express.json());

// Use CORS
app.use(cors());

// Route to fetch NBA events and process them
// needs to eventually be able to take a league name as a parameter
app.get("/moneyline", async (req, res) => {
  try {
    const result = [];
    // Fetch NBA events for the specific matchup (adjust parameters as needed)
    let events = await fetchMostRecentNBAEventsBySportsbook(
      "Cleveland Cavaliers",
      "Orlando Magic"
    );
    let bettingLines = findBestBettingLines(events);
    result.push(bettingLines);

    events = await fetchMostRecentNBAEventsBySportsbook(
      "Dallas Mavericks",
      "Los Angeles Clippers"
    );
    bettingLines = findBestBettingLines(events);
    result.push(bettingLines);

    events = await fetchMostRecentNBAEventsBySportsbook(
      "Denver Nuggets",
      "Los Angeles Lakers"
    );
    bettingLines = findBestBettingLines(events);
    result.push(bettingLines);

    // Respond with the processed betting lines
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Handle errors gracefully
    res.status(500).json({
      success: false,
      message: "Error fetching NBA events",
      error: error.message,
    });
  }
});

// New endpoint to fetch NBA moneyline odds from specific sportsbooks
app.get("/nba-moneylines", async (req, res) => {
  const sportsbooks = [
    "PointsBet",
    "FanDuel",
    "DraftKings",
    "Betano",
    "Proline",
    "TheScore",
    "Sports Interaction",
    "Bwin",
    "888Sport",
  ];

  try {
    const events = await fetchNBAEventsBySpecificSportsbooks(sportsbooks);
    const groupedByGame = groupEventsByGame(events);
    res.json({
      success: true,
      data: groupedByGame,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching NBA moneyline odds",
      error: error.message,
    });
  }
});

// Function to group events by game
function groupEventsByGame(events) {
  const grouped = {};
  events.forEach((event) => {
    const matchupKey = `${event.t1_name} vs ${event.t2_name}`;
    if (!grouped[matchupKey]) {
      grouped[matchupKey] = {
        t1_name: event.t1_name,
        t2_name: event.t2_name,
        odds: [],
      };
    }
    grouped[matchupKey].odds.push({
      sportsbook: event.sportsbook,
      t1_moneyline: event.t1_moneyline,
      t2_moneyline: event.t2_moneyline,
    });
  });
  return Object.values(grouped);
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
