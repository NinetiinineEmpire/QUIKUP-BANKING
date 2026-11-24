import type { NextFunction, Request, Response } from 'express';
import { getUserRecord, isInitialAdminEmail } from '../db/banking.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySignedToken } from '../lib/session-token.ts';

export interface AuthUser {
  uid: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  isAdmin?: boolean;
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
      emailVerified: false,
    };
    next();
    return;
  }

  // Fallback to Firebase ID Token verification (Google Sign-In)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: typeof decodedToken.name === 'string' ? decodedToken.name : undefined,
      emailVerified: Boolean(decodedToken.email_verified),
    };
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireAdminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const sessionPayload = verifySignedToken(token);

  if (sessionPayload) {
    if (sessionPayload.purpose === 'admin_session') {
      req.user = {
        uid: 'admin_console',
        email: typeof sessionPayload.email === 'string' ? sessionPayload.email : 'Admin Desk',
        name: 'QUIKUP Administrator',
        isAdmin: true,
      };
      next();
      return;
    }

    if (sessionPayload.purpose === 'session' && typeof sessionPayload.uid === 'string') {
      try {
        const userRow = await getUserRecord(sessionPayload.uid);
        if (userRow && userRow.role === 'admin') {
          req.user = {
            uid: userRow.uid,
            email: userRow.email,
            name: userRow.fullName,
            isAdmin: true,
          };
          next();
          return;
        }
      } catch (error) {
        console.error('Admin DB role check failed:', error);
        res.status(500).json({ error: 'Unable to verify administrator privileges.' });
        return;
      }

      res.status(403).json({ error: 'Forbidden: Administrator access required.' });
      return;
    }
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userRow = await getUserRecord(decodedToken.uid);
    const isVerifiedInitialAdmin =
      Boolean(decodedToken.email_verified) && isInitialAdminEmail(decodedToken.email);

    if ((userRow && userRow.role === 'admin') || isVerifiedInitialAdmin) {
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: typeof decodedToken.name === 'string' ? decodedToken.name : undefined,
        emailVerified: Boolean(decodedToken.email_verified),
        isAdmin: true,
      };
      next();
      return;
    }

    res.status(403).json({ error: 'Forbidden: Administrator access required.' });
  } catch (error) {
    console.error('Error verifying admin token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired admin token.' });
  }
};
