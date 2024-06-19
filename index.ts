import express from "express";
import http from "http";
import socketio from "socket.io";
import prisma from "./db/prisma";
import jwt from "jsonwebtoken";
import cors from "cors";
import fs from "fs";
import tls from "tls";
import crypto from "crypto";

import dotenv from "dotenv";
import { parse, validate } from "@tma.js/init-data-node";

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static("public"));
// var key = fs.readFileSync(__dirname + "/certs/selfsigned.key");
// var cert = fs.readFileSync(__dirname + "/certs/selfsigned.crt");

const server = http.createServer(app);
server.listen(4000, () => {
  console.log("Localhost running on 4000");
});

const socketServer = new socketio.Server(server, {
  cors: { origin: "*" },
});

socketServer.on("connection", (socket) => {
  socket.on("naji-location", (data) => {
    socketServer.emit(data.requestId, data.location);
  });
});

const Authorization = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authorizationHeader = req.headers["authorization"] as string;
  if (authorizationHeader) {
    const token = authorizationHeader.split(" ")[1];

    jwt.verify(token, process.env.TOKEN_SECRET!, (err, data) => {
      if (err) res.sendStatus(403);
      else {
        res.locals.userId = (<any>data).id;
        next();
      }
    });
  } else {
    res.sendStatus(403);
  }
};

app.get(
  "/request/:requestId/accept",
  Authorization,
  async (
    req: express.Request<{ requestId: string }, {}, {}>,
    res: express.Response
  ) => {
    const userId = res.locals.userId;
    const requestId = req.params.requestId;

    const already = await prisma.request.count({
      where: { najiId: userId, status: { in: ["BRINGING"] } },
    });
    if (already === 0) {
      const updatedRequest = await prisma.request.update({
        where: { id: requestId },
        data: {
          status: "BRINGING",
          naji: { connect: { id: userId } },
        },
        select: {
          id: true,
          amount: true,
          lat: true,
          long: true,
          naji: {
            select: {
              id: true,
              name: true,
            },
          },
          nasakh: {
            select: {
              id: true,
              name: true,
              pushToken: true,
            },
          },
          status: true,
        },
      });
      socketServer.emit("remove-nasakh", { id: updatedRequest.id });
      socketServer.emit(updatedRequest.nasakh.id, {
        request: updatedRequest,
        role: "NASAKH",
      });
      socketServer.emit(userId, {
        request: updatedRequest,
        role: "NAJI",
      });

      res.json(updatedRequest);
    } else {
      res.status(403).send({
        error: "فعلا یکی منتظرته هر وقت اون تموم شد یکی دیگه رو قبول کن",
      });
    }
  }
);

app.get(
  "/request/:requestId/reject",
  Authorization,
  async (
    req: express.Request<{ requestId: string }, {}, {}>,
    res: express.Response
  ) => {
    const userId = res.locals.userId;
    const requestId = req.params.requestId;

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { status: "SEARCHING", naji: { disconnect: { id: userId } } },
      select: {
        id: true,
        amount: true,
        lat: true,
        long: true,
        naji: {
          select: {
            id: true,
            name: true,
          },
        },
        nasakh: {
          select: {
            id: true,
            name: true,
            pushToken: true,
          },
        },
        status: true,
      },
    });

    socketServer.emit("add-nasakh", updatedRequest);
    socketServer.emit(updatedRequest.nasakh.id, {
      request: updatedRequest,
      role: "NASAKH",
    });
    socketServer.emit(userId, {});

    res.json(updatedRequest);
  }
);

app.get(
  "/request/:requestId/done",
  Authorization,
  async (
    req: express.Request<{ requestId: string }, {}, {}>,
    res: express.Response
  ) => {
    const userId = res.locals.userId;
    const requestId = req.params.requestId;

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { status: "DONE" },
      select: {
        id: true,
        amount: true,
        lat: true,
        long: true,
        naji: {
          select: {
            id: true,
            name: true,
            pushToken: true,
          },
        },
        nasakh: {
          select: {
            id: true,
            name: true,
            pushToken: true,
          },
        },
        status: true,
      },
    });

    socketServer.emit("remove-nasakh", { id: updatedRequest.id });
    socketServer.emit(userId, {});
    if (updatedRequest.naji?.id) socketServer.emit(updatedRequest.naji?.id, {});

    res.json(updatedRequest);
  }
);

