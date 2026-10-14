process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] = process.env["DATABASE_URL"] ?? "file:./dev.db";
