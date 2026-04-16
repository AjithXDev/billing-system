const Database = require("better-sqlite3");
const path = require("path");

try {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
    db.prepare("INSERT INTO test (name) VALUES (?)").run("Test Worker");
    const row = db.prepare("SELECT * FROM test").get();
    console.log("SUCCESS: better-sqlite3 is working correctly!");
    console.log("Data from memory DB:", row);
} catch (error) {
    console.error("FAILURE: better-sqlite3 is NOT working correctly!");
    console.error(error);
    process.exit(1);
}
