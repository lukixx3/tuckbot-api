import format from "date-format";
import { Router } from "express";
import HttpStatusCode from "http-status-codes";
import { configurator } from "tuckbot-util";
import { LessThan } from "typeorm";
import { response } from "../";
import { Video } from "../../../entity";

const router: Router = Router();

const apiToken = configurator.tuckbot.api.token;

export const LessThanDate = (date: Date) =>
  LessThan(format(date, "YYYY-MM-DD HH:MM:SS"));

router.all("/*", (req, res, next) => {
  if (!req.headers["x-tuckbot-api-token"]) {
    req.log.error(`Authentication attempted without authentication tokens`);

    return response(res, {
      status: HttpStatusCode.UNPROCESSABLE_ENTITY,
      message: "Auth parameters not provided",
    });
  }

  if (req.headers["x-tuckbot-api-token"] != apiToken) {
    req.log.error(`Authentication failed`);

    return response(res, {
      status: HttpStatusCode.UNAUTHORIZED,
      message: "Invalid credentials",
    });
  }

  req.log.debug(`Received valid admin authentication`);

  next();
});

router.post("/prune/:redditPostId", async (req, res) => {
  let redditPostId = req.params.redditPostId;

  let video = await Video.findOne({
    where: {
      redditPostId: redditPostId,
    },
  });

  if (!video) {
    return response(res, {
      status: HttpStatusCode.NOT_FOUND,
      message: `Video not found in database`,
      data: {
        redditPostId: redditPostId,
      },
    });
  }

  try {
    await video.prune();
  } catch (e) {
    return response(res, {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      message: `Unable to prune video`,
      data: {
        redditPostId: redditPostId,
        message: e,
      },
    });
  }

  return response(res, {
    data: {
      redditPostId: redditPostId,
    },
  });
});

router.get("/stalevideos", async (req, res) => {
  const now = new Date();
  const minimumAge = new Date();
  minimumAge.setDate(now.getDay() - 1);

  const repruneAge = new Date();
  repruneAge.setDate(now.getDay() - 30);

  let videos = await Video.find({
    select: ["redditPostId", "lastViewedAt", "lastPrunedAt"],
    where: [
      { createdAt: LessThanDate(minimumAge), lastPrunedAt: null },
      {
        createdAt: LessThanDate(minimumAge),
        lastPrunedAt: LessThanDate(repruneAge),
      },
    ],
    order: {
      createdAt: "ASC",
      lastPrunedAt: "ASC",
    },
    skip: 0,
    take: 10,
  });

  return response(res, {
    data: {
      staleVideos: videos,
    },
  });
});

router.post("/", async (req, res) => {
  let redditPostId = req.body.redditPostId;
  let redditPostTitle = req.body.redditPostTitle;
  let mirrorUrl = req.body.mirrorUrl;

  if (!redditPostId || !redditPostTitle || !mirrorUrl) {
    return response(res, {
      status: HttpStatusCode.UNPROCESSABLE_ENTITY,
      message: "Data missing from request",
      data: {
        redditPostId: redditPostId,
        redditPostTitle: redditPostTitle,
        mirrorUrl: mirrorUrl,
      },
    });
  }

  let vid = await Video.findOne({
    redditPostId: redditPostId,
  });

  if (vid) {
    return response(res, {
      status: HttpStatusCode.SEE_OTHER,
      message: "Reddit post already exists in database",
      data: {
        redditPostId: redditPostId,
      },
    });
  }

  vid = await Video.create({
    redditPostId: redditPostId,
    redditPostTitle: redditPostTitle,
    mirrorUrl: mirrorUrl,
  });
  vid.save();

  return response(res, {
    status: HttpStatusCode.CREATED,
    message: "Successfully created mirror in database",
    data: {
      redditPostId: redditPostId,
      redditPostTitle: redditPostTitle,
      mirrorUrl: mirrorUrl,
    },
  });
});

router.get("/all", async (req, res) => {
  const videos = await Video.find({
    order: {
      createdAt: "DESC",
    },
  });

  return response(res, {
    data: {
      count: videos.length,
      videos: videos,
    },
  });
});

router.get("/:redditPostId", async (req, res) => {
  let redditPostId = req.params.redditPostId;

  if (!redditPostId) {
    return response(res, {
      status: HttpStatusCode.UNPROCESSABLE_ENTITY,
      message: "redditPostId not provided",
    });
  }

  let vid = await Video.findOne({
    redditPostId: redditPostId,
  });

  if (!vid) {
    return response(res, {
      status: HttpStatusCode.NOT_FOUND,
      message: "Video not found in database",
      data: {
        redditPostId: redditPostId,
      },
    });
  }

  return response(res, {
    data: {
      redditPostId: vid.redditPostId,
      redditPostTitle: vid.redditPostTitle,
      mirrorUrl: vid.mirrorUrl,
    },
  });
});

router.delete("/:redditPostId", async (req, res) => {
  let redditPostId = req.params.redditPostId;

  if (!redditPostId) {
    return response(res, {
      status: HttpStatusCode.UNPROCESSABLE_ENTITY,
      message: "redditPostId not provided",
    });
  }

  let vid = await Video.findOne({
    redditPostId: redditPostId,
  });

  if (!vid) {
    return response(res, {
      status: HttpStatusCode.NOT_FOUND,
      message: "Video not found in database",
      data: {
        redditPostId: redditPostId,
      },
    });
  }

  try {
    await vid.remove();
  } catch (e) {
    return response(res, {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      message: "Internal error while processing deletion",
      data: {
        redditPostId: redditPostId,
        message: e,
      },
    });
  }

  return response(res, {
    data: {
      redditPostId: vid.redditPostId,
      redditPostTitle: vid.redditPostTitle,
      mirrorUrl: vid.mirrorUrl,
    },
  });
});

export const PrivateVideoApi: Router = router;