app.get(
  "/request/:requestId/cancel",
  Authorization,
  async (
    req: express.Request<{ requestId: string }, {}, {}>,
    res: express.Response
  ) => {
    const userId = res.locals.userId;
    const requestId = req.params.requestId;

    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { status: "CANCELED" },
      select: {
        id: true,
        amount: true,
        lat: true,
        long: true,
        naji: {
          select: {
            id: true,
            name: true,
            pushToken: true,
          },
        },
        nasakh: {
          select: {
            id: true,
            name: true,
          },
        },
        status: true,
      },
    });
    socketServer.emit("remove-nasakh", { id: updatedRequest.id });
    socketServer.emit(userId, {});
    if (updatedRequest.naji?.id) socketServer.emit(updatedRequest.naji?.id, {});

    res.json(updatedRequest);
  }
);

app.post(
  "/nasakham",
  Authorization,
  async (
    req: express.Request<{}, {}, { amount: number; lat: number; long: number }>,
    res: express.Response
  ) => {
    const id = res.locals.userId;
    const already = await prisma.request.count({
      where: { nasakhId: id, status: { in: ["BRINGING", "SEARCHING"] } },
    });
    if (already === 0) {
      const request = await prisma.request.create({
        data: {
          amount: req.body.amount,
          lat: req.body.lat,
          long: req.body.long,
          status: "SEARCHING",
          nasakh: { connect: { id } },
        },
        select: {
          id: true,
          amount: true,
          lat: true,
          long: true,
          naji: {
            select: {
              id: true,
              name: true,
            },
          },
          nasakh: {
            select: {
              id: true,
              name: true,
            },
          },
          status: true,
        },
      });
      socketServer.emit("add-nasakh", request);
      socketServer.emit(id, { request, role: "NASAKH" });

      res.json(request);
    } else res.status(403).send({ error: "چند تا درخواست میدی خیلی نسخیا!" });
  }
);

