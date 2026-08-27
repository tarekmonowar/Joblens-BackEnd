import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { envVars } from "../../config/env";
import { IJobCard } from "../jobs/jobs.mapper";

export interface IStatsPayload {
  totalActiveJobs: number;
  newJobsToday: number;
}

let io: Server | null = null;

export const initRealtime = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: envVars.FRONTEND_ORIGIN,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket client connected", socket.id);
    socket.on("disconnect", () => {
      console.log("Socket client disconnected", socket.id);
    });
  });

  return io;
};

const emitNewJobs = (jobs: IJobCard[]) => {
  if (!io) {
    return;
  }
  io.emit("job:new", { jobs: jobs.slice(0, 10) });
};

const emitStats = (payload: IStatsPayload) => {
  if (!io) {
    return;
  }
  io.emit("stats:update", payload);
};

export const RealtimeServices = {
  emitNewJobs,
  emitStats,
};
