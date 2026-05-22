import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Session from "../models/Session";
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  extractAuthToken,
  hashSessionToken,
} from "../lib/jwtAuth";

/**
 * Attaches req.user when a valid session token is present; otherwise continues as a guest.
 */
const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractAuthToken(req);
  if (!token) {
    next();
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Server configuration error" });
    return;
  }

  try {
    jwt.verify(token, secret, {
      audience: AUTH_TOKEN_AUDIENCE,
      issuer: AUTH_TOKEN_ISSUER,
    });

    const session = await Session.findOne({
      $or: [{ token }, { token: hashSessionToken(token) }],
    }).exec();
    if (!session?.user) {
      next();
      return;
    }

    const user = await User.findById(session.user)
      .select("_id email name alias role adminOf organizerOf")
      .exec();
    if (!user) {
      next();
      return;
    }

    req.user = user;
    next();
  } catch {
    next();
  }
};

export default optionalAuthenticate;
