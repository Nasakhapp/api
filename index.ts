import express from "express";
import http from "http";
import socketio from "socket.io";
import prisma from "./db/prisma";
import jwt from "jsonwebtoken";
import cors from "cors";

import dotenv from "dotenv";
import { parse, validate } from "@tma.js/init-data-node";
import {
  Address,
  BitString,
  Cell,
  CellType,
  fromNano,
  JettonMaster,
  JettonWallet,
  openContract,
  parseTuple,
  TonClient,
  WalletContractV4,
} from "@ton/ton";

import axios from "axios";
import { Contract } from "tonweb/dist/types/contract/contract";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

dotenv.config();

const TONCENTER_API_KEY =
  "148a23f7c4228fb1d324bf59985cabf66d9f04adc4b9416ca7d45671bd9953a7";
const TELEGRAM_BOT_TOKEN = "7495100655:AAGqvHyW7uFRa1-cQ3mupJrkLRr750M7oU8";
const JETTON_MASTER_ADDRESS =
  "EQBPC7kdLHl3zdqdOidPgO2AZDfl8stvtIoPQSw9uCyVEF3F";

const app = express();
const client = new TonClient({
  endpoint: "https://toncenter.com/api/v2/jsonRPC",
  apiKey: TONCENTER_API_KEY,
});
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
bot.on(message("text"), (ctx) => {
  console.log(ctx.message);
  ctx.reply("Hello");
});
bot.telegram.setWebhook("https://nasakh.app/");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(bot.webhookCallback("/"));
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
    res.sendStatus(401);
  }
};

app.get(
  "/nasakh/request/:requestId/accept",
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
  "/nasakh/request/:requestId/reject",
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
  "/nasakh/request/:requestId/done",
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

    await prisma.user.update({
      where: { id: updatedRequest.nasakh.id },
      data: { point: { decrement: updatedRequest.amount } },
    });
    await prisma.user.update({
      where: { id: updatedRequest.naji?.id },
      data: { point: { increment: updatedRequest.amount } },
    });

    socketServer.emit("remove-nasakh", { id: updatedRequest.id });
    socketServer.emit(userId, {});
    if (updatedRequest.naji?.id) socketServer.emit(updatedRequest.naji?.id, {});

    res.json(updatedRequest);
  }
);

app.get(
  "/nasakh/request/:requestId/cancel",
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
  "/nasakh/request",
  Authorization,
  async (
    req: express.Request<{}, {}, { amount: number; lat: number; long: number }>,
    res: express.Response
  ) => {
    const id = res.locals.userId;
    const already = await prisma.request.count({
      where: { nasakhId: id, status: { in: ["BRINGING", "SEARCHING"] } },
    });
    const userPoint = await prisma.user.findUnique({
      where: { id },
      select: { point: true },
    });

    if (already === 0) {
      if (userPoint?.point && userPoint?.point > req.body.amount) {
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
      } else {
        res.status(403).send({ error: "سوتون زیاد سیگار می خوای" });
      }
    } else res.status(403).send({ error: "چند تا درخواست میدی خیلی نسخیا!" });
  }
);

app.get(
  "/nasakh/near",
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
    const telegramUserId = String(res.locals.telegramUserId);
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
        walletAddress: true,
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
          walletAddress: true,
        },
      });
      const token = jwt.sign({ id: user.id }, process.env.TOKEN_SECRET!, {
        expiresIn: "365d",
      });
      res.json({ ...user, token });
    }
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
        walletAddress: true,
        telegramChatId: true,
      },
    });
    res.json(user);
  }
);

app.put(
  "/me/wallet-address",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const walletAddress = req.body.walletAddress;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.walletAddress) {
      const updatedUser = await prisma.user.update({
        where: { id },
        data: { walletAddress },
      });
      res.status(200).json(updatedUser);
    } else {
      res.status(403).json(user);
    }
  }
);

app.put(
  "/me/telegram-chat-id",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const telegramChatId = req.body.telegramChatId;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.telegramChatId) {
      const updatedUser = await prisma.user.update({
        where: { id },
        data: { telegramChatId },
      });
      res.status(200).json(updatedUser);
    } else {
      res.status(403).json(user);
    }
  }
);

app.get(
  "/me/wallet/",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const user = await prisma.user.findUnique({ where: { id } });
    if (user?.walletAddress) {
      try {
        const jettonMasterAddress = Address.parse(JETTON_MASTER_ADDRESS);
        const userAddress = Address.parse(user.walletAddress);
        const jettonMaster = client.open(
          JettonMaster.create(jettonMasterAddress)
        );
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(
          userAddress
        );
        const jettonWallet = client.open(
          JettonWallet.create(userJettonWalletAddress)
        );
        const balance = await jettonWallet.getBalance();

        const jetton = await axios
          .get(
            `https://toncenter.com/api/v2/getTokenData?address=${JETTON_MASTER_ADDRESS}`,
            { method: "GET", headers: { "X-API-Key": TONCENTER_API_KEY } }
          )
          .then(async (res) => {
            if (res.data) {
              const data = res.data;
              return data.result?.jetton_content?.data;
            }
            return {};
          });
        res.status(200).json({ balance: fromNano(balance).toString(), jetton });
      } catch (error) {
        console.log(error);
      }
    }
  }
);

app.get(
  "/me/level/",
  Authorization,
  async (req: express.Request, res: express.Response) => {
    const id = res.locals.userId;
    const user = await prisma.user.findUnique({ where: { id } });
    const level = await prisma.level.findFirst({
      where: { min: { lt: user?.point }, max: { gte: user?.point } },
      select: { id: true, name: true, min: true, max: true },
    });
    res.status(200).json({ point: user?.point, level });
  }
);

export function telegramAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // take initData from headers
  const initData = req.headers["telegram-data"] as string;

  if (process.env.NODE_ENV !== "development") {
    // use our helpers (see bellow) to validate string
    // and get user from it
    try {
      validate(initData, TELEGRAM_BOT_TOKEN);
      const parsedInitData = parse(new URLSearchParams(initData));
      console.log(parsedInitData);
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
      console.log(err);
      res.writeHead(401, { "content-type": "application/json" });
      res.write(err);
      res.end();
    }
  } else {
    const parsedInitData = parse(new URLSearchParams(initData));
    const user = parsedInitData.user;
    if (user) {
      res.locals.telegramUserId = user.id;
      next();
    } else {
      res.writeHead(401, { "content-type": "application/json" });
      res.write("unauthorized");
      res.end();
    }
  }
}
