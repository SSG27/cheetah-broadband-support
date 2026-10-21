process.env["DATABASE_URL"] = process.env["DATABASE_URL"] ?? "file:./dev.db";
process.env["OPENAI_API_KEY"] = "";
process.env["LOG_LEVEL"] = "fatal";
