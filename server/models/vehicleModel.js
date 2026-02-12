const db = require("../config/db");

exports.getAllVehicles = () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM vehicle", [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};
