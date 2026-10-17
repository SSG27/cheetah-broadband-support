import pino from "pino";

export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "development" ? "debug" : "info"),
  base: { service: "cheetah-broadband-support" },
  serializers: { err: pino.stdSerializers.err },
});
