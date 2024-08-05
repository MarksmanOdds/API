import mongoose from "mongoose";

const UpcomingSchema = new mongoose.Schema({
  league: String,
  t1_name: String,
  t2_name: String,
  date: String,
  game_interval_type: String,
  current_game_interval: { type: Number, default: null },
  t1_score: { type: Number, default: null },
  t2_score: { type: Number, default: null },
  status: String,
  created_at: { type: Date, default: Date.now },
});

const UpcomingModel = mongoose.model("Upcoming", UpcomingSchema);
export default UpcomingModel;
