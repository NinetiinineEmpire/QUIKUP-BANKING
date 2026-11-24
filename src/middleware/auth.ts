import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySignedToken } from '../lib/session-token.ts';

export interface AuthUser {
  uid: string;
  email?: string;
  name?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.slice(7).trim();

  // First check QUIKUP HMAC session token (for email/password sessions)
  const sessionPayload = verifySignedToken(token);
  if (
    sessionPayload &&
    sessionPayload.purpose === 'session' &&
    typeof sessionPayload.uid === 'string'
  ) {
    req.user = {
      uid: sessionPayload.uid,
      email: typeof sessionPayload.email === 'string' ? sessionPayload.email : undefined,
      name: typeof sessionPayload.name === 'string' ? sessionPayload.name : undefined,
    };
    next();
    return;
  }

  // Fallback to Firebase ID Token verification (Google Sign-In)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
