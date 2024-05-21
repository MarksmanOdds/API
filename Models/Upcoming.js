import mongoose from "mongoose";

const UpcomingSchema = new mongoose.Schema({
  league: String,
  t1_name: String,
  t2_name: String,
  date: String,
});

const UpcomingModel = mongoose.model("Upcoming", UpcomingSchema);
export default UpcomingModel;