app.get(
  "/near-nasakhs",
  Authorization,
  async (
    req: express.Request<{}, {}, {}, { lat: string; long: string }>,
    res: express.Response
  ) => {
    const { lat, long } = req.query;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text
    FROM "Request" as r
    WHERE ST_DistanceSphere(ST_MakePoint(r.long::numeric,r.lat::numeric), ST_MakePoint(${long}::numeric, ${lat}::numeric)) < 300 
    `;
    const data = await prisma.request.findMany({
      where: { id: { in: ids.map((id) => id.id) }, status: "SEARCHING" },
      select: {
        id: true,
        amount: true,
        lat: true,
        long: true,
        naji: {
          select: {
            id: true,
            name: true,
          },
        },
        nasakh: {
          select: {
            id: true,
            name: true,
          },
        },
        status: true,
      },
    });
    res.json(data);
  }
);

app.post(
  "/token",
  telegramAuthMiddleware,
  async (req: express.Request, res: express.Response) => {
    const telegramUserId = res.locals.telegramUserId;
    const userExists = await prisma.user.findUnique({
      where: { telegramUserId },
      select: {
        id: true,
        name: true,
        UserAsNajiRequests: {
          where: { status: "BRINGING" },
          select: {
            id: true,
            amount: true,
            lat: true,
            long: true,
            naji: {
              select: {
                id: true,
                name: true,
              },
            },
            nasakh: {
              select: {
                id: true,
                name: true,
              },
            },
            status: true,
          },
        },
        UserAsNasakhRequests: {
          where: { status: { in: ["BRINGING", "SEARCHING"] } },
          select: {
            id: true,
            amount: true,
            lat: true,
            long: true,
            naji: {
              select: {
                id: true,
                name: true,
              },
            },
            nasakh: {
              select: {
                id: true,
                name: true,
              },
            },
            status: true,
          },
        },
      },
    });
    if (userExists) {
      const token = jwt.sign({ id: userExists.id }, process.env.TOKEN_SECRET!, {
        expiresIn: "365d",
      });
      res.json({ ...userExists, token });
    } else {
      const firstNameCount = await prisma.firstName.count();
      const lastNameCount = await prisma.lastName.count();
      const skipFirstName = Math.max(
        0,
        Math.floor(Math.random() * firstNameCount) - 1
      );
      const skipLastName = Math.max(
        0,
        Math.floor(Math.random() * lastNameCount) - 1
      );
      const firstName = await prisma.firstName.findMany({
        skip: skipFirstName,
        take: 1,
      });
      const lastName = await prisma.lastName.findMany({
        skip: skipLastName,
        take: 1,
      });
      const user = await prisma.user.create({
        data: {
          name: `${firstName[0].name} ${lastName[0].name}`,
          telegramUserId,
        },
        select: {
          id: true,
          name: true,
          UserAsNajiRequests: {
            where: { status: "BRINGING" },
            select: {
              id: true,
              amount: true,
              lat: true,
              long: true,
              naji: {
                select: {
                  id: true,
                  name: true,
                },
              },
              nasakh: {
                select: {
                  id: true,
                  name: true,
                },
              },
              status: true,
            },
          },
          UserAsNasakhRequests: {
            where: { status: { in: ["BRINGING", "SEARCHING"] } },
            select: {
              id: true,
              amount: true,
              lat: true,
              long: true,
              naji: {
                select: {
                  id: true,
                  name: true,
                },
              },
              nasakh: {
                select: {
                  id: true,
                  name: true,
                },
              },
              status: true,
            },
          },
        },
      });
      const token = jwt.sign({ id: user.id }, process.env.TOKEN_SECRET!, {
        expiresIn: "365d",
      });
      res.json({ ...user, token });
    }
  }
);

app.patch(
  "/push-token",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const { pushToken } = req.body;
    await prisma.user.update({ where: { id }, data: { pushToken } });
    res.json("done");
  }
);

app.get(
  "/me",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        UserAsNajiRequests: {
          where: { status: "BRINGING" },
          select: {
            id: true,
            amount: true,
            lat: true,
            long: true,
            naji: {
              select: {
                id: true,
                name: true,
              },
            },
            nasakh: {
              select: {
                id: true,
                name: true,
              },
            },
            status: true,
          },
        },
        UserAsNasakhRequests: {
          where: { status: { in: ["BRINGING", "SEARCHING"] } },
          select: {
            id: true,
            amount: true,
            lat: true,
            long: true,
            naji: {
              select: {
                id: true,
                name: true,
              },
            },
            nasakh: {
              select: {
                id: true,
                name: true,
              },
            },
            status: true,
          },
        },
      },
    });
    res.json(user);
  }
);

const WEB_APP_DATA_CONST = "WebAppData";
const TELEGRAM_BOT_TOKEN = "7495100655:AAGqvHyW7uFRa1-cQ3mupJrkLRr750M7oU8";

export function telegramAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // take initData from headers
  const { initData } = JSON.parse(
    (req.headers["telegram-data"] || "{}") as string
  );
  // use our helpers (see bellow) to validate string
  // and get user from it
  console.log(initData);
  try {
    const parsedInitData = parse(initData);
    validate(parsedInitData, TELEGRAM_BOT_TOKEN);
    const user = parsedInitData.user;
    if (user) {
      res.locals.telegramUserId = user.id;
      next();
    } else {
      res.writeHead(401, { "content-type": "application/json" });
      res.write("unauthorized");
      res.end();
    }
  } catch (err) {
    res.writeHead(401, { "content-type": "application/json" });
    res.write("unauthorized");
    res.end();
  }
}
