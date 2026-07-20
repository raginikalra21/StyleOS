/**
 * DB connection layer — Oracle locally (unchanged, zero risk to the
 * existing dev/demo setup), Postgres when deployed. Driver is picked by
 * whether DATABASE_URL is set, not a manual flag, so local `npm start`
 * behaves exactly as it always has with no config change required.
 *
 * Both drivers expose the SAME query(sql, binds) -> { rows } shape the
 * rest of the app already calls everywhere, with Oracle-style named
 * binds (:name) and UPPERCASE row keys — so no route/model/service file
 * needed to change for the Postgres path to work.
 */

if (process.env.DATABASE_URL) {
  module.exports = require('./db_postgres');
} else {
  module.exports = require('./db_oracle');
}
