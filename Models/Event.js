import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
  sportsbook: String,
  league: String,
  region: { type: String, default: null },
  t1_name: String,
  t2_name: String,
  t1_moneyline: { type: Number, default: null },
  t2_moneyline: { type: Number, default: null },
  t1_spread: { type: Number, default: null },
  t2_spread: { type: Number, default: null },
  t1_total: { type: Number, default: null },
  t2_total: { type: Number, default: null },
  t1_total_line: { type: String, default: null },
  t2_total_line: { type: String, default: null },
  t1_spread_margin: { type: String, default: null },
  t2_spread_margin: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});

const EventModel = mongoose.model("Event", EventSchema);
export default EventModel;
