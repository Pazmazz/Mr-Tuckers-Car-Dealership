const db = require("../config/db");

exports.getAllVehicles = async () => {
  const [rows] = await db.query("SELECT * FROM vehicle");
  return rows;
};
